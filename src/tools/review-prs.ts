#!/usr/bin/env ts-node

import { Command } from 'commander';
import { BitbucketClient, BitbucketPullRequest } from '../utils/bitbucket-client';
import { fetchJiraTicketCached } from '../utils/cached-jira';
import { JiraCredentials } from '../utils/jira-client';
import { logger } from '../utils/enhanced-logger';
import { config } from '../utils/config';
import { execSync } from 'child_process';
import { DateTime } from 'luxon';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { table } from 'table';

const program = new Command();

interface JiraFixVersion {
  id: string;
  name: string;
  archived: boolean;
  released: boolean;
  releaseDate?: string;
  description?: string;
}

interface JiraTicketInfo {
  key: string;
  summary: string;
  fixVersions: JiraFixVersion[];
  earliestReleaseDate?: string;
  hasUnreleasedVersion: boolean;
  hasVersionWithoutDate: boolean;
}

interface PRDependency {
  pr: BitbucketPullRequest;
  dependsOn: BitbucketPullRequest[];
  blockedBy: BitbucketPullRequest[];
  isBlocked: boolean;
  reviewOrder: number;
}

interface PRWithPriority {
  pr: BitbucketPullRequest;
  jiraTicket?: JiraTicketInfo;
  priority: {
    score: number;
    reason: string;
    releaseDate?: string;
    daysUntilRelease?: number;
    prAge: number;
  };
  dependency?: PRDependency;
}

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
      return null;
    }
    return parsed;
  } catch (error) {
    logger.error(`Failed to get git remote URL from ${directory}. Is this a git repository?`);
    return null;
  }
}

// Extract JIRA ticket ID from PR title or branch
function extractJiraTicket(pr: BitbucketPullRequest): string | null {
  const text = `${pr.title} ${pr.source.branch.name}`;
  const match = text.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

// Get current user's Bitbucket username
async function getCurrentUser(client: BitbucketClient): Promise<string | null> {
  try {
    const token = client.getApiToken();
    const response = await fetch('https://api.bitbucket.org/2.0/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      logger.error(`Failed to get current user from Bitbucket: ${response.status} ${response.statusText}`);
      if (response.status === 401) {
        logger.error('Authentication failed. Check your BITBUCKET_ACCESS_TOKEN');
      }
      return null;
    }
    
    const data = await response.json();
    logger.debug('Current user data:', JSON.stringify(data, null, 2));
    return data.display_name || data.nickname || data.username || data.account_id;
  } catch (error) {
    logger.error('Failed to fetch current user:', error);
    return null;
  }
}

// Detect PR dependencies by analyzing git history
async function detectPRDependencies(
  prs: BitbucketPullRequest[],
  repoPath: string
): Promise<Map<number, PRDependency>> {
  const dependencies = new Map<number, PRDependency>();
  
  // Initialize dependency objects
  for (const pr of prs) {
    dependencies.set(pr.id, {
      pr,
      dependsOn: [],
      blockedBy: [],
      isBlocked: false,
      reviewOrder: 0
    });
  }
  
  // For each PR, check if it contains commits from other PR branches
  for (const pr of prs) {
    const sourceBranch = pr.source.branch.name;
    const targetBranch = pr.destination.branch.name;
    
    for (const otherPr of prs) {
      if (pr.id === otherPr.id) continue;
      
      const otherSourceBranch = otherPr.source.branch.name;
      
      try {
        // Check if PR branch contains commits from other PR branch
        // This command will succeed if otherSourceBranch is an ancestor of sourceBranch
        const mergeBaseCmd = `git merge-base --is-ancestor origin/${otherSourceBranch} origin/${sourceBranch}`;
        try {
          execSync(mergeBaseCmd, {
            cwd: repoPath,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          
          // If we get here, otherPr is an ancestor of pr
          // Check if it's not already in the target branch
          const inTargetCmd = `git merge-base --is-ancestor origin/${otherSourceBranch} origin/${targetBranch}`;
          try {
            execSync(inTargetCmd, {
              cwd: repoPath,
              encoding: 'utf-8',
              stdio: 'pipe'
            });
            // Other PR is already in target, not a dependency
          } catch {
            // Other PR is not in target, so it's a dependency
            const prDep = dependencies.get(pr.id)!;
            const otherDep = dependencies.get(otherPr.id)!;
            
            prDep.dependsOn.push(otherPr);
            otherDep.blockedBy.push(pr);
          }
        } catch {
          // Not an ancestor, no dependency
        }
      } catch (error) {
        logger.debug(`Error checking dependency between PR #${pr.id} and #${otherPr.id}: ${error}`);
      }
    }
  }
  
  // Calculate review order using topological sort
  const visited = new Set<number>();
  const tempMark = new Set<number>();
  const sorted: number[] = [];
  
  function visit(prId: number) {
    if (tempMark.has(prId)) {
      logger.warn(`Circular dependency detected involving PR #${prId}`);
      return;
    }
    if (visited.has(prId)) return;
    
    tempMark.add(prId);
    const dep = dependencies.get(prId)!;
    
    // Visit dependencies first
    for (const depPr of dep.dependsOn) {
      visit(depPr.id);
    }
    
    tempMark.delete(prId);
    visited.add(prId);
    sorted.push(prId);
  }
  
  // Visit all PRs
  for (const pr of prs) {
    visit(pr.id);
  }
  
  // Assign review order
  sorted.forEach((prId, index) => {
    const dep = dependencies.get(prId)!;
    dep.reviewOrder = index;
    dep.isBlocked = dep.dependsOn.length > 0;
  });
  
  return dependencies;
}

// Build dependency chains for visualization
function buildDependencyChains(dependencies: Map<number, PRDependency>): string[][] {
  const chains: string[][] = [];
  const processed = new Set<number>();
  
  // Find root PRs (no dependencies)
  const roots = Array.from(dependencies.values())
    .filter(dep => dep.dependsOn.length === 0)
    .sort((a, b) => a.reviewOrder - b.reviewOrder);
  
  // Build chains starting from roots
  for (const root of roots) {
    if (processed.has(root.pr.id)) continue;
    
    const chain: string[] = [];
    const queue = [root];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (processed.has(current.pr.id)) continue;
      
      processed.add(current.pr.id);
      const ticketId = extractJiraTicket(current.pr) || `PR#${current.pr.id}`;
      chain.push(ticketId);
      
      // Add PRs that depend on this one
      const dependents = Array.from(dependencies.values())
        .filter(dep => dep.dependsOn.some(d => d.id === current.pr.id))
        .sort((a, b) => a.reviewOrder - b.reviewOrder);
      
      queue.push(...dependents);
    }
    
    if (chain.length > 0) {
      chains.push(chain);
    }
  }
  
  return chains;
}

// Calculate priority score (lower is higher priority)
function calculatePriority(pr: BitbucketPullRequest, jiraTicket?: JiraTicketInfo): PRWithPriority['priority'] {
  const now = DateTime.now();
  const prCreated = DateTime.fromISO(pr.created_on);
  const prAge = Math.floor(now.diff(prCreated, 'days').days);
  
  // No ticket or ticket not found - highest priority
  if (!jiraTicket) {
    return {
      score: -1000,
      reason: 'No JIRA ticket found',
      prAge
    };
  }
  
  // No fix versions - very high priority
  if (!jiraTicket.fixVersions || jiraTicket.fixVersions.length === 0) {
    return {
      score: -900,
      reason: 'No Fix Version assigned',
      prAge
    };
  }
  
  // Has version without release date - high priority
  if (jiraTicket.hasVersionWithoutDate) {
    return {
      score: -800,
      reason: 'Fix Version missing release date',
      prAge
    };
  }
  
  // Calculate based on earliest release date
  if (jiraTicket.earliestReleaseDate) {
    const releaseDate = DateTime.fromISO(jiraTicket.earliestReleaseDate);
    const daysUntilRelease = Math.floor(releaseDate.diff(now, 'days').days);
    
    // Base score on days until release (fewer days = lower score = higher priority)
    // Add PR age as secondary factor (older PRs get slight priority boost)
    const score = daysUntilRelease * 1000 - prAge;
    
    return {
      score,
      reason: 'Scheduled release',
      releaseDate: jiraTicket.earliestReleaseDate,
      daysUntilRelease,
      prAge
    };
  }
  
  // Shouldn't reach here, but just in case
  return {
    score: 0,
    reason: 'Unknown',
    prAge
  };
}

// Format PR for display
function formatPRRow(prWithPriority: PRWithPriority, showDependencies: boolean = false): string[] {
  const { pr, jiraTicket, priority, dependency } = prWithPriority;
  
  // PR info
  const prNumber = chalk.yellow(`#${pr.id}`);
  const prTitle = pr.title.length > 50 ? pr.title.substring(0, 47) + '...' : pr.title;
  const prAuthor = pr.author.display_name;
  const prAge = `${priority.prAge}d`;
  
  // JIRA info
  const ticketId = jiraTicket ? chalk.cyan(jiraTicket.key) : chalk.red('No ticket');
  const fixVersion = jiraTicket?.fixVersions[0]?.name || chalk.red('No version');
  
  // Release info
  let releaseInfo = '';
  if (priority.releaseDate && priority.daysUntilRelease !== undefined) {
    const date = DateTime.fromISO(priority.releaseDate).toFormat('MMM dd');
    if (priority.daysUntilRelease < 0) {
      releaseInfo = chalk.red(`${date} (${Math.abs(priority.daysUntilRelease)}d ago)`);
    } else if (priority.daysUntilRelease === 0) {
      releaseInfo = chalk.yellow(`${date} (TODAY)`);
    } else if (priority.daysUntilRelease <= 7) {
      releaseInfo = chalk.yellow(`${date} (${priority.daysUntilRelease}d)`);
    } else {
      releaseInfo = `${date} (${priority.daysUntilRelease}d)`;
    }
  } else if (jiraTicket?.hasVersionWithoutDate) {
    releaseInfo = chalk.yellow('No date');
  } else if (!jiraTicket || jiraTicket.fixVersions.length === 0) {
    releaseInfo = chalk.red('N/A');
  }
  
  // Status/reason
  let status = priority.reason;
  if (priority.reason === 'No JIRA ticket found') {
    status = chalk.red(status);
  } else if (priority.reason === 'No Fix Version assigned') {
    status = chalk.yellow(status);
  } else if (priority.reason === 'Fix Version missing release date') {
    status = chalk.yellow(status);
  }
  
  // Add review priority column if showing dependencies
  if (showDependencies && dependency) {
    let reviewPriority = '';
    if (dependency.isBlocked) {
      const blockers = dependency.dependsOn.map(d => extractJiraTicket(d) || `PR#${d.id}`).join(', ');
      reviewPriority = chalk.yellow(`⏸️  Wait for ${blockers}`);
    } else if (dependency.blockedBy.length > 0) {
      reviewPriority = chalk.green('⭐ Review First');
    } else {
      reviewPriority = chalk.blue('✓ Ready');
    }
    return [prNumber, prTitle, prAuthor, prAge, ticketId, fixVersion, releaseInfo, reviewPriority, status];
  }
  
  return [prNumber, prTitle, prAuthor, prAge, ticketId, fixVersion, releaseInfo, status];
}

program
  .name('review-prs')
  .description('Prioritize pull requests for review based on JIRA Fix Version release dates')
  .option('-d, --dir <path>', 'Git repository directory', config.getDefaultRepoPath())
  .option('--repo <workspace/slug>', 'Specify repository instead of using current directory')
  .option('--no-cache', 'Skip cache and fetch fresh data')
  .option('--cache-ttl <hours>', 'Cache TTL in hours', '24')
  .option('--reviewer <name>', 'Override reviewer name (defaults to current Bitbucket user)')
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show detailed information')
  .option('--show-reviewers', 'Show all reviewer names in open PRs (diagnostic mode)')
  .option('--deps, --show-dependencies', 'Analyze and show PR branch dependencies')
  .action(async (options) => {
    try {
      if (options.verbose) {
        logger.setLevel('debug');
      }

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

      // Create clients
      const bitbucketClient = new BitbucketClient({ workspace, repoSlug });
      
      // Load JIRA credentials
      const jiraCredentials = config.getJiraConfig();
      if (!jiraCredentials) {
        logger.warn('JIRA credentials not configured. Fix Version information will not be available.');
      }

      // Get current user (skip if in diagnostic mode)
      let reviewerName = options.reviewer;
      if (!options.showReviewers) {
        if (!reviewerName) {
          logger.info('Fetching current Bitbucket user...');
          reviewerName = await getCurrentUser(bitbucketClient);
          if (!reviewerName) {
            logger.error('Could not determine current user. Please specify --reviewer');
            process.exit(1);
          }
        }
        logger.info(`Finding PRs awaiting review by: ${reviewerName}`);
      }

      // Fetch all open PRs
      logger.info('Fetching open pull requests...');
      let allPRs = await bitbucketClient.listPullRequests({
        state: 'OPEN',
        limit: 50
      });
      
      // The list API might not return full participant details
      // Fetch individual PR details to get reviewer information
      if (allPRs.length > 0) {
        logger.info('Fetching detailed PR information...');
        const detailedPRs = await Promise.all(
          allPRs.map(async (pr) => {
            const details = await bitbucketClient.getPullRequestDetails(pr.id);
            return details || pr;
          })
        );
        allPRs = detailedPRs;
      }

      // Filter PRs that need review from the current user
      const prsNeedingReview = allPRs.filter(pr => {
        // Skip drafts
        if (pr.draft) return false;
        
        // Check if user is a reviewer
        const userParticipant = pr.participants?.find(p => 
          p.user.display_name === reviewerName && p.role === 'REVIEWER'
        );
        
        // Include if user is a reviewer and hasn't approved yet
        return userParticipant && !userParticipant.approved;
      });

      // Diagnostic mode - show all reviewers
      if (options.showReviewers) {
        console.log(chalk.bold('\n🔍 Diagnostic Mode - All reviewers in open PRs:\n'));
        
        const reviewerSet = new Set<string>();
        
        for (const pr of allPRs) {
          console.log(chalk.yellow(`PR #${pr.id}: ${pr.title}`));
          console.log(chalk.gray(`  Author: ${pr.author.display_name}`));
          
          if (pr.participants && pr.participants.length > 0) {
            console.log(chalk.gray('  Participants:'));
            pr.participants.forEach(p => {
              if (p.role === 'REVIEWER') {
                reviewerSet.add(p.user.display_name);
                const status = p.approved ? chalk.green('✓ Approved') : chalk.yellow('⏳ Pending');
                console.log(`    - ${chalk.cyan(p.user.display_name)} (Reviewer) ${status}`);
              }
            });
          } else {
            console.log(chalk.gray('  No reviewers assigned'));
          }
          console.log();
        }
        
        console.log(chalk.bold('\nUnique reviewer names found:'));
        Array.from(reviewerSet).sort().forEach(name => {
          console.log(`  - ${chalk.cyan(name)}`);
        });
        
        console.log(chalk.gray(`\nUse one of these names with --reviewer "Name"\n`));
        return;
      }
      
      if (prsNeedingReview.length === 0) {
        logger.info('No pull requests awaiting your review!');
        return;
      }

      logger.info(`Found ${prsNeedingReview.length} PRs awaiting your review`);
      
      // Detect dependencies if requested
      let dependencies: Map<number, PRDependency> | undefined;
      if (options.showDependencies || options.deps) {
        logger.info('Analyzing branch dependencies...');
        
        const repoDirectory = options.dir ? path.resolve(options.dir) : process.cwd();
        
        // Make sure we have fetched the latest refs
        try {
          execSync('git fetch --all --prune', {
            cwd: repoDirectory,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
        } catch (error) {
          logger.warn('Failed to fetch latest git refs. Dependency analysis may be incomplete.');
        }
        
        dependencies = await detectPRDependencies(prsNeedingReview, repoDirectory);
      }

      // Extract JIRA tickets and fetch their info
      const prsWithPriority: PRWithPriority[] = [];
      
      for (const pr of prsNeedingReview) {
        const ticketId = extractJiraTicket(pr);
        let jiraTicket: JiraTicketInfo | undefined;
        
        if (ticketId && jiraCredentials) {
          try {
            logger.debug(`Fetching JIRA ticket ${ticketId}...`);
            const ticketData = await fetchJiraTicketCached(
              ticketId,
              jiraCredentials as JiraCredentials,
              { format: 'raw' },
              {
                enabled: options.cache !== false,
                ttl: parseInt(options.cacheTtl) * 60 * 60 * 1000
              }
            );
            
            if (ticketData?.issue) {
              // Extract fix versions with proper typing
              const fixVersions = (ticketData.issue.fields?.fixVersions || []) as JiraFixVersion[];
              
              // Find earliest release date
              let earliestReleaseDate: string | undefined;
              let hasUnreleasedVersion = false;
              let hasVersionWithoutDate = false;
              
              for (const version of fixVersions) {
                if (!version.released) {
                  hasUnreleasedVersion = true;
                  
                  if (version.releaseDate) {
                    if (!earliestReleaseDate || version.releaseDate < earliestReleaseDate) {
                      earliestReleaseDate = version.releaseDate;
                    }
                  } else {
                    hasVersionWithoutDate = true;
                  }
                }
              }
              
              jiraTicket = {
                key: ticketData.issue.key,
                summary: ticketData.issue.fields.summary,
                fixVersions,
                earliestReleaseDate,
                hasUnreleasedVersion,
                hasVersionWithoutDate
              };
            }
          } catch (error) {
            logger.warn(`Failed to fetch JIRA ticket ${ticketId}: ${error}`);
          }
        }
        
        const priority = calculatePriority(pr, jiraTicket);
        const dependency = dependencies?.get(pr.id);
        prsWithPriority.push({ pr, jiraTicket, priority, dependency });
      }

      // Sort by priority score (lower score = higher priority)
      // If showing dependencies, sort by review order first
      if (dependencies) {
        prsWithPriority.sort((a, b) => {
          const orderA = a.dependency?.reviewOrder ?? 999;
          const orderB = b.dependency?.reviewOrder ?? 999;
          if (orderA !== orderB) return orderA - orderB;
          return a.priority.score - b.priority.score;
        });
      } else {
        prsWithPriority.sort((a, b) => a.priority.score - b.priority.score);
      }

      // Output results
      if (options.json) {
        console.log(JSON.stringify(prsWithPriority, null, 2));
      } else {
        // Group by priority reason/release date
        const groups: Map<string, PRWithPriority[]> = new Map();
        
        for (const item of prsWithPriority) {
          let groupKey: string;
          
          if (item.priority.reason === 'No JIRA ticket found') {
            groupKey = '⚠️  No JIRA Ticket';
          } else if (item.priority.reason === 'No Fix Version assigned') {
            groupKey = '⚠️  No Fix Version';
          } else if (item.priority.reason === 'Fix Version missing release date') {
            groupKey = '⚠️  Fix Version Missing Date';
          } else if (item.priority.releaseDate) {
            const date = DateTime.fromISO(item.priority.releaseDate);
            const versionName = item.jiraTicket?.fixVersions[0]?.name || 'Unknown';
            groupKey = `📅 ${date.toFormat('MMM dd, yyyy')} - ${versionName}`;
          } else {
            groupKey = '❓ Other';
          }
          
          if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
          }
          groups.get(groupKey)!.push(item);
        }

        // Display results
        console.log(chalk.bold(`\n🔍 Pull Requests Awaiting Review by ${reviewerName}\n`));
        
        // Show dependency chains if available
        if (dependencies) {
          const chains = buildDependencyChains(dependencies);
          if (chains.length > 0) {
            console.log(chalk.bold('📊 Dependency Chains (Review Order):'));
            chains.forEach((chain, idx) => {
              if (chain.length > 1) {
                console.log(`  Chain ${idx + 1}: ${chain.join(' → ')}`);
              }
            });
            
            // Show independent PRs
            const independentPRs = Array.from(dependencies.values())
              .filter(dep => dep.dependsOn.length === 0 && dep.blockedBy.length === 0)
              .map(dep => extractJiraTicket(dep.pr) || `PR#${dep.pr.id}`);
            
            if (independentPRs.length > 0) {
              console.log(`  Independent: ${independentPRs.join(', ')}`);
            }
            console.log();
          }
        }
        
        for (const [groupName, items] of groups) {
          console.log(chalk.bold.underline(`\n${groupName}`));
          
          const headers = ['PR', 'Title', 'Author', 'Age', 'Ticket', 'Fix Version', 'Release'];
          if (dependencies) {
            headers.push('Review Priority');
          }
          headers.push('Status');
          
          const tableData = [
            headers.map(h => chalk.bold(h)),
            ...items.map(item => formatPRRow(item, !!dependencies))
          ];
          
          const output = table(tableData, {
            drawHorizontalLine: (lineIndex, rowCount) => {
              return lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount;
            },
            columnDefault: {
              paddingLeft: 1,
              paddingRight: 1
            },
            columns: dependencies ? {
              1: { width: 45 }, // Title column
              2: { width: 18 }, // Author column
              7: { width: 20 }, // Review Priority column
              8: { width: 20 }  // Status column
            } : {
              1: { width: 50 }, // Title column
              2: { width: 20 }, // Author column
              7: { width: 25 }  // Status column
            }
          });
          
          console.log(output);
        }

        // Summary
        console.log(chalk.gray(`\nTotal: ${prsWithPriority.length} PRs awaiting review`));
        
        // Show any warnings
        const noTicket = prsWithPriority.filter(p => !p.jiraTicket).length;
        const noVersion = prsWithPriority.filter(p => p.jiraTicket && p.jiraTicket.fixVersions.length === 0).length;
        const noDate = prsWithPriority.filter(p => p.jiraTicket?.hasVersionWithoutDate).length;
        
        if (noTicket > 0 || noVersion > 0 || noDate > 0) {
          console.log(chalk.yellow('\n⚠️  Issues found:'));
          if (noTicket > 0) console.log(chalk.yellow(`   • ${noTicket} PRs without JIRA tickets`));
          if (noVersion > 0) console.log(chalk.yellow(`   • ${noVersion} PRs with tickets missing Fix Version`));
          if (noDate > 0) console.log(chalk.yellow(`   • ${noDate} PRs with Fix Versions missing release date`));
        }
      }

    } catch (error: any) {
      logger.error('Failed:', error.message);
      if (options.verbose && error.stack) {
        logger.debug('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  });

program.parse();