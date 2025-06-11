#!/usr/bin/env node
import { Command } from 'commander';
import { logger, config, progress, FileSystem, fetchJiraTicket } from '../utils';

const program = new Command();

program
  .name('fetch-jira-ticket')
  .description('Fetch Jira ticket details and output as JSON')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., APP-1234)')
  .option('--no-comments', 'exclude comments from output')
  .option('--no-history', 'exclude change history from output')
  .option('--format <type>', 'output format: llm (default) or raw', 'llm')
  .option('-o, --output <file>', 'save output to file instead of stdout')
  .action(async (ticketId: string, options) => {
    try {
      // Validate Jira configuration
      const jiraConfig = config.getJiraConfig();
      if (!jiraConfig) {
        logger.error('Missing Jira configuration. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN');
        process.exit(1);
      }

      progress.start(`Fetching ticket ${ticketId}...`);

      // Use the shared Jira client
      const output = await fetchJiraTicket(
        ticketId,
        jiraConfig,
        {
          includeComments: !options.noComments,
          includeHistory: !options.noHistory,
          format: options.format
        }
      );

      progress.succeed(`Fetched ticket ${ticketId}`);

      // Format output as JSON string
      const jsonOutput = JSON.stringify(output, null, 2);

      // Output result
      if (options.output) {
        await FileSystem.writeFile(options.output, jsonOutput);
        logger.success(`Saved to ${options.output}`);
      } else {
        console.log(jsonOutput);
      }

    } catch (error: any) {
      progress.fail();
      
      if (error.response?.status === 404) {
        logger.error(`Ticket ${ticketId} not found`);
      } else if (error.response?.status === 401) {
        logger.error('Authentication failed. Please check your Jira credentials');
      } else {
        logger.error(`Failed to fetch ticket: ${error.message || error}`);
      }
      
      process.exit(1);
    }
  });

program.parse();