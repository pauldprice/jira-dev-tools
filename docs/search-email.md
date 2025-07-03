# Search Email Tool

The `search-email` tool allows you to search Gmail conversations with specific contacts and analyze them using AI to answer natural language queries.

## Features

- Search emails by sender/recipient
- Filter by date range, subject, or body content
- Analyze conversations with AI to answer specific questions
- Export results to Markdown or JSON
- Support for different AI models (Haiku, Sonnet, Opus)

## Usage

### Basic Usage

Search for emails with a contact and ask a question:

```bash
toolbox search-email --email john@example.com --query "What was the last project update?"
```

### With Date Range

Search emails from the last 30 days:

```bash
toolbox search-email --email sarah@company.com --query "What action items were mentioned?" --days 30
```

Or specify a custom date range:

```bash
toolbox search-email --email client@business.com --query "Summary of contract discussions" \
  --start-date 2024-01-01 --end-date 2024-01-31
```

### Additional Filters

Filter by subject or body content:

```bash
toolbox search-email --email boss@company.com --query "What was decided about the budget?" \
  --subject "budget" --days 90
```

### Export Results

Export the analysis and email details to a file:

```bash
toolbox search-email --email partner@firm.com --query "List all deliverables mentioned" \
  --export deliverables_summary.md --show-references
```

Export as JSON for programmatic use:

```bash
toolbox search-email --email vendor@supplier.com --query "What are the payment terms?" \
  --export payment_terms.json
```

### Options

- `-e, --email <address>` - Email address to search for (required)
- `-q, --query <query>` - Natural language query to answer (required)
- `-d, --days <number>` - Search emails from last N days
- `--start-date <date>` - Start date (YYYY-MM-DD)
- `--end-date <date>` - End date (YYYY-MM-DD)
- `-s, --subject <keywords>` - Filter by subject keywords
- `-b, --body <keywords>` - Filter by body content keywords
- `-l, --limit <number>` - Maximum number of emails to process (default: 50)
- `-a, --include-attachments` - Include attachment information
- `-m, --model <model>` - AI model to use: haiku (default), sonnet, or opus
- `-r, --show-references` - Show email references after analysis
- `-x, --export <file>` - Export results to file (.json or .md)
- `-v, --verbose` - Show detailed progress

## Examples

### Project Status Update

```bash
toolbox search-email --email pm@company.com \
  --query "What's the current status of the Phoenix project?" \
  --days 7 --show-references
```

### Meeting Summary

```bash
toolbox search-email --email team@company.com \
  --query "Summarize the decisions from our planning meetings" \
  --subject "planning meeting" --days 30
```

### Action Items Tracking

```bash
toolbox search-email --email colleague@company.com \
  --query "List all action items assigned to me" \
  --body "action item" --model sonnet \
  --export my_action_items.md
```

### Contract Review

```bash
toolbox search-email --email legal@lawfirm.com \
  --query "What are the key terms and conditions discussed?" \
  --start-date 2024-01-01 --include-attachments \
  --model opus --export contract_summary.json
```

## Using the Wizard

The interactive wizard makes it easy to build search-email commands:

```bash
toolbox wizard
# Select "Search Email"
# Follow the prompts
```

## Notes

- Requires Gmail authentication (uses same auth as track-day tool)
- The AI will analyze the email content and answer based on what it finds
- References to specific emails include date and subject for verification
- Export files preserve the full analysis and email details