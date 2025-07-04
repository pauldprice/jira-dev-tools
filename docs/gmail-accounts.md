# Gmail Account Management

The toolbox now supports multiple Gmail accounts for email-related tools. You can manage these accounts using the `gmail-accounts` command.

## Features

- **Multiple Account Support**: Add and manage multiple Gmail accounts
- **Account Aliases**: Set friendly names for accounts (e.g., "work" instead of "work@company.com")
- **Default Account**: Designate a default account for when no account is specified
- **Automatic Migration**: Existing single-account setups are automatically migrated

## Account Management Commands

### List Accounts

Show all configured Gmail accounts:

```bash
toolbox gmail-accounts list
```

### Add Account

Add a new Gmail account:

```bash
toolbox gmail-accounts add
```

With alias and set as default:

```bash
toolbox gmail-accounts add --alias work --default
```

### Remove Account

Remove a Gmail account by email or alias:

```bash
toolbox gmail-accounts remove work@company.com
# or
toolbox gmail-accounts remove work
```

### Set Default Account

Change the default Gmail account:

```bash
toolbox gmail-accounts set-default personal@gmail.com
# or
toolbox gmail-accounts set-default personal
```

### Test Account

Test Gmail access for an account:

```bash
toolbox gmail-accounts test
# or test specific account
toolbox gmail-accounts test work
```

## Using Accounts with Tools

### Search Email

Use a specific account for email search:

```bash
toolbox search-email --account work --email john@example.com --query "project status"
# or use alias
toolbox search-email --account personal --email friend@gmail.com --query "vacation plans"
```

If no account is specified, the default account is used.

### Track Day

Use a specific account for tracking daily activities:

```bash
toolbox track-day --account work
```

### Interactive Wizard

The wizard will show a list of available accounts and let you choose:

```bash
toolbox wizard
# Select "Search Email"
# Choose from the list of configured accounts
```

## Configuration Storage

Gmail account configurations are stored in your toolbox config file:
- `~/.toolbox/config.json` (recommended)
- `~/.toolboxrc.json`

Example configuration:

```json
{
  "gmail_accounts": {
    "work@company.com": {
      "email": "work@company.com",
      "alias": "work"
    },
    "personal@gmail.com": {
      "email": "personal@gmail.com",
      "alias": "personal"
    }
  },
  "default_gmail_account": "work@company.com"
}
```

OAuth tokens are stored separately in:
- `~/.toolbox/.google-auth/token-{email}.json`

## Migration from Single Account

If you had a Gmail account configured before the multi-account update, it will be automatically migrated:

1. The existing token at `~/.toolbox/google-token.json` is moved to `~/.toolbox/.google-auth/token-{email}.json`
2. The account is added to your config with the username as the default alias
3. It's set as the default account

## Backward Compatibility

All existing commands work without changes:
- If you have only one account, it's used automatically
- If you have multiple accounts, the default is used
- The `--account` parameter is optional

## Troubleshooting

### "No Gmail accounts configured" Error

Run `toolbox gmail-accounts add` to add your first account.

### Authentication Issues

If you're having trouble authenticating:

1. Make sure you have `google-credentials.json` in `~/.toolbox/`
2. Try removing and re-adding the account:
   ```bash
   toolbox gmail-accounts remove problematic@gmail.com
   toolbox gmail-accounts add
   ```

### Token Expired

The tool automatically refreshes expired tokens. If you continue to have issues, remove and re-add the account.

## Examples

### Managing Multiple Email Accounts

```bash
# Add work account
toolbox gmail-accounts add --alias work --default

# Add personal account
toolbox gmail-accounts add --alias personal

# List all accounts
toolbox gmail-accounts list

# Search work emails
toolbox search-email --account work --email boss@company.com --query "deadline"

# Search personal emails
toolbox search-email --account personal --email friend@gmail.com --query "birthday party"
```

### Using Aliases

```bash
# Instead of typing full email addresses
toolbox search-email --account work@company.com --email client@business.com --query "contract"

# Use convenient aliases
toolbox search-email --account work --email client@business.com --query "contract"
```