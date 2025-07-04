# Gather Toolbox

A collection of TypeScript-based development tools for automating common workflows, including Jira integration and release notes generation.

## Overview

This toolbox provides a unified command-line interface for various development automation tools. All tools are written in TypeScript and executed using pre-compiled JavaScript for optimal performance, with an optional development mode for debugging.

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd toolbox

# Install dependencies
npm install

# Make the toolbox command available globally (optional)
npm link
```

## Usage

The toolbox provides a single entry point for all tools:

```bash
./toolbox <command> [options]
```

Or if linked globally:

```bash
toolbox <command> [options]
```

### Performance Mode (Default)
```bash
toolbox wizard              # Fast startup with compiled JS
toolbox -n wizard          # Even faster with --no-check
```

### Development Mode
```bash
toolbox --dev wizard       # Full debugging with ts-node
```

## Available Tools

### 1. Fetch Jira Ticket

Fetches detailed information about a Jira ticket and outputs it as JSON.

**Usage:**
```bash
toolbox fetch-jira APP-1234
```

**Configuration:**
The tool requires Jira authentication credentials, which can be provided through:
- Environment variables: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- A `.jiraconfig` file in `~/bin/.jiraconfig` (for compatibility with existing shell scripts)
- A `.env` file in the project root

**Output:**
```json
{
  "ticket": "APP-1234",
  "title": "Fix user authentication issue",
  "description": "...",
  "comments": [
    {
      "author": "John Doe",
      "body": "Updated the authentication logic",
      "created": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### 2. Fetch Jira Attachment

Downloads attachments from Jira tickets, including images and documents.

**Usage:**
```bash
# Using attachment URL from fetch-jira output
toolbox fetch-attachment "https://gatherly.atlassian.net/secure/attachment/53564/image-20250317-154038.png"

# Using just the attachment ID
toolbox fetch-attachment 53564

# Save to specific directory
toolbox fetch-attachment 53564 -d ./attachments/

# Save with custom filename
toolbox fetch-attachment 53564 -o screenshot.png

# Output to stdout (base64 encoded)
toolbox fetch-attachment 53564 --stdout | base64 -d > image.png
```

**Features:**
- Downloads any Jira attachment by URL or ID
- Preserves original filename by default
- Supports custom output paths
- Can output to stdout for piping
- Shows download progress and file size

### 3. Generate Release Notes

Analyzes git commits between branches and generates comprehensive release notes as a styled HTML document with categorized tickets, testing guidelines, and optional AI-powered code analysis.

**Usage:**
```bash
# Generate release notes for a repository (from toolbox directory)
toolbox release-notes --repo /path/to/your/repo

# Use custom branches (default: origin/master..origin/test)
toolbox release-notes --repo ~/code/myproject --source origin/develop --target origin/main

# Generate with specific output file (HTML format)
toolbox release-notes --repo ~/code/myproject --output my-release-notes.html

# Resume from last successful step
toolbox release-notes --repo ~/code/myproject --resume

# Run a specific step only
toolbox release-notes --repo ~/code/myproject --step extract

# Skip Jira integration and AI analysis for faster generation
toolbox release-notes --repo ~/code/myproject --no-jira --no-ai

# Keep intermediate files for debugging
toolbox release-notes --repo ~/code/myproject --keep --verbose

# Different Jira project prefix (default: APP)
toolbox release-notes --repo ~/code/myproject --jira-project PROJ
```

**Features:**
- Generates styled HTML with embedded CSS
- Automatic ticket categorization (bug fixes, features, UI updates, etc.)
- Jira integration for ticket details
- Claude AI integration for code analysis (optional)
- Print-friendly CSS with page break controls
- Resumable multi-step process
- Progress tracking with visual indicators

**Output Format:**
The tool generates a professional HTML document with:
- Executive summary with visual statistics
- Interactive table of contents
- Categorized ticket sections with testing notes
- Collapsible full commit list
- Responsive design that looks great on screen and in print
- Optimized for PDF conversion with proper page breaks

**Configuration:**
- Requires git repository with `master` and `test` branches
- Optional: `ANTHROPIC_API_KEY` for AI-powered code analysis
- Optional: Jira credentials for ticket details

## Project Structure

```
toolbox/
├── src/
│   ├── tools/          # Individual tool implementations
│   │   ├── fetch-jira-ticket.ts
│   │   └── generate-release-notes.ts
│   ├── utils/          # Shared utilities
│   │   ├── logger.ts   # Colored output and logging
│   │   ├── config.ts   # Configuration management
│   │   ├── progress.ts # Progress indicators
│   │   ├── http-client.ts # HTTP client wrapper
│   │   └── fs-utils.ts # File system utilities
│   ├── types/          # TypeScript type definitions
│   └── config/         # Configuration files
├── toolbox             # Main entry point shell script
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Adding a New Tool

1. Create a new TypeScript file in `src/tools/`:
```typescript
// src/tools/my-new-tool.ts
import { Command } from 'commander';
import { logger, config } from '../utils';

const program = new Command();

program
  .name('my-new-tool')
  .description('Description of your tool')
  .option('-o, --output <file>', 'output file')
  .action(async (options) => {
    logger.info('Running my new tool...');
    // Tool implementation
  });

program.parse();
```

2. Add the tool to the `toolbox` shell script:
```bash
# In the case statement
my-new-tool|mnt)
    cd "$SCRIPT_DIR" && npx ts-node src/tools/my-new-tool.ts "$@"
    ;;
```

3. Update this README with documentation for the new tool.

### Shared Utilities

The project includes several shared utilities that can be used across tools:

- **Logger**: Provides colored console output with different log levels
- **Config**: Manages environment variables and configuration files
- **Progress**: Shows progress spinners and status updates
- **HttpClient**: Wrapper around axios for making HTTP requests
- **FileSystem**: Async file system operations with convenience methods

### Testing

```bash
# Run TypeScript compiler to check for errors
npm run build

# Run a specific tool for testing
npm run fetch-jira APP-1234
npm run release-notes -- --help
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JIRA_BASE_URL` | Jira instance URL (e.g., https://company.atlassian.net) | For Jira tools |
| `JIRA_EMAIL` | Email address for Jira authentication | For Jira tools |
| `JIRA_API_TOKEN` | Jira API token | For Jira tools |
| `ANTHROPIC_API_KEY` | Claude AI API key | For AI features |
| `VERBOSE` | Enable debug logging (true/false) | Optional |
| `NO_COLOR` | Disable colored output (true/false) | Optional |

## Example Workflows

### Analyzing a Jira Ticket with Attachments

```bash
# 1. Fetch ticket details
toolbox fetch-jira APP-4137 -o ticket.json

# 2. Extract attachment URLs and download them
cat ticket.json | jq -r '.attachments[] | "\(.url) -o attachments/\(.filename)"' | while read url args; do
  toolbox fetch-attachment $url $args
done

# 3. View the downloaded images
open attachments/*.png

# 4. Feed ticket data to an LLM along with the images
```

### Generating Release Notes with Full Context

```bash
# From the toolbox directory, generate release notes for your webapp
toolbox release-notes --repo ~/code/gather/webapp

# The tool will:
# 1. Fetch commits between origin/master and origin/test
# 2. Extract ticket numbers (APP-XXXX)
# 3. Categorize tickets by commit messages
# 4. Fetch full ticket details from Jira (optional)
# 5. Analyze code changes with AI (optional)
# 6. Generate formatted release notes

# For a typical release workflow:
cd ~/code/gather/toolbox
toolbox release-notes --repo ../webapp --output ../webapp/RELEASE_NOTES.html

# Convert to PDF (using any HTML to PDF tool):
# wkhtmltopdf ../webapp/RELEASE_NOTES.html ../webapp/RELEASE_NOTES.pdf
# or open in browser and print to PDF
```

## Contributing

1. Follow the existing code style and patterns
2. Add appropriate error handling and logging
3. Update documentation for any new features
4. Test your changes thoroughly

## License

[Your license here]