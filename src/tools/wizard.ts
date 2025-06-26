#!/usr/bin/env ts-node

import { Command } from 'commander';
import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import { logger } from '../utils/enhanced-logger';
import { config } from '../utils/config';
import { BitbucketClient } from '../utils/bitbucket-client';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { formatDistanceToNow } from 'date-fns';
import { DateTime } from 'luxon';
import { PostgresClient } from '../utils/postgres-client';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

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
      
    case 'run-sql':
      parts.push('run-sql');
      if (answers.scriptPath) {
        parts.push(answers.scriptPath);
      }
      if (answers.host) {
        parts.push('--host', answers.host);
      }
      if (answers.database) {
        parts.push('--database', answers.database);
      }
      if (answers.user) {
        parts.push('--user', answers.user);
      }
      if (answers.port && answers.port !== '5432') {
        parts.push('--port', answers.port);
      }
      if (answers.variables) {
        for (const [key, value] of Object.entries(answers.variables)) {
          parts.push('--var', `${key}=${value}`);
        }
      }
      if (answers.format !== 'table') {
        parts.push('--format', answers.format);
      }
      if (answers.outputFile) {
        parts.push('--output', answers.outputFile);
      }
      break;
      
    case 'track-day':
      parts.push('track-day');
      if (answers.date) {
        parts.push('--date', answers.date);
      }
      if (!answers.services.includes('slack')) {
        parts.push('--no-slack');
      }
      if (!answers.services.includes('gmail')) {
        parts.push('--no-gmail');
      }
      if (!answers.services.includes('calendar')) {
        parts.push('--no-calendar');
      }
      if (!answers.useLLM) {
        parts.push('--no-llm');
      }
      if (answers.outputFormat === 'json') {
        parts.push('--json');
      } else if (answers.outputFile) {
        parts.push('--output', answers.outputFile);
      }
      if (answers.workdayStart !== '08:00') {
        parts.push('--workday-start', answers.workdayStart);
      }
      if (answers.workdayEnd !== '18:00') {
        parts.push('--workday-end', answers.workdayEnd);
      }
      if (answers.darkPeriodThreshold !== '30') {
        parts.push('--dark-period-threshold', answers.darkPeriodThreshold);
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
      type: 'autocomplete',
      message: 'Output Format:',
      source: async (_answers: any, input: string) => {
        const choices = ['llm', 'raw'];
        if (!input) return choices;
        return choices.filter(choice => choice.toLowerCase().includes(input.toLowerCase()));
      },
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
      type: 'autocomplete',
      message: 'Generation Mode: (type to search)',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'Branch comparison (test vs master)', value: 'branch' },
          { name: 'Fix Version (all tickets with specific version)', value: 'fixVersion' },
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
      },
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
      type: 'autocomplete',
      message: 'AI Model: (type to search)',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'None (no AI analysis)', value: 'none' },
          { name: 'Claude Haiku (fast, basic)', value: 'haiku' },
          { name: 'Claude Sonnet (balanced)', value: 'sonnet' },
          { name: 'Claude Opus (advanced)', value: 'opus' },
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
      },
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
      type: 'autocomplete',
      message: 'Analysis Focus: (type to search)',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'All aspects', value: 'all' },
          { name: 'Layout', value: 'layout' },
          { name: 'Readability', value: 'readability' },
          { name: 'Formatting', value: 'formatting' },
          { name: 'Accessibility', value: 'accessibility' },
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
      },
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
      type: 'autocomplete',
      message: 'Action:',
      source: async (_answers: any, input: string) => {
        const choices = ['stats', 'clear'];
        if (!input) return choices;
        return choices.filter(choice => choice.toLowerCase().includes(input.toLowerCase()));
      },
      default: 'stats',
    },
  ]);

  let namespace = 'all';
  if (action === 'clear') {
    const namespaceAnswer = await inquirer.prompt([
      {
        name: 'namespace',
        type: 'autocomplete',
        message: 'Namespace: (type to search)',
        source: async (_answers: any, input: string) => {
          const choices = ['all', 'jira', 'claude', 'fetch', 'bitbucket'];
          if (!input) return choices;
          return choices.filter(choice => choice.toLowerCase().includes(input.toLowerCase()));
        },
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
      type: 'autocomplete',
      message: 'Bitbucket Action: (type to search)',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'List Pull Requests', value: 'list-prs' },
          { name: 'Show PR Diff Statistics', value: 'diff-stat' },
          { name: 'Review Pull Request (AI Code Review)', value: 'review-pr' }
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
      },
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

        // Fetch full details for each PR to get participant info
        logger.info(`Fetching full details for ${prs.length} PRs...`);
        const prsWithDetails = await Promise.all(
          prs.map(async (pr) => {
            const fullPr = await client.getPullRequestDetails(pr.id);
            return fullPr || pr;
          })
        );
        logger.debug(`Fetched details for ${prsWithDetails.length} PRs`);

        // For review-pr, filter out PRs that are fully approved or draft
        let filteredPrs = prsWithDetails;
        if (subcommand === 'review-pr') {
          filteredPrs = prsWithDetails.filter(pr => {
            // Exclude draft PRs
            if (pr.draft) {
              return false;
            }
            
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
          
          if (filteredPrs.length === 0 && prsWithDetails.length > 0) {
            logger.info(`Found ${prsWithDetails.length} open PRs but all are either draft or fully approved`);
          }
          
          // Debug: Check PR 4333 specifically
          const pr4333 = prsWithDetails.find(pr => pr.id === 4333);
          if (pr4333) {
            logger.debug(`PR 4333 participants: ${JSON.stringify(pr4333.participants)}`);
            const reviewers = pr4333.participants?.filter(p => p.role === 'REVIEWER') || [];
            const allApproved = reviewers.length > 0 && reviewers.every(p => p.approved);
            logger.debug(`PR 4333: ${reviewers.length} reviewers, all approved: ${allApproved}`);
          }
        }

        // Sort PRs by creation time (oldest first)
        filteredPrs.sort((a, b) => {
          const dateA = new Date(a.created_on);
          const dateB = new Date(b.created_on);
          return dateA.getTime() - dateB.getTime();
        });

        if (filteredPrs.length === 0) {
          logger.warn('No open PRs found targeting test branch' + (subcommand === 'review-pr' ? ' that need review (excluding draft and fully approved PRs)' : ''));
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

        // Prepare choices for autocomplete
        const prChoices = filteredPrs.map(pr => {
          // Calculate relative time
          const createdAt = new Date(pr.created_on);
          const relativeTime = formatDistanceToNow(createdAt, { addSuffix: true });
          
          // Add approval status to the display for review-pr
          let displayName = `#${pr.id} - ${pr.title} (by ${pr.author.display_name}, ${relativeTime})`;
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
        });

        // Show PR list for selection with autocomplete
        const { selectedPr } = await inquirer.prompt([
          {
            name: 'selectedPr',
            type: 'autocomplete',
            message: 'Select a pull request' + (subcommand === 'review-pr' ? ' to review' : '') + ' (type to search):',
            source: async (_answers: any, input: string) => {
              if (!input) {
                return prChoices;
              }
              // Filter choices based on input (case-insensitive)
              const searchTerm = input.toLowerCase();
              return prChoices.filter(choice => 
                choice.name.toLowerCase().includes(searchTerm)
              );
            },
            pageSize: 15
          },
        ]);

        // For review-pr, ask additional options
        if (subcommand === 'review-pr') {
          const reviewOptions = await inquirer.prompt([
            {
              name: 'model',
              type: 'autocomplete',
              message: 'Select Claude model for review: (type to search)',
              source: async (_answers: any, input: string) => {
                const choices = [
                  { name: 'Claude Haiku (fast, basic)', value: 'haiku' },
                  { name: 'Claude Sonnet (balanced)', value: 'sonnet' },
                  { name: 'Claude Opus (thorough)', value: 'opus' }
                ];
                if (!input) return choices;
                const searchTerm = input.toLowerCase();
                return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
              },
              default: 'sonnet'
            },
            {
              name: 'focus',
              type: 'autocomplete',
              message: 'Focus area (optional): (type to search)',
              source: async (_answers: any, input: string) => {
                const choices = [
                  { name: 'No specific focus', value: '' },
                  { name: 'Security', value: 'security' },
                  { name: 'Performance', value: 'performance' },
                  { name: 'Testing', value: 'testing' },
                  { name: 'Code Quality', value: 'code-quality' }
                ];
                if (!input) return choices;
                const searchTerm = input.toLowerCase();
                return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
              },
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
          type: 'autocomplete',
          message: 'Select Claude model for review: (type to search)',
          source: async (_answers: any, input: string) => {
            const choices = [
              { name: 'Claude Haiku (fast, basic)', value: 'haiku' },
              { name: 'Claude Sonnet (balanced)', value: 'sonnet' },
              { name: 'Claude Opus (thorough)', value: 'opus' }
            ];
            if (!input) return choices;
            const searchTerm = input.toLowerCase();
            return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
          },
          default: 'sonnet'
        },
        {
          name: 'focus',
          type: 'autocomplete',
          message: 'Focus area (optional): (type to search)',
          source: async (_answers: any, input: string) => {
            const choices = [
              { name: 'No specific focus', value: '' },
              { name: 'Security', value: 'security' },
              { name: 'Performance', value: 'performance' },
              { name: 'Testing', value: 'testing' },
              { name: 'Code Quality', value: 'code-quality' }
            ];
            if (!input) return choices;
            const searchTerm = input.toLowerCase();
            return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
          },
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
      type: 'autocomplete',
      message: 'PR State: (type to search)',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'Open', value: 'OPEN' },
          { name: 'Merged', value: 'MERGED' },
          { name: 'Declined', value: 'DECLINED' },
          { name: 'All', value: 'ALL' },
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
      },
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

async function promptRunSql() {
  const pgClient = new PostgresClient();
  
  // First check if there are any connections
  const connections = await pgClient.getConnections();
  if (connections.length === 0) {
    logger.error('No database connections found in ~/.pgpass');
    logger.info('Please configure your database connections in ~/.pgpass file');
    process.exit(1);
  }
  
  // Get available SQL scripts
  const scripts = await pgClient.listScripts();
  if (scripts.length === 0) {
    logger.warn('No SQL scripts found in sqlscripts directory');
    logger.info('Create .sql files in the sqlscripts directory to use this feature');
  }
  
  // Select connection
  let selectedConnection;
  if (connections.length === 1) {
    selectedConnection = connections[0];
    logger.info(`Using connection: ${selectedConnection.user}@${selectedConnection.host}:${selectedConnection.port}/${selectedConnection.database}`);
  } else {
    const { connIndex } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'connIndex',
        message: 'Select database connection:',
        source: async (_answers: any, input: string) => {
          const choices = connections.map((conn, idx) => ({
            name: `${conn.user}@${conn.host}:${conn.port}/${conn.database}`,
            value: idx
          }));
          
          if (!input) return choices;
          const searchTerm = input.toLowerCase();
          return choices.filter(choice => 
            choice.name.toLowerCase().includes(searchTerm)
          );
        }
      }
    ]);
    selectedConnection = connections[connIndex];
  }
  
  // Select script if available
  let scriptPath = '';
  let variables: { [key: string]: string } = {};
  
  if (scripts.length > 0) {
    const { scriptIndex } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'scriptIndex',
        message: 'Select SQL script:',
        source: async (_answers: any, input: string) => {
          const choices = scripts.map((script, idx) => {
            const vars = script.variables.length > 0 
              ? ` (variables: ${script.variables.map(v => `${v.name}:${v.type}`).join(', ')})`
              : '';
            return {
              name: `${script.name}${vars}`,
              value: idx
            };
          });
          
          if (!input) return choices;
          const searchTerm = input.toLowerCase();
          return choices.filter(choice => 
            choice.name.toLowerCase().includes(searchTerm)
          );
        }
      }
    ]);
    
    const selectedScript = scripts[scriptIndex];
    scriptPath = selectedScript.path;
    
    // Get variable values if needed
    if (selectedScript.variables.length > 0) {
      const defaults = await pgClient.getScriptDefaults(selectedScript.path);
      
      for (const varInfo of selectedScript.variables) {
        const { value } = await inquirer.prompt([
          {
            type: 'input',
            name: 'value',
            message: `Enter value for ${varInfo.name} (${varInfo.type}):`,
            default: defaults[varInfo.name] || '',
            validate: (input: string) => {
              if (!input.trim() && varInfo.type !== 'text') {
                return `Value required for ${varInfo.type} field`;
              }
              if (varInfo.type === 'int' && input.trim() && isNaN(parseInt(input, 10))) {
                return 'Must be a valid integer';
              }
              if (varInfo.type === 'float' && input.trim() && isNaN(parseFloat(input))) {
                return 'Must be a valid number';
              }
              if (varInfo.type === 'boolean' && input.trim() && !['true', 'false', '1', '0', 't', 'f'].includes(input.toLowerCase())) {
                return 'Must be true/false, 1/0, or t/f';
              }
              if (varInfo.type === 'json' && input.trim()) {
                try {
                  JSON.parse(input);
                } catch {
                  return 'Must be valid JSON';
                }
              }
              return true;
            }
          }
        ]);
        variables[varInfo.name] = value;
      }
    }
  } else {
    // Ask for script path manually
    const { manualPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualPath',
        message: 'Enter path to SQL script:',
        validate: (input: string) => {
          if (!input.trim()) return 'Script path is required';
          if (!input.endsWith('.sql')) return 'File must be a .sql file';
          return true;
        }
      }
    ]);
    scriptPath = manualPath;
  }
  
  // Get output format
  const { format } = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'format',
      message: 'Output format:',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'Table (formatted)', value: 'table' },
          { name: 'CSV', value: 'csv' },
          { name: 'JSON', value: 'json' }
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => 
          choice.name.toLowerCase().includes(searchTerm)
        );
      },
      default: 'table'
    }
  ]);
  
  // Get output file for CSV
  let outputFile;
  if (format === 'csv') {
    const { useFile } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useFile',
        message: 'Save to file?',
        default: true
      }
    ]);
    
    if (useFile) {
      const scriptName = path.basename(scriptPath || 'query', '.sql');
      const { filename } = await inquirer.prompt([
        {
          type: 'input',
          name: 'filename',
          message: 'Output filename:',
          default: `${scriptName}_${new Date().toISOString().split('T')[0]}.csv`
        }
      ]);
      outputFile = filename;
    }
  }
  
  return {
    scriptPath,
    host: selectedConnection.host,
    port: selectedConnection.port.toString(),
    database: selectedConnection.database,
    user: selectedConnection.user,
    variables,
    format,
    outputFile
  };
}

async function promptTrackDay() {
  // Ask for date
  const { dateOption } = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'dateOption',
      message: 'Which day to track?',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'Yesterday', value: 'yesterday' },
          { name: 'Today', value: 'today' },
          { name: 'Specific date', value: 'specific' }
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => 
          choice.name.toLowerCase().includes(searchTerm)
        );
      },
      default: 'yesterday'
    }
  ]);

  let date;
  if (dateOption === 'yesterday') {
    date = DateTime.now().minus({ days: 1 }).toISODate();
  } else if (dateOption === 'today') {
    date = DateTime.now().toISODate();
  } else {
    const { specificDate } = await inquirer.prompt([
      {
        type: 'input',
        name: 'specificDate',
        message: 'Enter date (YYYY-MM-DD):',
        default: DateTime.now().minus({ days: 1 }).toISODate(),
        validate: (input: string) => {
          const dt = DateTime.fromISO(input);
          return dt.isValid || 'Please enter a valid date in YYYY-MM-DD format';
        }
      }
    ]);
    date = specificDate;
  }

  // Ask which services to include
  const { services } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'services',
      message: 'Which services to track?',
      choices: [
        { name: 'Slack', value: 'slack', checked: true },
        { name: 'Gmail', value: 'gmail', checked: true },
        { name: 'Google Calendar', value: 'calendar', checked: true }
      ]
    }
  ]);

  // Ask about LLM summarization
  const { useLLM } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useLLM',
      message: 'Use AI to enhance summaries?',
      default: true
    }
  ]);

  // Ask about output format
  const { outputFormat } = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'outputFormat',
      message: 'Output format:',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'CSV file', value: 'csv' },
          { name: 'JSON (to console)', value: 'json' }
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => 
          choice.name.toLowerCase().includes(searchTerm)
        );
      },
      default: 'csv'
    }
  ]);

  let outputFile;
  if (outputFormat === 'csv') {
    const { filename } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filename',
        message: 'Output filename:',
        default: `activity_${date}.csv`
      }
    ]);
    outputFile = filename;
  }

  // Ask about workday settings
  const { customizeWorkday } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'customizeWorkday',
      message: 'Customize workday settings?',
      default: false
    }
  ]);

  let workdayStart = '08:00';
  let workdayEnd = '18:00';
  let darkPeriodThreshold = '30';

  if (customizeWorkday) {
    const workdaySettings = await inquirer.prompt([
      {
        type: 'input',
        name: 'workdayStart',
        message: 'Workday start time (HH:mm):',
        default: '08:00',
        validate: (input: string) => /^\d{2}:\d{2}$/.test(input) || 'Please use HH:mm format'
      },
      {
        type: 'input',
        name: 'workdayEnd',
        message: 'Workday end time (HH:mm):',
        default: '18:00',
        validate: (input: string) => /^\d{2}:\d{2}$/.test(input) || 'Please use HH:mm format'
      },
      {
        type: 'input',
        name: 'darkPeriodThreshold',
        message: 'Minimum gap for dark periods (minutes):',
        default: '30',
        validate: (input: string) => !isNaN(parseInt(input, 10)) || 'Please enter a number'
      }
    ]);
    
    workdayStart = workdaySettings.workdayStart;
    workdayEnd = workdaySettings.workdayEnd;
    darkPeriodThreshold = workdaySettings.darkPeriodThreshold;
  }

  return {
    date,
    services,
    useLLM,
    outputFormat,
    outputFile,
    workdayStart,
    workdayEnd,
    darkPeriodThreshold
  };
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
      const commandChoices = [
        { name: 'Fetch JIRA Ticket - Fetch and format JIRA ticket information', value: 'fetch-jira' },
        { name: 'Generate Release Notes - Generate release notes from git commits and JIRA tickets', value: 'release-notes' },
        { name: 'Analyze PDF - Analyze a PDF file using AI vision', value: 'analyze-pdf' },
        { name: 'Bitbucket - Interact with Bitbucket repositories', value: 'bitbucket' },
        { name: 'Run SQL - Execute SQL scripts with variable substitution', value: 'run-sql' },
        { name: 'Track Day - Summarize daily activities from Slack, Gmail, and Calendar', value: 'track-day' },
        { name: 'Cache Management - Manage the toolbox cache', value: 'cache' },
      ];

      const { selectedCommand } = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'selectedCommand',
          message: 'Which command would you like to run? (type to search)',
          source: async (_answers: any, input: string) => {
            if (!input) {
              return commandChoices;
            }
            // Filter choices based on input (case-insensitive)
            const searchTerm = input.toLowerCase();
            return commandChoices.filter(choice => 
              choice.name.toLowerCase().includes(searchTerm)
            );
          }
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
        case 'run-sql':
          answers = await promptRunSql();
          break;
        case 'track-day':
          answers = await promptTrackDay();
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