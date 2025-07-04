import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import { logger } from '../../../utils/enhanced-logger';
import { config } from '../../../utils/config';
import { BitbucketClient } from '../../../utils/bitbucket-client';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { formatDistanceToNow } from 'date-fns';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

export async function promptBitbucket() {
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