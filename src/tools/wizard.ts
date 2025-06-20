#!/usr/bin/env ts-node

import { Command } from 'commander';
import inquirer from 'inquirer';
import { logger } from '../utils/enhanced-logger';
import { config } from '../utils/config';
import { BitbucketClient } from '../utils/bitbucket-client';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const program = new Command();

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
      
    case 'bitbucket':
      parts.push('bitbucket', answers.subcommand);
      
      if (answers.subcommand === 'diff-stat' || answers.subcommand === 'review-pr') {
        // prId could be a number or a JIRA ticket string
        parts.push(answers.prId.toString());
        if (answers.directory && answers.directory !== config.getDefaultRepoPath()) {
          parts.push('--dir', answers.directory);
        }
        // Add review-pr specific options
        if (answers.subcommand === 'review-pr') {
          if (answers.model && answers.model !== 'sonnet') {
            parts.push('--model', answers.model);
          }
          if (answers.focus) {
            parts.push('--focus', answers.focus);
          }
        }
      } else {
        // list-prs options
        if (answers.directory && answers.directory !== config.getDefaultRepoPath()) {
          parts.push('--dir', answers.directory);
        }
        if (answers.state !== 'ALL') {
          parts.push('--state', answers.state);
        }
        if (answers.author) {
          parts.push('--author', answers.author);
        }
        if (answers.target) {
          parts.push('--target', answers.target);
        }
        if (answers.limit !== '20') {
          parts.push('--limit', answers.limit);
        }
        if (answers.json) {
          parts.push('--json');
        }
      }
      break;
  }
  
  return parts.join(' ');
}

async function promptFetchJira() {
  return inquirer.prompt([
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
  ]);
}

async function promptReleaseNotes() {
  // First, get the repository path
  const { repo } = await inquirer.prompt([
    {
      name: 'repo',
      type: 'input',
      message: 'Repository Path:',
      default: config.getDefaultRepoPath(),
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
  ]);

  // Then get the generation mode
  const { generationMode } = await inquirer.prompt([
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
  ]);

  // Get mode-specific options
  let modeAnswers: any = {};
  if (generationMode === 'branch') {
    modeAnswers = await inquirer.prompt([
      {
        name: 'source',
        type: 'input',
        message: 'Source Branch:',
        default: 'origin/test',
      },
      {
        name: 'target',
        type: 'input',
        message: 'Target Branch:',
        default: 'origin/master',
      },
    ]);
  } else {
    modeAnswers = await inquirer.prompt([
      {
        name: 'fixVersion',
        type: 'input',
        message: 'Fix Version (e.g., V17.02.00):',
        validate: (input: string) => input.trim() !== '' || 'Fix Version is required',
      },
    ]);
  }

  // Get common options
  const commonAnswers = await inquirer.prompt([
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
  ]);

  return { repo, generationMode, ...modeAnswers, ...commonAnswers };
}

async function promptAnalyzePdf() {
  return inquirer.prompt([
    {
      name: 'file',
      type: 'input',
      message: 'PDF File Path:',
      default: () => {
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
  ]);
}

async function promptCache() {
  const { action } = await inquirer.prompt([
    {
      name: 'action',
      type: 'list',
      message: 'Action:',
      choices: ['stats', 'clear'],
      default: 'stats',
    },
  ]);

  let namespace = 'all';
  if (action === 'clear') {
    const namespaceAnswer = await inquirer.prompt([
      {
        name: 'namespace',
        type: 'list',
        message: 'Namespace:',
        choices: ['all', 'jira', 'claude', 'fetch', 'bitbucket'],
        default: 'all',
      },
    ]);
    namespace = namespaceAnswer.namespace;
  }

  return { action, namespace };
}

async function promptBitbucket() {
  const { subcommand } = await inquirer.prompt([
    {
      name: 'subcommand',
      type: 'list',
      message: 'Bitbucket Action:',
      choices: [
        { name: 'List Pull Requests', value: 'list-prs' },
        { name: 'Show PR Diff Statistics', value: 'diff-stat' },
        { name: 'Review Pull Request (AI Code Review)', value: 'review-pr' }
      ],
      default: 'list-prs',
    },
  ]);

  // Ask for directory
  const { directory } = await inquirer.prompt([
    {
      name: 'directory',
      type: 'input',
      message: 'Git repository directory:',
      default: config.getDefaultRepoPath(),
      validate: (input: string) => {
        if (!input.trim()) {
          return true; // Allow empty to use default
        }
        const absPath = path.resolve(input);
        if (!fs.existsSync(absPath)) {
          return 'Directory does not exist';
        }
        if (!fs.existsSync(path.join(absPath, '.git'))) {
          return 'Not a git repository';
        }
        return true;
      },
    },
  ]);

  // Handle diff-stat and review-pr subcommands
  if (subcommand === 'diff-stat' || subcommand === 'review-pr') {
    // Get repository info to fetch PRs
    let repoInfo;
    try {
      const remoteUrl = execSync('git remote get-url origin', { 
        encoding: 'utf-8',
        cwd: directory || config.getDefaultRepoPath()
      }).trim();
      
      // Parse repo URL
      const sshMatch = remoteUrl.match(/git@bitbucket\.org:([^\/]+)\/([^\.]+)/);
      const httpsMatch = remoteUrl.match(/https:\/\/bitbucket\.org\/([^\/]+)\/([^\.]+)/);
      
      if (sshMatch) {
        repoInfo = { workspace: sshMatch[1], repoSlug: sshMatch[2] };
      } else if (httpsMatch) {
        repoInfo = { workspace: httpsMatch[1], repoSlug: httpsMatch[2] };
      }
    } catch (error) {
      logger.warn('Could not get repository info from git remote');
    }

    if (repoInfo) {
      // Fetch open PRs targeting test branch
      logger.info('Fetching open pull requests targeting test branch...');
      const client = new BitbucketClient(repoInfo);
      
      try {
        const prs = await client.listPullRequests({
          state: 'OPEN',
          targetBranch: 'test',
          limit: 50
        });

        // For review-pr, filter out PRs that are fully approved
        let filteredPrs = prs;
        if (subcommand === 'review-pr') {
          filteredPrs = prs.filter(pr => {
            if (!pr.participants || pr.participants.length === 0) {
              // No participants yet, include it
              return true;
            }
            
            // Check if all reviewers have approved
            const reviewers = pr.participants.filter(p => p.role === 'REVIEWER');
            if (reviewers.length === 0) {
              // No reviewers assigned yet, include it
              return true;
            }
            
            const allReviewersApproved = reviewers.every(p => p.approved);
            return !allReviewersApproved; // Include if not all reviewers have approved
          });
          
          if (filteredPrs.length === 0 && prs.length > 0) {
            logger.info(`Found ${prs.length} open PRs but all are fully approved`);
          }
        }

        if (filteredPrs.length === 0) {
          logger.warn('No open PRs found targeting test branch' + (subcommand === 'review-pr' ? ' that need review' : ''));
          // Fall back to manual input
          const { prId } = await inquirer.prompt([
            {
              name: 'prId',
              type: 'input',
              message: 'Enter PR ID:',
              validate: (input: string) => {
                const num = parseInt(input, 10);
                return !isNaN(num) && num > 0 || 'Please enter a valid PR number';
              },
            },
          ]);
          return { subcommand, directory, prId };
        }

        // Show PR list for selection
        const { selectedPr } = await inquirer.prompt([
          {
            name: 'selectedPr',
            type: 'list',
            message: 'Select a pull request' + (subcommand === 'review-pr' ? ' to review' : '') + ':',
            choices: filteredPrs.map(pr => {
              // Add approval status to the display for review-pr
              let displayName = `#${pr.id} - ${pr.title} (by ${pr.author.display_name})`;
              if (subcommand === 'review-pr' && pr.participants && pr.participants.length > 0) {
                const reviewers = pr.participants.filter(p => p.role === 'REVIEWER');
                const approvedReviewers = reviewers.filter(p => p.approved);
                
                if (approvedReviewers.length > 0) {
                  // Show who has approved
                  const approverNames = approvedReviewers.map(p => p.user.display_name).join(', ');
                  displayName += ` [✓ ${approverNames}]`;
                } else if (reviewers.length > 0) {
                  // Show reviewer count if none have approved
                  displayName += ` [${reviewers.length} reviewer${reviewers.length !== 1 ? 's' : ''}]`;
                }
              }
              return {
                name: displayName,
                value: pr.id
              };
            }),
            pageSize: 15
          },
        ]);

        // For review-pr, ask additional options
        if (subcommand === 'review-pr') {
          const reviewOptions = await inquirer.prompt([
            {
              name: 'model',
              type: 'list',
              message: 'Select Claude model for review:',
              choices: [
                { name: 'Claude Haiku (fast, basic)', value: 'haiku' },
                { name: 'Claude Sonnet (balanced)', value: 'sonnet' },
                { name: 'Claude Opus (thorough)', value: 'opus' }
              ],
              default: 'sonnet'
            },
            {
              name: 'focus',
              type: 'list',
              message: 'Focus area (optional):',
              choices: [
                { name: 'No specific focus', value: '' },
                { name: 'Security', value: 'security' },
                { name: 'Performance', value: 'performance' },
                { name: 'Testing', value: 'testing' },
                { name: 'Code Quality', value: 'code-quality' }
              ],
              default: ''
            }
          ]);
          return { subcommand, directory, prId: selectedPr, ...reviewOptions };
        }

        return { subcommand, directory, prId: selectedPr };
      } catch (error) {
        logger.warn('Could not fetch PRs, falling back to manual input');
      }
    }

    // Fallback to manual input - accept PR ID or JIRA ticket
    const { prId } = await inquirer.prompt([
      {
        name: 'prId',
        type: 'input',
        message: 'Enter PR ID or JIRA ticket (e.g., 123 or APP-1234):',
        validate: (input: string) => {
          // Check if it's a JIRA ticket format
          if (/^[A-Z]+-\d+$/.test(input)) {
            return true;
          }
          // Check if it's a valid PR number
          const num = parseInt(input, 10);
          if (!isNaN(num) && num > 0) {
            return true;
          }
          return 'Please enter a valid PR number or JIRA ticket ID (e.g., APP-1234)';
        },
      },
    ]);

    // For review-pr, ask additional options
    if (subcommand === 'review-pr') {
      const reviewOptions = await inquirer.prompt([
        {
          name: 'model',
          type: 'list',
          message: 'Select Claude model for review:',
          choices: [
            { name: 'Claude Haiku (fast, basic)', value: 'haiku' },
            { name: 'Claude Sonnet (balanced)', value: 'sonnet' },
            { name: 'Claude Opus (thorough)', value: 'opus' }
          ],
          default: 'sonnet'
        },
        {
          name: 'focus',
          type: 'list',
          message: 'Focus area (optional):',
          choices: [
            { name: 'No specific focus', value: '' },
            { name: 'Security', value: 'security' },
            { name: 'Performance', value: 'performance' },
            { name: 'Testing', value: 'testing' },
            { name: 'Code Quality', value: 'code-quality' }
          ],
          default: ''
        }
      ]);
      return { subcommand, directory, prId, ...reviewOptions };
    }

    return { subcommand, directory, prId };
  }

  // For list-prs subcommand
  const commonAnswers = await inquirer.prompt([
    {
      name: 'state',
      type: 'list',
      message: 'PR State:',
      choices: [
        { name: 'Open', value: 'OPEN' },
        { name: 'Merged', value: 'MERGED' },
        { name: 'Declined', value: 'DECLINED' },
        { name: 'All', value: 'ALL' },
      ],
      default: 'OPEN',
    },
    {
      name: 'author',
      type: 'input',
      message: 'Filter by author (optional):',
      default: '',
    },
    {
      name: 'target',
      type: 'input',
      message: 'Filter by target branch (optional):',
      default: '',
    },
    {
      name: 'limit',
      type: 'input',
      message: 'Maximum number of PRs:',
      default: '20',
      validate: (input: string) => {
        const num = parseInt(input, 10);
        return !isNaN(num) && num > 0 && num <= 100 || 'Please enter a number between 1 and 100';
      },
    },
    {
      name: 'json',
      type: 'confirm',
      message: 'Output as JSON?',
      default: false,
    },
  ]);

  return { subcommand, directory, ...commonAnswers };
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
          choices: [
            { name: 'Fetch JIRA Ticket - Fetch and format JIRA ticket information', value: 'fetch-jira' },
            { name: 'Generate Release Notes - Generate release notes from git commits and JIRA tickets', value: 'release-notes' },
            { name: 'Analyze PDF - Analyze a PDF file using AI vision', value: 'analyze-pdf' },
            { name: 'Bitbucket - Interact with Bitbucket repositories', value: 'bitbucket' },
            { name: 'Cache Management - Manage the toolbox cache', value: 'cache' },
          ],
        },
      ]);
      
      logger.info(`\nConfiguring ${selectedCommand}...\n`);
      
      // Get command-specific answers
      let answers: any;
      switch (selectedCommand) {
        case 'fetch-jira':
          answers = await promptFetchJira();
          break;
        case 'release-notes':
          answers = await promptReleaseNotes();
          break;
        case 'analyze-pdf':
          answers = await promptAnalyzePdf();
          break;
        case 'bitbucket':
          answers = await promptBitbucket();
          break;
        case 'cache':
          answers = await promptCache();
          break;
        default:
          logger.error('Unknown command');
          process.exit(1);
      }
      
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