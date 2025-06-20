#!/usr/bin/env ts-node

import { Command } from 'commander';
import { BitbucketClient } from '../utils/bitbucket-client';
import { logger } from '../utils/enhanced-logger';
import { config } from '../utils/config';
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
  .command('diff-stat <pr-id>')
  .description('Show diff statistics for a pull request')
  .option('--repo <workspace/slug>', 'Specify repository instead of using current directory')
  .option('-d, --dir <path>', 'Git repository directory', config.getDefaultRepoPath())
  .action(async (prId, options) => {
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
      // Parse PR ID
      const prNumber = parseInt(prId, 10);
      if (isNaN(prNumber)) {
        logger.error('Invalid PR ID. Must be a number.');
        process.exit(1);
      }

      // Get PR details first to show title
      const pr = await client.getPullRequestDetails(prNumber);
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

// Show help if no command specified
if (process.argv.length === 2) {
  program.help();
}

program.parse(process.argv);