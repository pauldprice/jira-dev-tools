# Claude.md - Project Context for Toolbox

This document provides essential context for Claude to understand and work effectively with the Gather Toolbox project.

## Project Overview

The Gather Toolbox is a TypeScript-based CLI utility collection for development workflows at Gather. It provides tools for interacting with Jira, generating release notes, and other development tasks.

## Core Architecture

- **Language**: TypeScript with ts-node for direct execution
- **CLI Framework**: Commander.js for argument parsing
- **Main Entry**: `toolbox` shell script that invokes individual tools via ts-node
- **Structure**: Modular architecture with shared utilities in `src/utils/`
- **Source Control**: Bitbucket (NOT GitHub) - no `gh` CLI available

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
  "JIRA_API_TOKEN": "your-jira-api-token",
  "BITBUCKET_ACCESS_TOKEN": "your-bitbucket-access-token",
  "DEFAULT_REPO_PATH": "/Users/paul/code/gather/webapp"
}
```

Example key=value format:
```
ANTHROPIC_API_KEY=your-api-key-here
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-jira-api-token
BITBUCKET_ACCESS_TOKEN=your-bitbucket-access-token
DEFAULT_REPO_PATH=/Users/paul/code/gather/webapp
```

Note: Environment variables always take precedence over config files.

### Configuration Options

- **ANTHROPIC_API_KEY**: Your Claude API key
- **JIRA_BASE_URL**: Your JIRA instance URL (e.g., https://company.atlassian.net)
- **JIRA_EMAIL**: Email for JIRA authentication
- **JIRA_API_TOKEN**: JIRA API token (create at: JIRA Settings → Security → API tokens)
- **BITBUCKET_ACCESS_TOKEN**: Bitbucket access token for PR integration
- **DEFAULT_REPO_PATH**: Default git repository path for commands that work with repos

## Key Components

### Tools
- `fetch-jira-ticket`: Fetches and formats Jira ticket data
- `fetch-jira-attachment`: Downloads Jira attachments
- `generate-release-notes`: Creates HTML release notes from git commits

### Utilities
- `jira-client.ts`: Shared Jira API functionality
- `bitbucket-client.ts`: Bitbucket API for pull request detection
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
- **Always run TypeScript type checking before committing code**
- **Always test code changes before committing**
- **Never commit without user approval after testing**

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
- Repository is hosted on Bitbucket - use git commands only, no GitHub CLI
- Pull requests must be created through Bitbucket web interface

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

## Project Memories

- remember to update the wizard whenever the command line interface is updated.
- Do not commit code until the human has a chance to test the changes