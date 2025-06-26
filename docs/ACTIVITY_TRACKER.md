# Activity Tracker Setup Guide

The Activity Tracker tool helps you create a daily log of your work activities by analyzing your Slack conversations, Gmail emails, and Google Calendar events.

## Features

- **Multi-source tracking**: Pulls data from Slack, Gmail, and Google Calendar
- **AI-powered summaries**: Uses Claude to enhance activity summaries
- **Dark period detection**: Identifies gaps in activity for focus time, breaks, etc.
- **CSV/JSON export**: Output your daily log in spreadsheet-friendly format
- **Configurable workday**: Set your work hours and break thresholds
- **Email tracking**: Captures emails you sent, received, replied to, or were CC'd on

## Setup

### 1. Slack Setup

You have two options for Slack authentication:

#### Option A: User Token (Recommended - Access All Your Channels)

1. Create a Slack app at https://api.slack.com/apps
2. Add **User Token Scopes** (not Bot Token Scopes):
   - `channels:read` - List channels
   - `channels:history` - View messages in public channels
   - `groups:read` - List private channels
   - `groups:history` - View messages in private channels  
   - `im:read` - List direct messages
   - `im:history` - View direct messages
   - `mpim:read` - List group direct messages
   - `mpim:history` - View group direct messages
   - `users:read` - View user information
   - `search:read` - Search for your messages (highly recommended for performance!)
3. Install the app to your workspace
4. Copy the "User OAuth Token" (starts with `xoxp-`)
5. Add to your config:
   ```bash
   # In ~/.toolbox/config.json
   {
     "SLACK_API_TOKEN": "xoxp-your-user-token-here"
   }
   ```

**Pros**: Automatically sees all channels you're in, no need to invite bot
**Cons**: Acts as you, not as a separate bot

#### Option B: Bot Token (Requires Adding to Each Channel)

1. Create a Slack app at https://api.slack.com/apps
2. Add **Bot Token Scopes**:
   - `channels:history` - View messages in public channels
   - `groups:history` - View messages in private channels
   - `im:history` - View direct messages
   - `mpim:history` - View group direct messages
   - `users:read` - View user information
3. Install the app to your workspace
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)
5. Add the bot to channels with `/invite @YourBotName`
6. Add to your config:
   ```bash
   # In ~/.toolbox/config.json
   {
     "SLACK_API_TOKEN": "xoxb-your-bot-token-here"
   }
   ```

**Pros**: Separate bot identity, more secure
**Cons**: Must manually add to each channel

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
  --email-mode <mode>                  Email tracking mode:
                                       - sent-only: Only emails you sent
                                       - important: Sent + starred/important received (default)
                                       - all: All emails (including received/CC'd)
  --slack-rate-limit                   Add delays to avoid Slack rate limiting
  --slack-quick                        Quick mode - only your messages without context (faster)
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

Track with all emails (including received):
```bash
toolbox track-day --email-mode all
```

Track only important emails:
```bash
toolbox track-day --email-mode important
```

Quick Slack tracking (avoid rate limits):
```bash
toolbox track-day --slack-quick
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

- **No conversations found**: 
  - If using a bot token (`xoxb-`): Add your bot to channels by typing `/invite @YourBotName` in each channel
  - If using a user token (`xoxp-`): Check that you have the correct scopes and that you were active in channels on that date
  - For both: Verify you have activity on the date you're checking
- **Authentication failed**: 
  - Bot tokens start with `xoxb-`
  - User tokens start with `xoxp-`
  - Make sure you're using the correct type
- **Rate limiting**: 
  - The tool caches results to avoid hitting limits
  - If you get "API Call failed due to rate limiting", use `--slack-rate-limit` flag
  - Cached data persists between runs, so subsequent runs will be faster
  - The Slack SDK will automatically retry after 60 seconds

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