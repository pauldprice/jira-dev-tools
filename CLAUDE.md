# Claude.md - Project Context for Toolbox

This document provides essential context for Claude to understand and work effectively with the Gather Toolbox project.

## Project Overview

The Gather Toolbox is a TypeScript-based CLI utility collection for development workflows at Gather. It provides tools for interacting with Jira, generating release notes, and other development tasks.

## Core Architecture

- **Language**: TypeScript with ts-node for direct execution
- **CLI Framework**: Commander.js for argument parsing
- **Main Entry**: `toolbox` shell script that invokes individual tools via ts-node
- **Structure**: Modular architecture with shared utilities in `src/utils/`

## Configuration

The toolbox supports multiple configuration methods (in order of precedence):

1. **Environment Variables**: Standard environment variables (highest priority)
2. **Project .env file**: `.env` file in the project root
3. **Shell config**: `~/bin/.jiraconfig` for Jira credentials (legacy support)
4. **Home directory config**: Config files in your home directory (NEW!)

### Home Directory Configuration

Store your API keys and credentials in one of these locations:
- `~/.toolbox/config.json` (recommended)
- `~/.toolbox/config`
- `~/.toolboxrc.json`
- `~/.toolboxrc`

Example JSON format:
```json
{
  "ANTHROPIC_API_KEY": "your-api-key-here",
  "JIRA_BASE_URL": "https://your-domain.atlassian.net",
  "JIRA_EMAIL": "your-email@example.com",
  "JIRA_API_TOKEN": "your-jira-api-token"
}
```

Example key=value format:
```
ANTHROPIC_API_KEY=your-api-key-here
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-jira-api-token
```

Note: Environment variables always take precedence over config files.

## Key Components

### Tools
- `fetch-jira-ticket`: Fetches and formats Jira ticket data
- `fetch-jira-attachment`: Downloads Jira attachments
- `generate-release-notes`: Creates HTML release notes from git commits

### Utilities
- `jira-client.ts`: Shared Jira API functionality
- `git-diff.ts`: Git diff extraction for specific tickets
- `claude-client.ts`: AI integration for code analysis
- `parallel-processor.ts`: Concurrent API request handling
- `html-generator.ts`: Release notes HTML generation
- `cache-manager.ts`: Hash-based caching system for API/AI calls
- `cached-fetch.ts`: Fetch wrapper with automatic caching
- `cached-claude.ts`: Claude API wrapper with caching
- `cached-jira.ts`: Jira API wrapper with caching

## Development Guidelines

### Code Style
- Use TypeScript with strict type checking
- Prefer async/await over callbacks
- Use descriptive variable names
- NO COMMENTS unless explicitly requested
- Follow existing code patterns in the codebase

### Commit Messages
- Write clear, concise commit messages
- Use conventional commit format (feat:, fix:, etc.)
- Focus on what changed and why
- DO NOT mention Claude, AI assistance, or "generated with" in commits
- Keep commits professional and focused on the code changes

### Error Handling
- Always use try/catch blocks for external API calls
- Provide helpful error messages with context
- Use the logger utility for consistent output
- Gracefully handle missing configurations

### Testing
- Run TypeScript type checking: `npx tsc --noEmit`
- Run linting: `npm run lint` (if configured)
- Test with real repositories when working on git-related features
- Verify Jira integration with actual tickets
- Always test error cases and edge conditions
- Test performance improvements by comparing before/after timings
- Verify cached vs non-cached outputs are identical

## Important Patterns

### Configuration
- Jira credentials loaded from ~/.jiraconfig (shell script)
- Claude API key from ANTHROPIC_API_KEY environment variable
- Support for both shell script and .env configurations

### Git Operations
- Always use absolute paths for repository operations
- Isolate ticket-specific changes (don't include merged commits)
- Handle both remote branches and local branches
- Clean up temporary files after operations

### API Integration
- Use parallel processing for bulk operations
- Implement rate limiting for external APIs
- Cache results where appropriate
- Handle API failures gracefully with fallbacks

## Common Issues & Solutions

### Token Truncation
- Original issue: Shell script loading truncated API tokens
- Solution: Use proper shell environment loading with JSON parsing

### Cross-Ticket Contamination
- Issue: Git diffs included changes from merged tickets
- Solution: Analyze only commits specifically tagged with ticket ID

### Performance
- Issue: Sequential API calls causing slow execution
- Solution: ParallelProcessor with configurable concurrency

## User Preferences

1. **Conciseness**: Keep responses short and direct
2. **No Emojis**: Don't use emojis unless explicitly requested
3. **No Comments**: Don't add code comments unless asked
4. **Action-Oriented**: Focus on completing tasks, not explaining
5. **Tool Usage**: Prefer internal module imports over shell execution

## Testing Commands

```bash
# Test Jira integration
./toolbox fetch-jira APP-1234

# Test release notes generation
./toolbox release-notes --repo /path/to/repo --ai-model sonnet

# Run with verbose output
./toolbox release-notes --repo /path/to/repo -v

# Manage cache
./toolbox cache stats
./toolbox cache clear
./toolbox cache clear --namespace jira
```

## Caching System

The toolbox includes a comprehensive caching system to speed up development and reduce API costs:

- **Hash-based**: Requests are hashed to create deterministic cache keys
- **Namespace support**: Different tools use separate cache namespaces (jira, claude, fetch)
- **TTL support**: Configurable time-to-live for cache entries
- **Transparent**: Works automatically without code changes

Cache is stored in `.toolbox_cache/` by default and can be managed via the cache command.

## Testing Results

### Cache Performance
- First run (no cache): ~21 seconds
- Second run (with cache): ~4.2 seconds
- **5x speedup** with caching enabled

### Known Issues
- Bug: AI-generated testing notes can be incorrectly mapped to wrong tickets in cached runs
- This appears to be a data structure issue where testing notes are not properly isolated per ticket

## Future Considerations

- Fix the testing notes mapping bug in cached AI responses
- Additional tool integrations planned
- Performance optimizations for large repositories
- Enhanced AI analysis capabilities
- Improved error recovery mechanisms

## PDF Analysis

Claude has built-in support for analyzing PDF files visually. The toolbox includes an `analyze-pdf` command that leverages this capability:

### PDF Support Details
- **Max file size**: 32MB
- **Max pages**: 100 pages per request
- **Format**: Standard PDF (no encryption/passwords)
- **API**: Sends PDF as base64 encoded document

### Usage
```bash
# Basic PDF analysis
./toolbox analyze-pdf release_notes.pdf

# Focus on specific aspects
./toolbox analyze-pdf report.pdf --focus readability
./toolbox analyze-pdf document.pdf --focus layout

# Save analysis to file
./toolbox analyze-pdf report.pdf --output analysis.txt

# Get structured JSON output
./toolbox analyze-pdf report.pdf --json --output analysis.json

# Custom analysis prompt
./toolbox analyze-pdf manual.pdf --prompt "Check for accessibility compliance"
```

### Focus Areas
- **layout**: Page organization, structure, visual balance
- **readability**: Font sizes, line spacing, text legibility
- **formatting**: Style consistency, tables, colors
- **accessibility**: Vision impairment considerations, screen reader compatibility
- **all**: Comprehensive analysis (default)

### When Analyzing Release Notes PDFs
Look for:
1. Page break issues (content split awkwardly)
2. Truncated content (especially in tables or lists)
3. Consistent formatting across all sections
4. Proper page numbering and headers/footers
5. Visual hierarchy and readability
6. Professional appearance
7. Any rendering artifacts or errors

## Quick Reference

When working on this project:
1. Always check existing patterns before implementing new features
2. Test with real data (Jira tickets, git repos)
3. Maintain backward compatibility
4. Focus on user experience and clear output
5. Keep tools focused and single-purpose
6. Use the analyze-pdf tool to visually inspect generated PDFs