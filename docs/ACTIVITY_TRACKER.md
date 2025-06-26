# Activity Tracker Setup Guide

The Activity Tracker tool helps you create a daily log of your work activities by analyzing your Slack conversations, Gmail emails, and Google Calendar events.

## Features

- **Multi-source tracking**: Pulls data from Slack, Gmail, and Google Calendar
- **AI-powered summaries**: Uses Claude to enhance activity summaries
- **Dark period detection**: Identifies gaps in activity for focus time, breaks, etc.
- **CSV/JSON export**: Output your daily log in spreadsheet-friendly format
- **Configurable workday**: Set your work hours and break thresholds

## Setup

### 1. Slack Setup

1. Create a Slack app at https://api.slack.com/apps
2. Add OAuth scopes:
   - `channels:history` - View messages in public channels
   - `groups:history` - View messages in private channels
   - `im:history` - View direct messages
   - `mpim:history` - View group direct messages
   - `users:read` - View user information
3. Install the app to your workspace
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)
5. Add to your config:
   ```bash
   # In ~/.toolbox/config.json
   {
     "SLACK_API_TOKEN": "xoxb-your-token-here"
   }
   
   # Or as environment variable
   export SLACK_API_TOKEN="xoxb-your-token-here"
   ```

### 2. Google Setup (Gmail & Calendar)

1. Go to https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable APIs:
   - Gmail API
   - Google Calendar API
4. Create credentials:
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application" 
   - Add authorized redirect URI: `http://localhost:8080`
   - Download the JSON file
5. Save the credentials:
   ```bash
   # Create the .toolbox directory if it doesn't exist
   mkdir -p ~/.toolbox
   
   # Save to ~/.toolbox/google-credentials.json
   cp ~/Downloads/credentials.json ~/.toolbox/google-credentials.json
   ```
6. On first run, you'll be prompted to authorize the app. The token will be saved automatically.

### 3. Configuration

Add these to your `~/.toolbox/config.json`:

```json
{
  "SLACK_API_TOKEN": "xoxb-...",
  "GOOGLE_CREDENTIALS_PATH": "/Users/you/.toolbox/google-credentials.json",
  "GOOGLE_TOKEN_PATH": "/Users/you/.toolbox/google-token.json",
  "ANTHROPIC_API_KEY": "sk-ant-..."
}
```

**Note about GOOGLE_TOKEN_PATH**: This is where the OAuth token will be stored after you authorize the app. You don't need to create this file - it will be created automatically when you first authenticate. If not specified, it defaults to `~/.toolbox/google-token.json`.

## Usage

### Basic Usage

Track yesterday's activities:
```bash
toolbox track-day
```

Track a specific date:
```bash
toolbox track-day --date 2024-01-15
```

### Interactive Mode

Use the wizard for guided setup:
```bash
toolbox wizard
# Select "Track Day"
```

### Command Line Options

```bash
toolbox track-day [options]

Options:
  -d, --date <date>                    Date to track (YYYY-MM-DD)
  -o, --output <file>                  Output CSV file
  --slack-token <token>                Slack API token
  --google-creds <path>                Google credentials JSON
  --google-token <path>                Google OAuth token storage
  --timezone <tz>                      Timezone (default: system)
  --workday-start <time>               Start time (HH:mm)
  --workday-end <time>                 End time (HH:mm)
  --dark-period-threshold <minutes>    Min gap for dark periods
  --no-slack                           Skip Slack
  --no-gmail                           Skip Gmail
  --no-calendar                        Skip Calendar
  --no-llm                             Skip AI summaries
  --json                               Output as JSON
```

### Examples

Track yesterday with custom work hours:
```bash
toolbox track-day --workday-start 09:00 --workday-end 17:00
```

Track specific date, Slack only:
```bash
toolbox track-day --date 2024-01-15 --no-gmail --no-calendar
```

Export as JSON:
```bash
toolbox track-day --json > activity.json
```

## Output Format

### CSV Format
```csv
Start Time,End Time,Duration (min),Participants/Channels,Title,Summary,Type
08:30,09:00,30,#engineering,Daily Engineering Sync,Discussed upload service refactor,slack
09:00,09:30,30,-,Focus time,No tracked interactions,dark_period
09:30,09:45,15,john@company.com,Email: Project update,Sent status update on Q1 goals,email
10:00,11:00,60,sarah@company.com; mike@company.com,Meeting: Product Review,Reviewed new feature designs,calendar
```

### JSON Format
```json
[
  {
    "start_time": "2024-01-15T08:30:00",
    "end_time": "2024-01-15T09:00:00",
    "duration_minutes": 30,
    "participants": "#engineering",
    "title": "Daily Engineering Sync",
    "summary": "Discussed upload service refactor",
    "type": "slack"
  }
]
```

## Dark Periods

The tool automatically detects gaps in your activity and labels them as "dark periods":

- **Focus time**: 30-45 minute gaps
- **Lunch break**: 45-75 minute gaps  
- **Deep work session**: 90+ minute gaps
- **Morning routine**: Gaps at start of day

Customize the threshold:
```bash
toolbox track-day --dark-period-threshold 45
```

## Troubleshooting

### Slack Issues

- **No conversations found**: This is usually because the bot hasn't been added to channels
  - Add your bot to channels by typing `/invite @YourBotName` in each channel you want to track
  - For direct messages, the bot needs to be part of the conversation
  - The bot can only see messages in channels it's a member of
- **Authentication failed**: Check your token starts with `xoxb-`
- **Rate limiting**: The tool caches results to avoid hitting limits

### Google Issues

- **"Gmail API has not been used in project..."**: You need to enable the Gmail API:
  1. Click the link in the error message or go to Google Cloud Console
  2. Enable the Gmail API for your project
  3. Wait a few minutes for it to propagate
  4. Try running the command again
- **Authentication prompt**: Normal on first run, authorize in browser
- **No emails found**: Check you're using the correct account
- **Token expired**: Delete `~/.toolbox/google-token.json` and re-auth

### Performance

- First run will be slower as it fetches all data
- Subsequent runs use cached data (same day)
- Clear cache if needed: `toolbox cache clear`

## Privacy & Security

- All data is processed locally
- API tokens are stored in your local config
- No data is sent to external services except:
  - Claude API for summaries (if enabled)
  - Your configured Slack/Google accounts
- Cache files are stored locally in `.cache/` directory