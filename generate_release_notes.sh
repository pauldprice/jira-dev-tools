#!/bin/bash

# Gather Release Notes Generator
# 
# This script generates comprehensive release notes for the Gather webapp by analyzing
# git commits between the master and test branches. It identifies all changes waiting
# to be released from the test branch to production (master branch).
#
# Features:
# - Modular execution with resumable steps
# - Automatic ticket categorization (bug fixes, features, etc.)
# - Jira integration for ticket details
# - Progress tracking with visual indicators
# - Intermediate file caching for debugging
#
# Usage: ./generate_release_notes.sh [OPTIONS]
# Run with --help for detailed options

set -e

# Function to setup colors
setup_colors() {
    # Check if we should use colors
    local USE_COLOR="true"

    # Disable colors if:
    # - Output is not to a terminal
    # - NO_COLOR environment variable is set
    # - TERM is dumb
    # - --no-color flag was used
    if [[ ! -t 1 ]] || [[ -n "${NO_COLOR}" ]] || [[ "${TERM}" == "dumb" ]] || [[ "${FORCE_NO_COLOR}" == "true" ]]; then
        USE_COLOR="false"
    fi

    # Also check if running in CI/CD environments
    if [[ -n "${CI}" ]] || [[ -n "${CONTINUOUS_INTEGRATION}" ]] || [[ -n "${GITHUB_ACTIONS}" ]]; then
        USE_COLOR="false"
    fi

    if [[ "$USE_COLOR" == "true" ]]; then
        RED='\033[0;31m'
        GREEN='\033[0;32m'
        YELLOW='\033[1;33m'
        BLUE='\033[0;34m'
        CYAN='\033[0;36m'
        MAGENTA='\033[0;35m'
        BOLD='\033[1m'
        NC='\033[0m' # No Color
    else
        # No colors
        RED=''
        GREEN=''
        YELLOW=''
        BLUE=''
        CYAN=''
        MAGENTA=''
        BOLD=''
        NC=''
    fi
}

# Check for --no-color in arguments first
FORCE_NO_COLOR="false"
for arg in "$@"; do
    if [[ "$arg" == "--no-color" ]]; then
        FORCE_NO_COLOR="true"
        break
    fi
done

# Setup colors
setup_colors

# Configuration
SCRIPT_NAME=$(basename "$0")
VERSION="2.0"
DATE=$(date +"%Y-%m-%d")
TIME=$(date +"%H:%M:%S")
WORK_DIR=".release_notes_work"
FINAL_OUTPUT="release_notes_${DATE}.md"
PDF_OUTPUT="release_notes_${DATE}.pdf"

# Progress indicators
SPINNER_PID=""
function start_spinner {
    local msg="$1"
    echo -ne "${YELLOW}${msg}...${NC} "
    ( while true; do for X in '⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏'; do echo -en "\b$X"; sleep 0.1; done; done ) &
    SPINNER_PID=$!
}

function stop_spinner {
    if [[ -n $SPINNER_PID ]]; then
        kill $SPINNER_PID 2>/dev/null || true
        wait $SPINNER_PID 2>/dev/null || true
        echo -e "\b${GREEN}✓${NC}"
    fi
    SPINNER_PID=""
}

# Trap to ensure spinner stops on exit
trap 'stop_spinner' EXIT

# Display usage
function usage {
    echo -e "${BOLD}${BLUE}Gather Release Notes Generator v${VERSION}${NC}"
    echo ""
    echo -e "${BOLD}USAGE:${NC}"
    echo "    $SCRIPT_NAME [OPTIONS]"
    echo ""
    echo -e "${BOLD}OPTIONS:${NC}"
    echo -e "    ${CYAN}-h, --help${NC}              Show this help message"
    echo -e "    ${CYAN}-c, --clean${NC}             Clean intermediate files and exit"
    echo -e "    ${CYAN}-r, --resume${NC}            Resume from last successful step"
    echo -e "    ${CYAN}-s, --step STEP${NC}         Run specific step only"
    echo -e "    ${CYAN}-l, --list-steps${NC}        List all available steps"
    echo -e "    ${CYAN}-k, --keep${NC}              Keep intermediate files after completion"
    echo -e "    ${CYAN}-v, --verbose${NC}           Show detailed output"
    echo -e "    ${CYAN}-o, --output FILE${NC}       Specify output file (default: release_notes_YYYY-MM-DD.md)"
    echo -e "    ${CYAN}--no-color${NC}              Disable colored output"
    echo ""
    echo -e "${BOLD}STEPS:${NC}"
    echo -e "    ${MAGENTA}fetch${NC}       - Fetch commits between master and test"
    echo -e "    ${MAGENTA}extract${NC}     - Extract unique ticket numbers"
    echo -e "    ${MAGENTA}categorize${NC}  - Categorize tickets by type"
    echo -e "    ${MAGENTA}details${NC}     - Fetch ticket details (if available)"
    echo -e "    ${MAGENTA}analyze${NC}     - Analyze code changes with Claude CLI (optional)"
    echo -e "    ${MAGENTA}generate${NC}    - Generate final release notes"
    echo -e "    ${MAGENTA}pdf${NC}         - Convert release notes to PDF"
    echo -e "    ${MAGENTA}all${NC}         - Run all steps (default)"
    echo ""
    echo -e "${BOLD}EXAMPLES:${NC}"
    echo "    # Generate complete release notes with PDF"
    echo "    $SCRIPT_NAME"
    echo ""
    echo "    # Generate only the PDF from existing markdown"
    echo "    $SCRIPT_NAME --step pdf"
    echo ""
    echo "    # Run only the categorization step"
    echo "    $SCRIPT_NAME --step categorize"
    echo ""
    echo "    # Resume from last successful step"
    echo "    $SCRIPT_NAME --resume"
    echo ""
    echo "    # Clean up intermediate files"
    echo "    $SCRIPT_NAME --clean"
    echo ""
    echo "    # Keep intermediate files for debugging"
    echo "    $SCRIPT_NAME --keep --verbose"
    echo ""
    echo -e "${BOLD}ENVIRONMENT VARIABLES:${NC}"
    echo -e "    ${CYAN}ANTHROPIC_API_KEY${NC}   Required for Claude AI analysis (get from console.anthropic.com)"
}

# Initialize working directory
function init_work_dir {
    if [[ ! -d "$WORK_DIR" ]]; then
        mkdir -p "$WORK_DIR"
        echo -e "${GREEN}Created working directory: $WORK_DIR${NC}"
    fi
}

# Save progress
function save_progress {
    local step="$1"
    echo "$step" > "$WORK_DIR/.progress"
    echo -e "${CYAN}Progress saved: $step${NC}"
}

# Get last completed step
function get_last_step {
    if [[ -f "$WORK_DIR/.progress" ]]; then
        cat "$WORK_DIR/.progress"
    else
        echo "none"
    fi
}

# Clean intermediate files
function clean_workspace {
    echo -e "${YELLOW}Cleaning intermediate files...${NC}"
    if [[ -d "$WORK_DIR" ]]; then
        rm -rf "$WORK_DIR"
        echo -e "${GREEN}✓ Workspace cleaned${NC}"
    else
        echo -e "${CYAN}Nothing to clean${NC}"
    fi
}

# Step 1: Fetch commits
function step_fetch_commits {
    echo -e "\n${BOLD}${BLUE}=== Step 1: Fetching Commits ===${NC}"
    
    local output_file="$WORK_DIR/commits.txt"
    
    if [[ -f "$output_file" ]] && [[ "$FORCE" != "true" ]]; then
        echo -e "${CYAN}Using cached commits from $output_file${NC}"
        return 0
    fi
    
    start_spinner "Fetching commits between master and test"
    # Get commits that are in test but not in master
    # --no-merges excludes merge commits
    # master..test shows commits reachable from test but not from master
    # Make sure we're looking at the actual test branch, not local branches
    git log origin/master..origin/test --oneline --no-merges > "$output_file"
    
    # Also save commits with author information
    git log origin/master..origin/test --pretty=format:"%h %an | %s" --no-merges > "$WORK_DIR/commits_with_authors.txt"
    stop_spinner
    
    local count=$(wc -l < "$output_file" | tr -d ' ')
    echo -e "${GREEN}Found $count commits${NC}"
    
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${CYAN}First 5 commits:${NC}"
        head -5 "$output_file" | sed 's/^/  /'
    fi
    
    save_progress "fetch"
}

# Step 2: Extract tickets
function step_extract_tickets {
    echo -e "\n${BOLD}${BLUE}=== Step 2: Extracting Tickets ===${NC}"
    
    local input_file="$WORK_DIR/commits.txt"
    local output_file="$WORK_DIR/tickets.txt"
    
    if [[ ! -f "$input_file" ]]; then
        echo -e "${RED}Error: commits.txt not found. Run fetch step first.${NC}"
        return 1
    fi
    
    if [[ -f "$output_file" ]] && [[ "$FORCE" != "true" ]]; then
        echo -e "${CYAN}Using cached tickets from $output_file${NC}"
        return 0
    fi
    
    start_spinner "Extracting ticket numbers"
    grep -oE 'APP-[0-9]+' "$input_file" | sort -u > "$output_file"
    stop_spinner
    
    local count=$(wc -l < "$output_file" | tr -d ' ')
    echo -e "${GREEN}Found $count unique tickets${NC}"
    
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${CYAN}Tickets:${NC}"
        cat "$output_file" | sed 's/^/  /'
    fi
    
    save_progress "extract"
}

# Step 3: Categorize tickets
function step_categorize_tickets {
    echo -e "\n${BOLD}${BLUE}=== Step 3: Categorizing Tickets ===${NC}"
    
    local commits_file="$WORK_DIR/commits.txt"
    local tickets_file="$WORK_DIR/tickets.txt"
    local output_file="$WORK_DIR/categories.json"
    
    if [[ ! -f "$commits_file" ]] || [[ ! -f "$tickets_file" ]]; then
        echo -e "${RED}Error: Required files not found. Run previous steps first.${NC}"
        return 1
    fi
    
    if [[ -f "$output_file" ]] && [[ "$FORCE" != "true" ]]; then
        echo -e "${CYAN}Using cached categories from $output_file${NC}"
        return 0
    fi
    
    # Initialize JSON structure
    echo '{
  "bug_fixes": [],
  "new_features": [],
  "ui_updates": [],
  "api_changes": [],
  "refactoring": [],
  "other": []
}' > "$output_file"
    
    local total=$(wc -l < "$tickets_file" | tr -d ' ')
    local current=0
    
    echo -e "${YELLOW}Categorizing $total tickets...${NC}"
    
    while IFS= read -r ticket; do
        current=$((current + 1))
        echo -ne "\r${YELLOW}Progress: $current/$total${NC} "
        
        # Get commits for this ticket
        local ticket_commits=$(grep "$ticket" "$commits_file")
        
        # Categorize based on commit messages
        local category="other"
        if echo "$ticket_commits" | grep -qi "fix\|bug\|error\|crash\|issue"; then
            category="bug_fixes"
        elif echo "$ticket_commits" | grep -qi "add\|new\|implement\|create"; then
            category="new_features"
        elif echo "$ticket_commits" | grep -qi "ui\|style\|css\|design\|layout"; then
            category="ui_updates"
        elif echo "$ticket_commits" | grep -qi "api\|endpoint\|route\|controller"; then
            category="api_changes"
        elif echo "$ticket_commits" | grep -qi "refactor\|cleanup\|optimize"; then
            category="refactoring"
        fi
        
        # Update JSON file
        jq --arg ticket "$ticket" --arg cat "$category" \
           '.[$cat] += [$ticket]' "$output_file" > "$output_file.tmp" && mv "$output_file.tmp" "$output_file"
    done < "$tickets_file"
    
    echo -e "\r${GREEN}✓ Categorization complete${NC}      "
    
    # Show summary
    echo -e "\n${CYAN}Category Summary:${NC}"
    echo -e "  Bug Fixes:     $(jq '.bug_fixes | length' "$output_file")"
    echo -e "  New Features:  $(jq '.new_features | length' "$output_file")"
    echo -e "  UI Updates:    $(jq '.ui_updates | length' "$output_file")"
    echo -e "  API Changes:   $(jq '.api_changes | length' "$output_file")"
    echo -e "  Refactoring:   $(jq '.refactoring | length' "$output_file")"
    echo -e "  Other:         $(jq '.other | length' "$output_file")"
    
    save_progress "categorize"
}

# Step 4: Fetch ticket details
function step_fetch_details {
    echo -e "\n${BOLD}${BLUE}=== Step 4: Fetching Ticket Details ===${NC}"
    
    local tickets_file="$WORK_DIR/tickets.txt"
    local output_file="$WORK_DIR/ticket_details.json"
    
    if [[ ! -f "$tickets_file" ]]; then
        echo -e "${RED}Error: tickets.txt not found. Run extract step first.${NC}"
        return 1
    fi
    
    if [[ -f "$output_file" ]] && [[ "$FORCE" != "true" ]]; then
        echo -e "${CYAN}Using cached details from $output_file${NC}"
        return 0
    fi
    
    # Check if fetch_jira_ticket.sh is available
    if ! command -v fetch_jira_ticket.sh &> /dev/null; then
        echo -e "${YELLOW}fetch_jira_ticket.sh not found. Skipping detailed ticket fetching.${NC}"
        echo '{}' > "$output_file"
        save_progress "details"
        return 0
    fi
    
    echo '{}' > "$output_file"
    
    local total=$(wc -l < "$tickets_file" | tr -d ' ')
    local current=0
    local successful=0
    
    echo -e "${YELLOW}Fetching details for $total tickets...${NC}"
    
    while IFS= read -r ticket; do
        current=$((current + 1))
        echo -ne "\r${YELLOW}Progress: $current/$total (${successful} successful)${NC} "
        
        # Try to fetch ticket data
        if ticket_data=$(fetch_jira_ticket.sh "$ticket" 2>/dev/null); then
            if echo "$ticket_data" | jq . >/dev/null 2>&1; then
                jq --arg ticket "$ticket" --argjson data "$ticket_data" \
                   '.[$ticket] = $data' "$output_file" > "$output_file.tmp" && mv "$output_file.tmp" "$output_file"
                successful=$((successful + 1))
            fi
        fi
    done < "$tickets_file"
    
    echo -e "\r${GREEN}✓ Details fetched for $successful/$total tickets${NC}      "
    
    save_progress "details"
}

# Step 5: Analyze code changes with Claude (optional)
function step_analyze_code {
    echo -e "\n${BOLD}${BLUE}=== Step 5: Analyzing Code Changes with Claude ===${NC}"
    
    local tickets_file="$WORK_DIR/tickets.txt"
    local commits_file="$WORK_DIR/commits.txt"
    local output_file="$WORK_DIR/claude_analysis.json"
    
    if [[ ! -f "$tickets_file" ]] || [[ ! -f "$commits_file" ]]; then
        echo -e "${RED}Error: Required files not found. Run previous steps first.${NC}"
        return 1
    fi
    
    if [[ -f "$output_file" ]] && [[ "$FORCE" != "true" ]]; then
        echo -e "${CYAN}Using cached analysis from $output_file${NC}"
        return 0
    fi
    
    # Check if ANTHROPIC_API_KEY is set
    if [[ -z "${ANTHROPIC_API_KEY}" ]]; then
        echo -e "${YELLOW}ANTHROPIC_API_KEY not set. Skipping code analysis.${NC}"
        echo -e "${YELLOW}Set your API key with: export ANTHROPIC_API_KEY='your-api-key'${NC}"
        echo '{}' > "$output_file"
        save_progress "analyze"
        return 0
    fi
    
    echo '{}' > "$output_file"
    
    local total=$(wc -l < "$tickets_file" | tr -d ' ')
    local current=0
    
    echo -e "${YELLOW}Analyzing code changes for $total tickets...${NC}"
    echo -e "${CYAN}This may take a few minutes...${NC}"
    
    while IFS= read -r ticket; do
        current=$((current + 1))
        echo -ne "\r${YELLOW}Progress: $current/$total${NC} "
        
        if [[ "$VERBOSE" == "true" ]]; then
            echo -e "\n${CYAN}Analyzing $ticket...${NC}"
        fi
        
        # Get all commits for this ticket
        local ticket_commits=$(grep "$ticket" "$commits_file" | head -10)
        
        # Create a prompt for Claude
        local prompt="Analyze the following git commits for Jira ticket $ticket and provide a concise analysis.

Git commits:
$ticket_commits

Please provide a structured analysis with:
1. A brief summary of what changed (2-3 sentences)
2. Key implementation details
3. Specific testing recommendations based on the changes
4. Any potential risks or areas of concern

Important: Respond ONLY with a valid JSON object in this exact format:
{
  \"summary\": \"Brief description of changes\",
  \"details\": \"Key implementation details\",
  \"testing_notes\": \"Specific testing recommendations\",
  \"risks\": \"Potential risks or concerns\"
}"
        
        # Prepare the API request
        local request_body=$(jq -n \
            --arg prompt "$prompt" \
            '{
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 1024,
                messages: [
                    {
                        role: "user",
                        content: $prompt
                    },
                    {
                        role: "assistant",
                        content: "{"
                    }
                ]
            }')
        
        # Make the API call
        local response=""
        if [[ "$VERBOSE" == "true" ]]; then
            echo -e "${CYAN}Calling Claude API for $ticket...${NC}"
        fi
        
        response=$(curl -s -X POST https://api.anthropic.com/v1/messages \
            -H "x-api-key: $ANTHROPIC_API_KEY" \
            -H "anthropic-version: 2023-06-01" \
            -H "content-type: application/json" \
            -d "$request_body" 2>/dev/null)
        
        if [[ -n "$response" ]]; then
            # Check for API errors
            if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
                if [[ "$VERBOSE" == "true" ]]; then
                    local error_msg=$(echo "$response" | jq -r '.error.message // .error' 2>/dev/null)
                    echo -e "${RED}API Error for $ticket: $error_msg${NC}"
                fi
                continue
            fi
            
            # Extract the content from the API response
            local content=$(echo "$response" | jq -r '.content[0].text // ""' 2>/dev/null)
            
            if [[ -n "$content" ]]; then
                # The content should start with the rest of the JSON (we pre-filled with "{")
                local full_json="{${content}"
                
                # Validate and save the JSON
                if json_analysis=$(echo "$full_json" | jq . 2>/dev/null); then
                    jq --arg ticket "$ticket" --argjson data "$json_analysis" \
                       '.[$ticket] = $data' "$output_file" > "$output_file.tmp" && mv "$output_file.tmp" "$output_file"
                    
                    if [[ "$VERBOSE" == "true" ]]; then
                        echo -e "${GREEN}Successfully analyzed $ticket${NC}"
                    fi
                else
                    if [[ "$VERBOSE" == "true" ]]; then
                        echo -e "${YELLOW}Failed to parse JSON for $ticket${NC}"
                    fi
                fi
            fi
        else
            if [[ "$VERBOSE" == "true" ]]; then
                echo -e "${RED}No response for $ticket${NC}"
            fi
        fi
    done < "$tickets_file"
    
    echo -e "\r${GREEN}✓ Code analysis complete${NC}      "
    
    save_progress "analyze"
}

# Step 6: Generate release notes
function step_generate_notes {
    echo -e "\n${BOLD}${BLUE}=== Step 6: Generating Release Notes ===${NC}"
    
    local commits_file="$WORK_DIR/commits.txt"
    local tickets_file="$WORK_DIR/tickets.txt"
    local categories_file="$WORK_DIR/categories.json"
    local details_file="$WORK_DIR/ticket_details.json"
    local analysis_file="$WORK_DIR/claude_analysis.json"
    
    if [[ ! -f "$commits_file" ]] || [[ ! -f "$tickets_file" ]] || [[ ! -f "$categories_file" ]]; then
        echo -e "${RED}Error: Required files not found. Run previous steps first.${NC}"
        return 1
    fi
    
    # Create files if they don't exist
    [[ ! -f "$details_file" ]] && echo '{}' > "$details_file"
    [[ ! -f "$analysis_file" ]] && echo '{}' > "$analysis_file"
    
    start_spinner "Generating release notes"
    
    # Get counts
    local commit_count=$(wc -l < "$commits_file" | tr -d ' ')
    local ticket_count=$(wc -l < "$tickets_file" | tr -d ' ')
    
    # Start building release notes
    cat > "$FINAL_OUTPUT" << EOF
# Gather Release Notes - $DATE

**Generated:** $TIME  
**Version:** Generated by Release Notes Generator v${VERSION}  
**Branch:** test (compared to master)  
**Total Commits:** $commit_count  
**Total Tickets:** $ticket_count  

## Executive Summary

This release candidate includes $ticket_count tickets with the following distribution:

EOF
    
    # Calculate category counts first
    local bug_count=$(jq '.bug_fixes | length' "$categories_file")
    local feature_count=$(jq '.new_features | length' "$categories_file")
    local ui_count=$(jq '.ui_updates | length' "$categories_file")
    local api_count=$(jq '.api_changes | length' "$categories_file")
    local refactor_count=$(jq '.refactoring | length' "$categories_file")
    local other_count=$(jq '.other | length' "$categories_file")
    
    # If API key is available, generate an executive summary
    if [[ -n "${ANTHROPIC_API_KEY}" ]]; then
        echo -e "${CYAN}Generating executive summary with Claude...${NC}"
        
        # Build a comprehensive summary prompt with actual ticket details
        local ticket_summaries=""
        
        # Get ticket details and analysis for context
        while IFS= read -r ticket; do
            local title=$(jq -r ".\"$ticket\".title // .\"$ticket\".fields.summary // \"\"" "$details_file" 2>/dev/null)
            local analysis_summary=$(jq -r ".\"$ticket\".summary // \"\"" "$analysis_file" 2>/dev/null)
            
            if [[ -n "$title" && "$title" != "null" ]] || [[ -n "$analysis_summary" && "$analysis_summary" != "null" ]]; then
                ticket_summaries+="$ticket"
                [[ -n "$title" && "$title" != "null" ]] && ticket_summaries+=": $title"
                [[ -n "$analysis_summary" && "$analysis_summary" != "null" ]] && ticket_summaries+=" - $analysis_summary"
                ticket_summaries+=$'\n'
            fi
        done < "$tickets_file"
        
        local summary_prompt="Based on these tickets and their changes, write a 3-4 sentence executive summary of this release candidate highlighting the most important changes and any areas requiring special attention during testing. Be concise and focus on the key impacts.

Categories: Bug Fixes: $bug_count, New Features: $feature_count, UI Updates: $ui_count, API Changes: $api_count, Refactoring: $refactor_count, Other: $other_count

Ticket Details:
$ticket_summaries"
        
        # Prepare the API request for executive summary
        local summary_request=$(jq -n \
            --arg prompt "$summary_prompt" \
            '{
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 512,
                messages: [
                    {
                        role: "user",
                        content: $prompt
                    }
                ]
            }')
        
        local summary_response=$(curl -s -X POST https://api.anthropic.com/v1/messages \
            -H "x-api-key: $ANTHROPIC_API_KEY" \
            -H "anthropic-version: 2023-06-01" \
            -H "content-type: application/json" \
            -d "$summary_request" 2>/dev/null)
        
        if [[ -n "$summary_response" ]]; then
            # Extract the summary text
            local exec_summary=$(echo "$summary_response" | jq -r '.content[0].text // ""' 2>/dev/null)
            
            if [[ -n "$exec_summary" ]] && [[ "$exec_summary" != "null" ]]; then
                # Remove redundant "Executive Summary for Release Candidate:" prefix if present
                exec_summary=$(echo "$exec_summary" | sed 's/^Executive Summary for Release Candidate:[[:space:]]*//I')
                
                cat >> "$FINAL_OUTPUT" << EOF

### Release Highlights

$exec_summary

EOF
            fi
        fi
    fi
    
    # Add category summary with emoji
    
    cat >> "$FINAL_OUTPUT" << EOF
| Category | Count | Description |
|----------|-------|-------------|
| 🐛 Bug Fixes | $bug_count | Issues resolved and errors corrected |
| ✨ New Features | $feature_count | New functionality and enhancements |
| 🎨 UI Updates | $ui_count | Visual and interface improvements |
| 🔧 API Changes | $api_count | Backend and API modifications |
| ♻️ Refactoring | $refactor_count | Code quality improvements |
| 📦 Other | $other_count | Miscellaneous changes |

## Table of Contents

1. [Testing Guidelines](#testing-guidelines)
2. [Bug Fixes](#-bug-fixes)
3. [New Features](#-new-features)
4. [UI Updates](#-ui-updates)
5. [API Changes](#-api-changes)
6. [Refactoring](#️-refactoring)
7. [Other Changes](#-other-changes)
8. [Full Commit List](#full-commit-list)

## Testing Guidelines

### Pre-Release Checklist
- [ ] All unit tests passing
- [ ] Integration tests completed
- [ ] Manual smoke testing performed
- [ ] Performance benchmarks acceptable
- [ ] No critical console errors

### Focus Areas by Category
- **Bug Fixes**: Verify original issues are resolved, test for regressions
- **New Features**: Full functionality testing with edge cases
- **UI Updates**: Cross-browser testing, mobile responsiveness
- **API Changes**: Endpoint testing, backward compatibility checks
- **Refactoring**: Regression testing, performance comparison

---

EOF
    
    # Generate sections for each category
    local categories=("bug_fixes" "new_features" "ui_updates" "api_changes" "refactoring" "other")
    local headers=("🐛 Bug Fixes" "✨ New Features" "🎨 UI Updates" "🔧 API Changes" "♻️ Refactoring" "📦 Other Changes")
    
    for i in "${!categories[@]}"; do
        local category="${categories[$i]}"
        local header="${headers[$i]}"
        local tickets=$(jq -r ".${category}[]" "$categories_file" 2>/dev/null)
        
        if [[ -n "$tickets" ]]; then
            echo "## $header" >> "$FINAL_OUTPUT"
            echo "" >> "$FINAL_OUTPUT"
            
            while IFS= read -r ticket; do
                [[ -z "$ticket" ]] && continue
                
                # Generate ticket section
                generate_ticket_section "$ticket" "$category"
            done <<< "$tickets"
        fi
    done
    
    # Add full commit list
    cat >> "$FINAL_OUTPUT" << 'EOF'

## Full Commit List

<details>
<summary>Click to expand all commits</summary>

```
EOF
    
    cat "$commits_file" >> "$FINAL_OUTPUT"
    
    cat >> "$FINAL_OUTPUT" << 'EOF'
```

</details>

---

*Generated by Release Notes Generator v2.0*  
*For questions or improvements, contact the development team*
EOF
    
    stop_spinner
    
    echo -e "${GREEN}✓ Release notes generated: $FINAL_OUTPUT${NC}"
    
    save_progress "generate"
}

# Step 7: Generate PDF
function step_generate_pdf {
    echo -e "\n${BOLD}${BLUE}=== Step 7: Generating PDF ===${NC}"
    
    if [[ ! -f "$FINAL_OUTPUT" ]]; then
        echo -e "${RED}Error: $FINAL_OUTPUT not found. Run generate step first.${NC}"
        return 1
    fi
    
    # Check if pandoc is available
    if ! command -v pandoc &> /dev/null; then
        echo -e "${YELLOW}Pandoc not found. Skipping PDF generation.${NC}"
        echo -e "${YELLOW}Install with: brew install pandoc${NC}"
        save_progress "pdf"
        return 0
    fi
    
    start_spinner "Converting markdown to PDF"
    
    # Create a temporary CSS file for styling
    local css_file="$WORK_DIR/release_notes.css"
    cat > "$css_file" << 'EOF'
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: #333;
    line-height: 1.6;
    margin: 0;
    padding: 0;
}

h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
}

h1 { font-size: 24pt; color: #1a1a1a; }
h2 { font-size: 18pt; color: #2a2a2a; }
h3 { font-size: 14pt; color: #3a3a3a; }

pre {
    background-color: #f5f5f5;
    padding: 10px;
    border-radius: 4px;
    font-size: 9pt;
    overflow-x: auto;
}

code {
    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 9pt;
    background-color: #f0f0f0;
    padding: 2px 4px;
    border-radius: 2px;
}

pre code {
    background-color: transparent;
    padding: 0;
}

table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
}

table th, table td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}

table th {
    background-color: #f5f5f5;
    font-weight: 600;
}

a {
    color: #0969da;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

blockquote {
    border-left: 4px solid #ddd;
    margin: 0;
    padding-left: 1em;
    color: #666;
}

@page {
    size: letter;
    margin: 1in;
}

.page-break {
    page-break-after: always;
}

details {
    margin: 1em 0;
}

summary {
    cursor: pointer;
    font-weight: 600;
}
EOF
    
    # Convert to PDF using pandoc with WeasyPrint
    if pandoc "$FINAL_OUTPUT" \
        -o "$PDF_OUTPUT" \
        --pdf-engine=weasyprint \
        --css="$css_file" \
        --metadata title="Gather Release Notes - $DATE" \
        --metadata date="$DATE" \
        --toc \
        --toc-depth=2 \
        2>/dev/null; then
        stop_spinner
        echo -e "${GREEN}✓ PDF generated: $PDF_OUTPUT${NC}"
        
        # Get file size
        local size=$(ls -lh "$PDF_OUTPUT" | awk '{print $5}')
        echo -e "${CYAN}PDF size: $size${NC}"
    else
        stop_spinner
        echo -e "${RED}✗ PDF generation failed${NC}"
        echo -e "${YELLOW}Trying fallback method without TOC...${NC}"
        
        # Try without TOC and simpler options
        if pandoc "$FINAL_OUTPUT" \
            -o "$PDF_OUTPUT" \
            --pdf-engine=weasyprint \
            --css="$css_file" \
            2>/dev/null; then
            echo -e "${GREEN}✓ PDF generated (without TOC): $PDF_OUTPUT${NC}"
        else
            echo -e "${RED}PDF generation failed. Please check pandoc installation.${NC}"
            return 1
        fi
    fi
    
    save_progress "pdf"
}

# Generate individual ticket section
function generate_ticket_section {
    local ticket="$1"
    local category="$2"
    
    echo "### $ticket" >> "$FINAL_OUTPUT"
    
    # Add Jira link
    echo "**[View in Jira](https://gatherly.atlassian.net/browse/$ticket)**" >> "$FINAL_OUTPUT"
    echo "" >> "$FINAL_OUTPUT"
    
    # Try to get details from cached data
    local details=$(jq -r ".\"$ticket\"" "$WORK_DIR/ticket_details.json" 2>/dev/null)
    
    if [[ "$details" != "null" ]] && [[ -n "$details" ]]; then
        # Handle different Jira response formats
        local title=$(echo "$details" | jq -r '.title // .fields.summary // ""' 2>/dev/null)
        local status=$(echo "$details" | jq -r '.status // .fields.status.name // ""' 2>/dev/null)
        
        # Note: fetch_jira_ticket.sh doesn't return assignee info
        [[ -n "$title" && "$title" != "null" ]] && echo "**Title:** $title  " >> "$FINAL_OUTPUT"
        
        # Only show status if available
        [[ -n "$status" && "$status" != "null" ]] && echo "**Status:** $status  " >> "$FINAL_OUTPUT"
    else
        # Fall back to commit message
        local first_commit=$(grep "$ticket" "$WORK_DIR/commits.txt" | head -1)
        local commit_msg=$(echo "$first_commit" | sed "s/^[^ ]* $ticket[: -]*//")
        [[ -n "$commit_msg" ]] && echo "**Summary:** $commit_msg  " >> "$FINAL_OUTPUT"
    fi
    
    # Extract unique authors for this ticket
    local authors=$(grep "$ticket" "$WORK_DIR/commits_with_authors.txt" 2>/dev/null | \
                    awk -F' \\| ' '{print $1}' | \
                    awk '{$1=""; print $0}' | \
                    sed 's/^ //' | \
                    sort -u | \
                    paste -sd ', ' -)
    
    [[ -n "$authors" ]] && echo "**Authors:** $authors  " >> "$FINAL_OUTPUT"
    
    echo "" >> "$FINAL_OUTPUT"
    
    # Add commits
    echo "**Commits:**" >> "$FINAL_OUTPUT"
    echo '```' >> "$FINAL_OUTPUT"
    grep "$ticket" "$WORK_DIR/commits.txt" | head -5 >> "$FINAL_OUTPUT"
    
    local commit_count=$(grep -c "$ticket" "$WORK_DIR/commits.txt")
    if [[ $commit_count -gt 5 ]]; then
        echo "... and $((commit_count - 5)) more commits" >> "$FINAL_OUTPUT"
    fi
    echo '```' >> "$FINAL_OUTPUT"
    
    # Try to get Claude analysis
    local analysis=$(jq -r ".\"$ticket\"" "$WORK_DIR/claude_analysis.json" 2>/dev/null)
    
    # Add analysis results if available
    if [[ "$analysis" != "null" ]] && [[ -n "$analysis" ]]; then
        local claude_summary=$(echo "$analysis" | jq -r '.summary // ""' 2>/dev/null)
        local claude_details=$(echo "$analysis" | jq -r '.details // ""' 2>/dev/null)
        local claude_testing=$(echo "$analysis" | jq -r '.testing_notes // ""' 2>/dev/null)
        local claude_risks=$(echo "$analysis" | jq -r '.risks // ""' 2>/dev/null)
        
        if [[ -n "$claude_summary" && "$claude_summary" != "null" ]]; then
            echo "" >> "$FINAL_OUTPUT"
            echo "**Code Analysis Summary:**" >> "$FINAL_OUTPUT"
            echo "$claude_summary" >> "$FINAL_OUTPUT"
        fi
        
        if [[ -n "$claude_details" && "$claude_details" != "null" ]]; then
            echo "" >> "$FINAL_OUTPUT"
            echo "**Implementation Details:**" >> "$FINAL_OUTPUT"
            echo "$claude_details" >> "$FINAL_OUTPUT"
        fi
    fi
    
    # Add testing notes
    echo "" >> "$FINAL_OUTPUT"
    echo "**Testing Notes:**" >> "$FINAL_OUTPUT"
    
    # Use Claude's testing notes if available
    if [[ -n "$claude_testing" && "$claude_testing" != "null" ]]; then
        echo "$claude_testing" >> "$FINAL_OUTPUT"
    else
        # Fall back to category-based testing notes
        case "$category" in
            "bug_fixes")
                echo "- Verify the reported issue is resolved" >> "$FINAL_OUTPUT"
                echo "- Test edge cases around the fix" >> "$FINAL_OUTPUT"
                echo "- Check for regression in related functionality" >> "$FINAL_OUTPUT"
                ;;
            "new_features")
                echo "- Test all new functionality thoroughly" >> "$FINAL_OUTPUT"
                echo "- Verify UI/UX matches specifications" >> "$FINAL_OUTPUT"
                echo "- Check permissions and access controls" >> "$FINAL_OUTPUT"
                ;;
            "ui_updates")
                echo "- Visual regression testing required" >> "$FINAL_OUTPUT"
                echo "- Test across all supported browsers" >> "$FINAL_OUTPUT"
                echo "- Verify mobile responsiveness" >> "$FINAL_OUTPUT"
                ;;
            "api_changes")
                echo "- Test all affected endpoints" >> "$FINAL_OUTPUT"
                echo "- Verify backward compatibility" >> "$FINAL_OUTPUT"
                echo "- Check error handling and validation" >> "$FINAL_OUTPUT"
                ;;
            "refactoring")
                echo "- Full regression testing required" >> "$FINAL_OUTPUT"
                echo "- Compare performance metrics" >> "$FINAL_OUTPUT"
                echo "- Verify no behavior changes" >> "$FINAL_OUTPUT"
                ;;
            *)
                echo "- General testing required" >> "$FINAL_OUTPUT"
                ;;
        esac
    fi
    
    # Add risks if available
    if [[ -n "$claude_risks" && "$claude_risks" != "null" ]]; then
        echo "" >> "$FINAL_OUTPUT"
        echo "**Potential Risks:**" >> "$FINAL_OUTPUT"
        echo "$claude_risks" >> "$FINAL_OUTPUT"
    fi
    
    echo "" >> "$FINAL_OUTPUT"
    echo "---" >> "$FINAL_OUTPUT"
    echo "" >> "$FINAL_OUTPUT"
}

# Main execution logic
function main {
    local COMMAND="all"
    local RESUME="false"
    local KEEP="false"
    local FORCE="false"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            --no-color)
                # Already handled above
                shift
                ;;
            -c|--clean)
                clean_workspace
                exit 0
                ;;
            -r|--resume)
                RESUME="true"
                shift
                ;;
            -s|--step)
                COMMAND="$2"
                shift 2
                ;;
            -l|--list-steps)
                echo -e "${BOLD}Available steps:${NC}"
                echo -e "  ${MAGENTA}fetch${NC}       - Fetch commits between master and test"
                echo -e "  ${MAGENTA}extract${NC}     - Extract unique ticket numbers"
                echo -e "  ${MAGENTA}categorize${NC}  - Categorize tickets by type"
                echo -e "  ${MAGENTA}details${NC}     - Fetch ticket details (if available)"
                echo -e "  ${MAGENTA}analyze${NC}     - Analyze code changes with Claude CLI (optional)"
                echo -e "  ${MAGENTA}generate${NC}    - Generate final release notes"
                echo -e "  ${MAGENTA}pdf${NC}         - Convert release notes to PDF"
                echo -e "  ${MAGENTA}all${NC}         - Run all steps (default)"
                exit 0
                ;;
            -k|--keep)
                KEEP="true"
                shift
                ;;
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            -o|--output)
                FINAL_OUTPUT="$2"
                shift 2
                ;;
            -f|--force)
                FORCE="true"
                shift
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                usage
                exit 1
                ;;
        esac
    done
    
    # Show header
    echo -e "${BOLD}${BLUE}╔═══════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}║   Gather Release Notes Generator v${VERSION}   ║${NC}"
    echo -e "${BOLD}${BLUE}╚═══════════════════════════════════════════╝${NC}"
    echo ""
    
    # Initialize working directory
    init_work_dir
    
    # Determine starting point
    local start_step="fetch"
    if [[ "$RESUME" == "true" ]]; then
        local last_step=$(get_last_step)
        case "$last_step" in
            "fetch") start_step="extract" ;;
            "extract") start_step="categorize" ;;
            "categorize") start_step="details" ;;
            "details") start_step="analyze" ;;
            "analyze") start_step="generate" ;;
            "generate") start_step="pdf" ;;
            "pdf") 
                echo -e "${GREEN}All steps completed! Nothing to resume.${NC}"
                exit 0
                ;;
            *)
                echo -e "${YELLOW}No previous progress found. Starting from beginning.${NC}"
                ;;
        esac
        echo -e "${CYAN}Resuming from step: $start_step${NC}"
    fi
    
    # Execute requested command
    case "$COMMAND" in
        "all")
            # Run all steps from start_step
            local steps=("fetch" "extract" "categorize" "details" "analyze" "generate" "pdf")
            local run="false"
            for step in "${steps[@]}"; do
                [[ "$step" == "$start_step" ]] && run="true"
                if [[ "$run" == "true" ]]; then
                    case "$step" in
                        "fetch") step_fetch_commits ;;
                        "extract") step_extract_tickets ;;
                        "categorize") step_categorize_tickets ;;
                        "details") step_fetch_details ;;
                        "analyze") step_analyze_code ;;
                        "generate") step_generate_notes ;;
                        "pdf") step_generate_pdf ;;
                    esac
                fi
            done
            ;;
        "fetch"|"extract"|"categorize"|"details"|"analyze"|"generate"|"pdf")
            # Run specific step
            case "$COMMAND" in
                "fetch") step_fetch_commits ;;
                "extract") step_extract_tickets ;;
                "categorize") step_categorize_tickets ;;
                "details") step_fetch_details ;;
                "analyze") step_analyze_code ;;
                "generate") step_generate_notes ;;
                "pdf") step_generate_pdf ;;
            esac
            ;;
        *)
            echo -e "${RED}Unknown step: $COMMAND${NC}"
            exit 1
            ;;
    esac
    
    # Show completion message for 'all', 'generate', or 'pdf' commands
    if [[ "$COMMAND" == "all" || "$COMMAND" == "generate" || "$COMMAND" == "pdf" ]] && [[ -f "$FINAL_OUTPUT" ]]; then
        local line_count=$(wc -l < "$FINAL_OUTPUT" | tr -d ' ')
        echo ""
        echo -e "${BOLD}${GREEN}═══════════════════════════════════════════${NC}"
        echo -e "${BOLD}${GREEN}✨ Release Notes Generated Successfully! ✨${NC}"
        echo -e "${BOLD}${GREEN}═══════════════════════════════════════════${NC}"
        echo ""
        echo -e "${CYAN}Output files:${NC}"
        echo -e "  • Markdown: $FINAL_OUTPUT (${line_count} lines)"
        if [[ -f "$PDF_OUTPUT" ]]; then
            local pdf_size=$(ls -lh "$PDF_OUTPUT" | awk '{print $5}')
            echo -e "  • PDF: $PDF_OUTPUT (${pdf_size})"
        fi
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "1. Review the generated notes"
        echo "2. Make any manual adjustments"
        echo "3. Share with QA team"
    fi
    
    # Clean up if requested (only after completing all steps, generate, or pdf)
    if [[ "$KEEP" != "true" ]] && [[ -d "$WORK_DIR" ]] && [[ "$COMMAND" == "all" || "$COMMAND" == "generate" || "$COMMAND" == "pdf" ]]; then
        echo ""
        echo -e "${YELLOW}Cleaning up intermediate files...${NC}"
        rm -rf "$WORK_DIR"
        echo -e "${GREEN}✓ Cleanup complete${NC}"
    elif [[ -d "$WORK_DIR" ]]; then
        echo ""
        echo -e "${CYAN}Intermediate files kept in: $WORK_DIR${NC}"
    fi
}

# Export variables for use in functions
export VERBOSE FORCE WORK_DIR FINAL_OUTPUT

# Run main function
main "$@"