#!/usr/bin/env ts-node

import { Command } from 'commander';
import inquirer from 'inquirer';
import { logger } from '../utils/enhanced-logger';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const program = new Command();

// Command definitions with their options
const commands = [
  {
    id: 'fetch-jira',
    name: 'Fetch JIRA Ticket',
    description: 'Fetch and format JIRA ticket information',
    category: 'jira',
    options: [
      {
        name: 'ticketId',
        type: 'input',
        message: 'Ticket ID:',
        validate: (input: string) => /^[A-Z]+-\d+$/.test(input) || 'Please enter a valid ticket ID (e.g., APP-1234)',
      },
      {
        name: 'format',
        type: 'list',
        message: 'Output Format:',
        choices: ['llm', 'raw'],
        default: 'llm',
      },
      {
        name: 'excludeComments',
        type: 'confirm',
        message: 'Exclude Comments?',
        default: false,
      },
    ],
  },
  {
    id: 'release-notes',
    name: 'Generate Release Notes',
    description: 'Generate release notes from git commits and JIRA tickets',
    category: 'release',
    options: [
      {
        name: 'repo',
        type: 'input',
        message: 'Repository Path:',
        default: () => {
          // Smart default: check for common webapp path
          const webappPath = '/Users/paul/code/gather/webapp';
          if (fs.existsSync(webappPath)) {
            return webappPath;
          }
          return process.cwd();
        },
        validate: (input: string) => {
          const absPath = path.resolve(input);
          if (!fs.existsSync(absPath)) {
            return 'Path does not exist';
          }
          if (!fs.existsSync(path.join(absPath, '.git'))) {
            return 'Not a git repository';
          }
          return true;
        },
      },
      {
        name: 'generationMode',
        type: 'list',
        message: 'Generation Mode:',
        choices: [
          { name: 'Branch comparison (test vs master)', value: 'branch' },
          { name: 'Fix Version (all tickets with specific version)', value: 'fixVersion' },
        ],
        default: 'branch',
      },
      {
        name: 'source',
        type: 'input',
        message: 'Source Branch:',
        default: 'origin/test',
        when: (answers: any) => answers.generationMode === 'branch',
      },
      {
        name: 'target',
        type: 'input',
        message: 'Target Branch:',
        default: 'origin/master',
        when: (answers: any) => answers.generationMode === 'branch',
      },
      {
        name: 'fixVersion',
        type: 'input',
        message: 'Fix Version (e.g., V17.02.00):',
        when: (answers: any) => answers.generationMode === 'fixVersion',
        validate: (input: string) => input.trim() !== '' || 'Fix Version is required',
      },
      {
        name: 'aiModel',
        type: 'list',
        message: 'AI Model:',
        choices: [
          { name: 'None (no AI analysis)', value: 'none' },
          { name: 'Claude Haiku (fast, basic)', value: 'haiku' },
          { name: 'Claude Sonnet (balanced)', value: 'sonnet' },
          { name: 'Claude Opus (advanced)', value: 'opus' },
        ],
        default: 'sonnet',
      },
      {
        name: 'pdf',
        type: 'confirm',
        message: 'Generate PDF?',
        default: true,
      },
      {
        name: 'includePrDescriptions',
        type: 'confirm',
        message: 'Include PR Descriptions?',
        default: false,
      },
    ],
  },
  {
    id: 'analyze-pdf',
    name: 'Analyze PDF',
    description: 'Analyze a PDF file using AI vision',
    category: 'analysis',
    options: [
      {
        name: 'file',
        type: 'input',
        message: 'PDF File Path:',
        default: () => {
          // Look for recently generated release notes
          const files = fs.readdirSync('.')
            .filter(f => f.endsWith('.pdf') && f.includes('release_notes'))
            .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
          return files[0] || '';
        },
        validate: (input: string) => {
          const absPath = path.resolve(input);
          if (!fs.existsSync(absPath)) {
            return 'File does not exist';
          }
          if (!input.endsWith('.pdf')) {
            return 'File must be a PDF';
          }
          return true;
        },
      },
      {
        name: 'focus',
        type: 'list',
        message: 'Analysis Focus:',
        choices: [
          { name: 'All aspects', value: 'all' },
          { name: 'Layout', value: 'layout' },
          { name: 'Readability', value: 'readability' },
          { name: 'Formatting', value: 'formatting' },
          { name: 'Accessibility', value: 'accessibility' },
        ],
        default: 'all',
      },
      {
        name: 'json',
        type: 'confirm',
        message: 'JSON Output?',
        default: false,
      },
    ],
  },
  {
    id: 'cache',
    name: 'Cache Management',
    description: 'Manage the toolbox cache',
    category: 'utility',
    options: [
      {
        name: 'action',
        type: 'list',
        message: 'Action:',
        choices: ['stats', 'clear'],
        default: 'stats',
      },
      {
        name: 'namespace',
        type: 'list',
        message: 'Namespace:',
        choices: ['all', 'jira', 'claude', 'fetch', 'bitbucket'],
        default: 'all',
        when: (answers: any) => answers.action === 'clear',
      },
    ],
  },
];

// Build command from answers
function buildCommand(commandId: string, answers: any): string {
  const parts = ['./toolbox'];
  
  switch (commandId) {
    case 'fetch-jira':
      parts.push('fetch-jira', answers.ticketId);
      if (answers.format !== 'llm') {
        parts.push('--format', answers.format);
      }
      if (answers.excludeComments) {
        parts.push('--no-comments');
      }
      break;
      
    case 'release-notes':
      parts.push('release-notes');
      parts.push('--repo', answers.repo);
      
      if (answers.generationMode === 'fixVersion') {
        parts.push('--fix-version', answers.fixVersion);
      } else {
        if (answers.source !== 'origin/test') {
          parts.push('--source', answers.source);
        }
        if (answers.target !== 'origin/master') {
          parts.push('--target', answers.target);
        }
      }
      
      if (answers.aiModel !== 'none') {
        parts.push('--ai-model', answers.aiModel);
      }
      if (answers.pdf) {
        parts.push('--pdf');
      }
      if (answers.includePrDescriptions) {
        parts.push('--include-pr-descriptions');
      }
      break;
      
    case 'analyze-pdf':
      parts.push('analyze-pdf', answers.file);
      if (answers.focus !== 'all') {
        parts.push('--focus', answers.focus);
      }
      if (answers.json) {
        parts.push('--json');
      }
      break;
      
    case 'cache':
      parts.push('cache', answers.action);
      if (answers.namespace && answers.namespace !== 'all') {
        parts.push('--namespace', answers.namespace);
      }
      break;
  }
  
  return parts.join(' ');
}

program
  .name('wizard')
  .description('Interactive CLI wizard to help build toolbox commands')
  .option('--dry-run', 'Show the command without executing it')
  .action(async (options) => {
    logger.info('Welcome to the Toolbox Wizard!');
    logger.info('This will help you build and run toolbox commands interactively.\n');
    
    try {
      // First, ask which command to run
      const { selectedCommand } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedCommand',
          message: 'Which command would you like to run?',
          choices: commands.map(cmd => ({
            name: `${cmd.name} - ${cmd.description}`,
            value: cmd.id,
          })),
        },
      ]);
      
      // Find the selected command
      const command = commands.find(cmd => cmd.id === selectedCommand);
      if (!command) {
        logger.error('Command not found');
        process.exit(1);
      }
      
      logger.info(`\nConfiguring ${command.name}...\n`);
      
      // Ask for command-specific options
      const answers = await inquirer.prompt(command.options as any);
      
      // Build the command
      const fullCommand = buildCommand(selectedCommand, answers);
      
      logger.info('\nGenerated command:');
      logger.info(fullCommand);
      
      if (options.dryRun) {
        logger.info('\n(Dry run - command not executed)');
        return;
      }
      
      // Ask for confirmation
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
          // Execute the command and inherit stdio to show output in real-time
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