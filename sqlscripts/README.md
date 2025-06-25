# SQL Scripts Directory

This directory contains SQL scripts that can be executed using the `toolbox run-sql` command.

## Directory Structure

- `analytics/` - Analytics and metrics queries
- `reports/` - Business reports and summaries  
- `admin/` - Database administration queries

## Variable Substitution

Scripts can include variables using the `${variable_name}` syntax. When you run a script, you'll be prompted for values for each variable. Your responses are saved as defaults for future runs.

## Example Usage

```bash
# Run a specific script
toolbox run-sql sqlscripts/analytics/user_activity.sql

# List available scripts
toolbox run-sql --list

# Run with predefined variables
toolbox run-sql sqlscripts/reports/monthly_summary.sql --var year=2024 --var month=1

# Output to CSV file
toolbox run-sql sqlscripts/admin/table_sizes.sql --format csv --output table_sizes.csv

# Use the wizard for interactive mode
toolbox wizard
# Then select "Run SQL"
```

## Creating New Scripts

1. Create a new `.sql` file in the appropriate subdirectory
2. Add SQL with optional `${variable}` placeholders
3. Include a comment at the top describing the script and listing variables
4. Test the script using `toolbox run-sql`

## Database Connection

The tool uses connections configured in your `~/.pgpass` file. Format:
```
hostname:port:database:username:password
```

Make sure your `.pgpass` file has appropriate permissions:
```bash
chmod 600 ~/.pgpass
```