#!/usr/bin/env ts-node

import { Command } from 'commander';
import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import { logger } from '../utils/enhanced-logger';
import { execSync } from 'child_process';
import { buildCommand } from './wizard/command-builder';
import {
  promptFetchJira,
  promptReleaseNotes,
  promptAnalyzePdf,
  promptCache,
  promptBitbucket,
  promptRunSql,
  promptTrackDay,
  promptSearchEmail,
  promptGmailAccounts
} from './wizard/prompts';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

const program = new Command();

interface CommandChoice {
  name: string;
  value: string;
}

const commandChoices: CommandChoice[] = [
  { name: 'Fetch JIRA Ticket - Fetch and format JIRA ticket information', value: 'fetch-jira' },
  { name: 'Generate Release Notes - Generate release notes from git commits and JIRA tickets', value: 'release-notes' },
  { name: 'Analyze PDF - Analyze a PDF file using AI vision', value: 'analyze-pdf' },
  { name: 'Bitbucket - Interact with Bitbucket repositories', value: 'bitbucket' },
  { name: 'Run SQL - Execute SQL scripts with variable substitution', value: 'run-sql' },
  { name: 'Track Day - Summarize daily activities from Slack, Gmail, and Calendar', value: 'track-day' },
  { name: 'Search Email - Search and analyze Gmail conversations with AI', value: 'search-email' },
  { name: 'Gmail Accounts - Manage Gmail accounts for email tools', value: 'gmail-accounts' },
  { name: 'Cache Management - Manage the toolbox cache', value: 'cache' },
];

async function getCommandAnswers(selectedCommand: string): Promise<any> {
  switch (selectedCommand) {
    case 'fetch-jira':
      return promptFetchJira();
    case 'release-notes':
      return promptReleaseNotes();
    case 'analyze-pdf':
      return promptAnalyzePdf();
    case 'bitbucket':
      return promptBitbucket();
    case 'cache':
      return promptCache();
    case 'run-sql':
      return promptRunSql();
    case 'track-day':
      return promptTrackDay();
    case 'search-email':
      return promptSearchEmail();
    case 'gmail-accounts':
      return promptGmailAccounts();
    default:
      throw new Error(`Unknown command: ${selectedCommand}`);
  }
}

async function selectCommand(): Promise<string> {
  const { selectedCommand } = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'selectedCommand',
      message: 'Which command would you like to run? (type to search)',
      source: async (_answers: any, input: string) => {
        if (!input) {
          return commandChoices;
        }
        const searchTerm = input.toLowerCase();
        return commandChoices.filter(choice => 
          choice.name.toLowerCase().includes(searchTerm)
        );
      }
    },
  ]);
  
  return selectedCommand;
}

async function confirmAndExecute(fullCommand: string, dryRun: boolean): Promise<void> {
  logger.info('\nGenerated command:');
  logger.info(fullCommand);
  
  if (dryRun) {
    logger.info('\n(Dry run - command not executed)');
    return;
  }
  
  const { shouldRun } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldRun',
      message: 'Run this command?',
      default: true,
    },
  ]);
  
  if (shouldRun) {
    logger.info('\nExecuting command...\n');
    
    try {
      execSync(fullCommand, { 
        stdio: 'inherit',
        cwd: process.cwd(),
      });
    } catch (error: any) {
      logger.error(`\nCommand failed with exit code ${error.status || 1}`);
      process.exit(error.status || 1);
    }
  } else {
    logger.info('\nCommand cancelled.');
  }
}

program
  .name('wizard')
  .description('Interactive CLI wizard to help build toolbox commands')
  .option('--dry-run', 'Show the command without executing it')
  .action(async (options) => {
    logger.info('Welcome to the Toolbox Wizard!');
    logger.info('This will help you build and run toolbox commands interactively.\n');
    
    try {
      const selectedCommand = await selectCommand();
      
      logger.info(`\nConfiguring ${selectedCommand}...\n`);
      
      const answers = await getCommandAnswers(selectedCommand);
      
      const fullCommand = buildCommand(selectedCommand, answers);
      
      await confirmAndExecute(fullCommand, options.dryRun);
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        logger.info('\nWizard cancelled.');
      } else {
        logger.error('Wizard error:', error);
      }
      process.exit(1);
    }
  });

program.parse();