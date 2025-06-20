#!/usr/bin/env ts-node

import { Command } from 'commander';
import { BitbucketClient, BitbucketPullRequest } from '../utils/bitbucket-client';
import { logger } from '../utils/enhanced-logger';
import { config } from '../utils/config';
import { cachedFetch } from '../utils/cached-fetch';
import { execSync } from 'child_process';
import { format } from 'date-fns';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

// Get repository info from git remote
function getRepoInfo(directory: string): { workspace: string; repoSlug: string } | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', { 
      encoding: 'utf-8',
      cwd: directory 
    }).trim();
    const parsed = BitbucketClient.parseRepoUrl(remoteUrl);
    if (!parsed) {
      logger.error('Could not parse Bitbucket repository from git remote');
      logger.info('Remote URL:', remoteUrl);
      return null;
    }
    return parsed;
  } catch (error) {
    logger.error(`Failed to get git remote URL from ${directory}. Is this a git repository?`);
    return null;
  }
}

// Format PR for display
function formatPR(pr: any): string {
  const stateColors = {
    OPEN: chalk.green,
    MERGED: chalk.blue,
    DECLINED: chalk.red,
    SUPERSEDED: chalk.gray
  };
  const stateColor = stateColors[pr.state as keyof typeof stateColors] || chalk.white;

  const state = stateColor(pr.state.padEnd(10));
  const id = chalk.yellow(`#${pr.id}`).padEnd(8);
  const author = pr.author.display_name.padEnd(20);
  const target = pr.destination.branch.name.padEnd(15);
  const created = format(new Date(pr.created_on), 'yyyy-MM-dd');
  
  // Count approvals
  const approvals = pr.participants?.filter((p: any) => p.approved).length || 0;
  const reviewers = pr.participants?.filter((p: any) => p.role === 'REVIEWER').length || 0;
  const approvalStatus = reviewers > 0 ? `${approvals}/${reviewers}` : '-';
  
  return `${state} ${id} ${author} → ${target} ${created} [${approvalStatus}] ${pr.title}`;
}

program
  .name('bitbucket')
  .description('Interact with Bitbucket repositories');

// List PRs subcommand
program
  .command('list-prs')
  .description('List pull requests for the current repository')
  .option('-s, --state <state>', 'Filter by state (OPEN, MERGED, DECLINED, SUPERSEDED, ALL)', 'OPEN')
  .option('-a, --author <name>', 'Filter by author display name')
  .option('-t, --target <branch>', 'Filter by target branch')
  .option('-l, --limit <number>', 'Maximum number of PRs to show (max 50)', '20')
  .option('--json', 'Output as JSON')
  .option('--repo <workspace/slug>', 'Specify repository instead of using current directory')
  .option('-d, --dir <path>', 'Git repository directory', config.getDefaultRepoPath())
  .option('-v, --verbose', 'Show detailed error information')
  .action(async (options) => {
    let workspace: string;
    let repoSlug: string;

    // Get repository info
    if (options.repo) {
      const parts = options.repo.split('/');
      if (parts.length !== 2) {
        logger.error('Repository must be in format: workspace/repo-slug');
        process.exit(1);
      }
      [workspace, repoSlug] = parts;
    } else {
      // Validate directory exists and is a git repo
      const directory = path.resolve(options.dir);
      if (!fs.existsSync(directory)) {
        logger.error(`Directory does not exist: ${directory}`);
        process.exit(1);
      }
      if (!fs.existsSync(path.join(directory, '.git'))) {
        logger.error(`Not a git repository: ${directory}`);
        process.exit(1);
      }
      
      const repoInfo = getRepoInfo(directory);
      if (!repoInfo) {
        process.exit(1);
      }
      ({ workspace, repoSlug } = repoInfo);
    }

    // Create client
    const client = new BitbucketClient({ workspace, repoSlug });

    // Validate state
    const validStates = ['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED', 'ALL'];
    const state = options.state.toUpperCase();
    if (!validStates.includes(state)) {
      logger.error(`Invalid state: ${options.state}. Must be one of: ${validStates.join(', ')}`);
      process.exit(1);
    }

    // List PRs
    logger.info(`Fetching pull requests for ${workspace}/${repoSlug}...`);
    
    // Show warning about client-side filtering
    if (options.author || options.target) {
      logger.info('Note: Author and target branch filters are applied client-side after fetching results.');
    }
    
    try {
      const prs = await client.listPullRequests({
        state: state as any,
        author: options.author,
        targetBranch: options.target,
        limit: parseInt(options.limit, 10)
      });

      if (prs.length === 0) {
        logger.info('No pull requests found matching the criteria');
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(prs, null, 2));
      } else {
        // Display header
        console.log(chalk.bold('\nPull Requests:'));
        console.log(chalk.gray('─'.repeat(100)));
        console.log(chalk.bold('State      PR#      Author               Target          Created     Approvals Title'));
        console.log(chalk.gray('─'.repeat(100)));
        
        // Display PRs
        prs.forEach(pr => {
          console.log(formatPR(pr));
        });
        
        console.log(chalk.gray('─'.repeat(100)));
        console.log(`\nShowing ${prs.length} pull request${prs.length !== 1 ? 's' : ''}`);
        
        // Show filter info
        const filters: string[] = [];
        if (state !== 'ALL') filters.push(`state: ${state}`);
        if (options.author) filters.push(`author: ${options.author}`);
        if (options.target) filters.push(`target: ${options.target}`);
        if (filters.length > 0) {
          console.log(chalk.gray(`Filters: ${filters.join(', ')}`));
        }
      }
    } catch (error: any) {
      if (error.message) {
        logger.error('Failed:', error.message);
      } else if (typeof error === 'string') {
        logger.error('Failed:', error);
      } else {
        logger.error('Failed with unknown error');
        if (options.verbose) {
          console.error('Full error object:', JSON.stringify(error, null, 2));
        }
      }
      if (error.stack && options.verbose) {
        logger.debug('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  });

// Diff stat subcommand
program
  .command('diff-stat <pr-id-or-ticket>')
  .description('Show diff statistics for a pull request (by PR ID or JIRA ticket)')
  .option('--repo <workspace/slug>', 'Specify repository instead of using current directory')
  .option('-d, --dir <path>', 'Git repository directory', config.getDefaultRepoPath())
  .action(async (prIdOrTicket, options) => {
    let workspace: string;
    let repoSlug: string;

    // Get repository info
    if (options.repo) {
      const parts = options.repo.split('/');
      if (parts.length !== 2) {
        logger.error('Repository must be in format: workspace/repo-slug');
        process.exit(1);
      }
      [workspace, repoSlug] = parts;
    } else {
      // Validate directory exists and is a git repo
      const directory = path.resolve(options.dir);
      if (!fs.existsSync(directory)) {
        logger.error(`Directory does not exist: ${directory}`);
        process.exit(1);
      }
      if (!fs.existsSync(path.join(directory, '.git'))) {
        logger.error(`Not a git repository: ${directory}`);
        process.exit(1);
      }
      
      const repoInfo = getRepoInfo(directory);
      if (!repoInfo) {
        process.exit(1);
      }
      ({ workspace, repoSlug } = repoInfo);
    }

    // Create client
    const client = new BitbucketClient({ workspace, repoSlug });

    try {
      let pr: BitbucketPullRequest | null = null;
      let prNumber: number;

      // Check if input is a JIRA ticket ID (format: LETTERS-NUMBERS)
      const jiraTicketMatch = prIdOrTicket.match(/^([A-Z]+-\d+)$/);
      
      if (jiraTicketMatch) {
        // It's a JIRA ticket, search for matching PR
        const ticketId = jiraTicketMatch[1];
        logger.info(`Searching for pull requests matching JIRA ticket ${ticketId}...`);
        
        const prs = await client.getPullRequestsForTicket(ticketId);
        const openPrs = prs.filter(pr => pr.state === 'OPEN');
        
        if (openPrs.length === 0) {
          logger.error(`No open pull requests found for ticket ${ticketId}`);
          if (prs.length > 0) {
            logger.info('Found the following non-open PRs:');
            prs.forEach(pr => {
              logger.info(`  PR #${pr.id} (${pr.state}): ${pr.title}`);
            });
          }
          process.exit(1);
        } else if (openPrs.length === 1) {
          pr = openPrs[0];
          prNumber = pr.id;
          logger.info(`Found PR #${prNumber}: ${pr.title}`);
        } else {
          // Multiple open PRs, show them and ask user to be more specific
          logger.error(`Multiple open pull requests found for ticket ${ticketId}:`);
          openPrs.forEach(pr => {
            logger.info(`  PR #${pr.id}: ${pr.title} (by ${pr.author.display_name})`);
          });
          logger.info('Please specify the PR ID directly');
          process.exit(1);
        }
      } else {
        // Try to parse as PR number
        prNumber = parseInt(prIdOrTicket, 10);
        if (isNaN(prNumber)) {
          logger.error('Invalid input. Must be a PR number or JIRA ticket ID (e.g., APP-1234)');
          process.exit(1);
        }

        // Get PR details
        pr = await client.getPullRequestDetails(prNumber);
      }

      // Show PR details if we have them
      if (pr) {
        console.log(chalk.bold(`\nPull Request #${pr.id}: ${pr.title}`));
        console.log(chalk.gray(`Author: ${pr.author.display_name} | Target: ${pr.destination.branch.name} | State: ${pr.state}\n`));
      }

      // Get and display diff stat
      const diffStat = await client.getPullRequestDiffStat(prNumber);
      console.log(diffStat);
    } catch (error: any) {
      logger.error('Failed:', error.message);
      process.exit(1);
    }
  });

// Review PR subcommand
program
  .command('review-pr <pr-id-or-ticket>')
  .description('Perform AI code review on a pull request (by PR ID or JIRA ticket)')
  .option('--repo <workspace/slug>', 'Specify repository instead of using current directory')
  .option('-d, --dir <path>', 'Git repository directory', config.getDefaultRepoPath())
  .option('--model <model>', 'Claude model to use (haiku, sonnet, opus)', 'sonnet')
  .option('--focus <area>', 'Focus on specific review area (security, performance, testing, etc.)')
  .action(async (prIdOrTicket, options) => {
    let workspace: string;
    let repoSlug: string;

    // Get repository info
    if (options.repo) {
      const parts = options.repo.split('/');
      if (parts.length !== 2) {
        logger.error('Repository must be in format: workspace/repo-slug');
        process.exit(1);
      }
      [workspace, repoSlug] = parts;
    } else {
      // Validate directory exists and is a git repo
      const directory = path.resolve(options.dir);
      if (!fs.existsSync(directory)) {
        logger.error(`Directory does not exist: ${directory}`);
        process.exit(1);
      }
      if (!fs.existsSync(path.join(directory, '.git'))) {
        logger.error(`Not a git repository: ${directory}`);
        process.exit(1);
      }
      
      const repoInfo = getRepoInfo(directory);
      if (!repoInfo) {
        process.exit(1);
      }
      ({ workspace, repoSlug } = repoInfo);
    }

    // Create client
    const client = new BitbucketClient({ workspace, repoSlug });

    try {
      let pr: BitbucketPullRequest | null = null;
      let prNumber: number;

      // Check if input is a JIRA ticket ID (format: LETTERS-NUMBERS)
      const jiraTicketMatch = prIdOrTicket.match(/^([A-Z]+-\d+)$/);
      
      if (jiraTicketMatch) {
        // It's a JIRA ticket, search for matching PR
        const ticketId = jiraTicketMatch[1];
        logger.info(`Searching for pull requests matching JIRA ticket ${ticketId}...`);
        
        const prs = await client.getPullRequestsForTicket(ticketId);
        const openPrs = prs.filter(pr => pr.state === 'OPEN');
        
        if (openPrs.length === 0) {
          logger.error(`No open pull requests found for ticket ${ticketId}`);
          if (prs.length > 0) {
            logger.info('Found the following non-open PRs:');
            prs.forEach(pr => {
              logger.info(`  PR #${pr.id} (${pr.state}): ${pr.title}`);
            });
          }
          process.exit(1);
        } else if (openPrs.length === 1) {
          pr = openPrs[0];
          prNumber = pr.id;
          logger.info(`Found PR #${prNumber}: ${pr.title}`);
        } else {
          // Multiple open PRs, show them and ask user to be more specific
          logger.error(`Multiple open pull requests found for ticket ${ticketId}:`);
          openPrs.forEach(pr => {
            logger.info(`  PR #${pr.id}: ${pr.title} (by ${pr.author.display_name})`);
          });
          logger.info('Please specify the PR ID directly');
          process.exit(1);
        }
      } else {
        // Try to parse as PR number
        prNumber = parseInt(prIdOrTicket, 10);
        if (isNaN(prNumber)) {
          logger.error('Invalid input. Must be a PR number or JIRA ticket ID (e.g., APP-1234)');
          process.exit(1);
        }

        logger.info(`Fetching PR #${prNumber} details...`);

        // Get PR details
        pr = await client.getPullRequestDetails(prNumber);
        if (!pr) {
          logger.error(`Pull request #${prNumber} not found`);
          process.exit(1);
        }
      }

      console.log(chalk.bold(`\nReviewing PR #${pr.id}: ${pr.title}`));
      console.log(chalk.gray(`Author: ${pr.author.display_name} | Target: ${pr.destination.branch.name} | State: ${pr.state}\n`));

      // Extract JIRA ticket ID from PR title or branch name
      const ticketMatch = (pr.title + ' ' + pr.source.branch.name).match(/([A-Z]+-\d+)/);
      let jiraContext = '';
      
      if (ticketMatch) {
        const ticketId = ticketMatch[1];
        logger.info(`Found JIRA ticket: ${ticketId}`);
        
        try {
          // Fetch JIRA ticket details
          const { spawnSync } = require('child_process');
          const toolboxPath = path.join(__dirname, '../../..');
          
          // Use spawnSync for better error handling
          const result = spawnSync(toolboxPath + '/toolbox', ['fetch-jira', ticketId, '--format', 'llm'], {
            encoding: 'utf-8',
            cwd: options.dir || config.getDefaultRepoPath(),
            env: { ...process.env }  // Pass through environment variables
          });
          
          logger.debug(`Command exit code: ${result.status}`);
          
          if (result.error) {
            throw new Error(`Command failed: ${result.error.message}`);
          }
          
          if (result.status !== 0) {
            // Command failed
            const errorMsg = result.stderr || result.stdout || 'Unknown error';
            throw new Error(`Command exited with code ${result.status}: ${errorMsg}`);
          }
          
          // Check if we got valid output
          const jiraOutput = result.stdout;
          if (jiraOutput && jiraOutput.trim() && !jiraOutput.includes('Error:') && !jiraOutput.includes('Failed')) {
            jiraContext = `JIRA Ticket ${ticketId} Summary:\n${jiraOutput}\n`;
            logger.debug(`Successfully fetched JIRA ticket ${ticketId}`);
          } else {
            logger.debug(`JIRA ticket ${ticketId} fetch returned invalid output: ${jiraOutput}`);
          }
        } catch (error: any) {
          // Parse the error message
          const errorMsg = error.message || '';
          
          // Always log the actual error
          logger.error(`JIRA fetch failed: ${errorMsg}`);
          
          if (errorMsg.includes('JIRA credentials not found') || errorMsg.includes('No JIRA configuration found')) {
            logger.warn(`JIRA credentials not configured - cannot fetch ticket ${ticketId}`);
            logger.info('Configure JIRA credentials by setting JIRA_EMAIL and JIRA_API_TOKEN');
          } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
            logger.warn(`JIRA ticket ${ticketId} not found (404)`);
          } else if (errorMsg.includes('ENOENT')) {
            logger.error(`Toolbox command not found at expected path`);
          } else if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
            logger.error(`JIRA authentication failed - check your JIRA_API_TOKEN`);
          } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
            logger.error(`JIRA access forbidden - check your permissions for ticket ${ticketId}`);
          } else {
            // Log the full error for debugging
            logger.warn(`Could not fetch JIRA ticket ${ticketId}: ${errorMsg}`);
          }
        }
      }

      // Get the diff
      logger.info('Fetching PR diff...');
      const diffUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/pullrequests/${prNumber}/diff`;
      
      const diffResponse = await cachedFetch.fetch(diffUrl, {
        headers: {
          'Authorization': `Bearer ${client.getApiToken()}`,
          'Accept': 'text/plain'
        },
        cacheOptions: {
          namespace: 'bitbucket',
          ttl: 5 * 60 * 1000
        }
      });

      if (!diffResponse.ok) {
        throw new Error(`Failed to fetch diff: ${diffResponse.status}`);
      }

      const diff = await diffResponse.text();
      
      // Prepare the review prompt
      const reviewPrompt = `You are reviewing pull request #${pr.id}: ${pr.title}

CONTEXT:
${jiraContext || 'No JIRA ticket found for additional context.'}

PR DESCRIPTION:
${pr.description || 'No description provided.'}

CODE CHANGES:
\`\`\`diff
${diff}
\`\`\`

Please perform a thorough code review analyzing the following aspects:

1. **Completeness**
   - Does the implementation fully address the requirements${jiraContext ? ' from the JIRA ticket' : ''}?
   - Are there any missing edge cases or error handling?
   - Are all acceptance criteria met?

2. **Security**
   - Are there any potential security vulnerabilities (SQL injection, XSS, authentication bypasses)?
   - Is sensitive data properly handled and not exposed in logs or responses?
   - Are API keys, credentials, or secrets hardcoded anywhere?

3. **Code Quality**
   - Is the code readable and maintainable?
   - Does it follow the project's coding standards and patterns?
   - Are functions and variables named clearly?
   - Is there appropriate error handling?

4. **Logic & Correctness**
   - Is the business logic correct and complete?
   - Are there any potential race conditions or concurrency issues?
   - Will this work correctly in all supported environments?

5. **Performance**
   - Are there any obvious performance bottlenecks?
   - Are database queries optimized?
   - Is there unnecessary computation or redundant API calls?

6. **Testing**
   - Are there adequate tests for the new functionality?
   - Do the tests cover edge cases?
   - Are existing tests still passing?

7. **Clean Code Checklist**
   - [ ] No debugging console.log/print statements left in code
   - [ ] No commented-out code blocks
   - [ ] No TODO/FIXME comments that should be addressed
   - [ ] No hardcoded test data or magic numbers
   - [ ] Proper error messages for user-facing errors

8. **Dependencies**
   - Are new dependencies necessary and from trusted sources?
   - Are dependency versions pinned appropriately?

${options.focus ? `\nPLEASE FOCUS ESPECIALLY ON: ${options.focus.toUpperCase()}\n` : ''}

Please provide:
- A summary of your findings organized by severity (Critical/High/Medium/Low)
- Any critical issues that must be fixed before merging
- Suggestions for improvements
- Overall assessment (Approve/Request Changes/Comment)`;

      // Call Claude for review
      logger.info(`Analyzing code with Claude ${options.model}...`);
      const { createClaudeClient } = await import('../utils/claude-client');
      
      const claudeClient = createClaudeClient(undefined, options.model);
      if (!claudeClient) {
        throw new Error('Failed to initialize Claude client. Check ANTHROPIC_API_KEY');
      }
      
      const review = await claudeClient.analyze(reviewPrompt, {
        maxTokens: 4000
      });

      // Display the review
      console.log(chalk.bold('\n=== Code Review Results ===\n'));
      console.log(review);
      
    } catch (error: any) {
      logger.error('Failed:', error.message);
      process.exit(1);
    }
  });

// Show help if no command specified
if (process.argv.length === 2) {
  program.help();
}

program.parse(process.argv);