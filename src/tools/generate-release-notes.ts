#!/usr/bin/env node
import { Command } from 'commander';
import { logger, progress, FileSystem, config as appConfig, HtmlGenerator } from '../utils';
import type { ReleaseNotesData, TicketInfo, CommitInfo } from '../utils';
import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';
import { format } from 'date-fns';

interface ReleaseNotesConfig {
  repoPath: string;
  sourceBranch: string;
  targetBranch: string;
  workDir: string;
  outputFile: string;
  keepFiles: boolean;
  verbose: boolean;
  jiraProject?: string;
  fetchJiraDetails: boolean;
  useAI: boolean;
}

const program = new Command();

program
  .name('generate-release-notes')
  .description('Generate release notes from git commits between branches')
  .option('-p, --repo <path>', 'path to git repository (default: current directory)', process.cwd())
  .option('-s, --source <branch>', 'source branch with new commits (default: origin/test)', 'origin/test')
  .option('-t, --target <branch>', 'target branch to compare against (default: origin/master)', 'origin/master')
  .option('-o, --output <file>', 'output file name', `release_notes_${format(new Date(), 'yyyy-MM-dd')}.html`)
  .option('--work-dir <dir>', 'working directory for intermediate files', '.release_notes_work')
  .option('-c, --clean', 'clean intermediate files and exit')
  .option('-r, --resume', 'resume from last successful step')
  .option('--step <step>', 'run specific step only')
  .option('-l, --list-steps', 'list all available steps')
  .option('-k, --keep', 'keep intermediate files after completion')
  .option('-v, --verbose', 'show detailed output')
  .option('--no-jira', 'skip fetching Jira ticket details')
  .option('--no-ai', 'skip AI-powered code analysis')
  .option('--jira-project <prefix>', 'Jira project prefix (e.g., APP)', 'APP')
  .action(async (options) => {
    try {
      logger.header('Release Notes Generator v2.0');

      // Validate repository path
      const repoPath = path.resolve(options.repo);
      if (!FileSystem.exists(path.join(repoPath, '.git'))) {
        logger.error(`Not a git repository: ${repoPath}`);
        logger.info('Use --repo <path> to specify the repository location');
        process.exit(1);
      }

      const config: ReleaseNotesConfig = {
        repoPath,
        sourceBranch: options.source,
        targetBranch: options.target,
        workDir: path.join(repoPath, options.workDir),
        outputFile: path.join(repoPath, options.output),
        keepFiles: options.keep || false,
        verbose: options.verbose || false,
        jiraProject: options.jiraProject,
        fetchJiraDetails: !options.noJira,
        useAI: !options.noAi,
      };

      logger.info(`Repository: ${config.repoPath}`);
      logger.info(`Branches: ${config.targetBranch}..${config.sourceBranch}`);

      if (options.listSteps) {
        displaySteps();
        process.exit(0);
      }

      if (options.clean) {
        await cleanWorkspace(config);
        process.exit(0);
      }

      // Initialize git
      const git: SimpleGit = simpleGit(config.repoPath);

      // Check if branches exist
      await validateBranches(git, config);

      // Initialize work directory
      await FileSystem.ensureDir(config.workDir);

      // Run the workflow
      if (options.step) {
        await runStep(options.step, git, config);
      } else {
        await runAllSteps(git, config, options.resume);
      }

      logger.success(`Release notes generated: ${config.outputFile}`);

      // Cleanup if not keeping files
      if (!config.keepFiles) {
        await cleanWorkspace(config);
      }

    } catch (error: any) {
      logger.error(`Failed to generate release notes: ${error.message}`);
      if (options.verbose) {
        console.error(error);
      }
      process.exit(1);
    }
  });

function displaySteps(): void {
  console.log(`
Available steps:
  ${logger.bold('fetch')}       - Fetch commits between branches
  ${logger.bold('extract')}     - Extract unique ticket numbers
  ${logger.bold('categorize')}  - Categorize tickets by type
  ${logger.bold('details')}     - Fetch ticket details from Jira
  ${logger.bold('analyze')}     - Analyze code changes with AI (optional)
  ${logger.bold('generate')}    - Generate final release notes
  ${logger.bold('all')}         - Run all steps (default)
  `);
}

async function validateBranches(git: SimpleGit, config: ReleaseNotesConfig): Promise<void> {
  progress.start('Validating branches...');
  
  try {
    // Fetch latest changes
    await git.fetch(['--all']);
    
    // Check if branches exist
    const branches = await git.branch(['-r']);
    const remoteBranches = branches.all;
    
    if (!remoteBranches.includes(config.sourceBranch)) {
      throw new Error(`Source branch not found: ${config.sourceBranch}`);
    }
    
    if (!remoteBranches.includes(config.targetBranch)) {
      throw new Error(`Target branch not found: ${config.targetBranch}`);
    }
    
    progress.succeed('Branches validated');
  } catch (error) {
    progress.fail();
    throw error;
  }
}

async function cleanWorkspace(config: ReleaseNotesConfig): Promise<void> {
  if (FileSystem.exists(config.workDir)) {
    progress.start('Cleaning workspace...');
    await FileSystem.remove(config.workDir);
    progress.succeed('Workspace cleaned');
  } else {
    logger.info('Nothing to clean');
  }
}

async function runStep(step: string, git: SimpleGit, config: ReleaseNotesConfig): Promise<void> {
  switch (step) {
    case 'fetch':
      await stepFetchCommits(git, config);
      break;
    case 'extract':
      await stepExtractTickets(config);
      break;
    case 'categorize':
      await stepCategorizeTickets(config);
      break;
    case 'details':
      await stepFetchTicketDetails(config);
      break;
    case 'analyze':
      await stepAnalyzeCode(git, config);
      break;
    case 'generate':
      await stepGenerateNotes(config);
      break;
    default:
      throw new Error(`Unknown step: ${step}`);
  }
}

async function runAllSteps(git: SimpleGit, config: ReleaseNotesConfig, resume: boolean): Promise<void> {
  const steps = ['fetch', 'extract', 'categorize', 'details', 'analyze', 'generate'];
  let startIndex = 0;

  if (resume) {
    const lastStep = await getLastCompletedStep(config);
    startIndex = steps.indexOf(lastStep) + 1;
    if (startIndex > 0) {
      logger.info(`Resuming from step: ${steps[startIndex] || 'complete'}`);
    }
  }

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    
    // Skip optional steps if disabled
    if (step === 'details' && !config.fetchJiraDetails) {
      logger.info('Skipping Jira details (disabled)');
      continue;
    }
    if (step === 'analyze' && !config.useAI) {
      logger.info('Skipping AI analysis (disabled)');
      continue;
    }

    await runStep(step, git, config);
    await saveProgress(config, step);
  }
}

async function getLastCompletedStep(config: ReleaseNotesConfig): Promise<string> {
  const progressFile = path.join(config.workDir, '.progress');
  if (FileSystem.exists(progressFile)) {
    return (await FileSystem.readFile(progressFile)).trim();
  }
  return '';
}

async function saveProgress(config: ReleaseNotesConfig, step: string): Promise<void> {
  const progressFile = path.join(config.workDir, '.progress');
  await FileSystem.writeFile(progressFile, step);
}

// Step implementations (placeholders for now)
async function stepFetchCommits(git: SimpleGit, config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 1: Fetching Commits');
  
  const outputFile = path.join(config.workDir, 'commits.txt');
  
  if (FileSystem.exists(outputFile)) {
    logger.info('Using cached commits');
    return;
  }

  progress.start(`Fetching commits between ${config.targetBranch} and ${config.sourceBranch}`);
  
  try {
    // Get commits that are in source but not in target
    const log = await git.log([
      `${config.targetBranch}..${config.sourceBranch}`,
      '--oneline',
      '--no-merges'
    ]);
    
    const commits = log.all.map(commit => `${commit.hash.substring(0, 7)} ${commit.message}`);
    await FileSystem.writeFile(outputFile, commits.join('\n'));
    
    progress.succeed(`Found ${commits.length} commits`);
    
    if (config.verbose && commits.length > 0) {
      logger.info('First 5 commits:');
      commits.slice(0, 5).forEach(c => console.log(`  ${c}`));
    }
  } catch (error) {
    progress.fail();
    throw error;
  }
}

async function stepExtractTickets(config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 2: Extracting Tickets');
  
  const inputFile = path.join(config.workDir, 'commits.txt');
  const outputFile = path.join(config.workDir, 'tickets.txt');
  
  if (!FileSystem.exists(inputFile)) {
    throw new Error('commits.txt not found. Run fetch step first.');
  }
  
  if (FileSystem.exists(outputFile)) {
    logger.info('Using cached tickets');
    return;
  }

  progress.start('Extracting ticket numbers...');
  
  const commits = await FileSystem.readFile(inputFile);
  const ticketPattern = new RegExp(`${config.jiraProject}-\\d+`, 'g');
  const tickets = [...new Set(commits.match(ticketPattern) || [])];
  
  await FileSystem.writeFile(outputFile, tickets.join('\n'));
  
  progress.succeed(`Found ${tickets.length} unique tickets`);
  
  if (config.verbose && tickets.length > 0) {
    logger.info(`Tickets: ${tickets.join(', ')}`);
  }
}

async function stepCategorizeTickets(config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 3: Categorizing Tickets');
  
  const commitsFile = path.join(config.workDir, 'commits.txt');
  const ticketsFile = path.join(config.workDir, 'tickets.txt');
  const outputFile = path.join(config.workDir, 'categories.json');
  
  if (!FileSystem.exists(commitsFile) || !FileSystem.exists(ticketsFile)) {
    throw new Error('Required files not found. Run previous steps first.');
  }
  
  if (FileSystem.exists(outputFile)) {
    logger.info('Using cached categories');
    return;
  }

  // Initialize categories
  const categories: Record<string, string[]> = {
    bug_fixes: [],
    new_features: [],
    ui_updates: [],
    api_changes: [],
    refactoring: [],
    other: []
  };

  const commits = await FileSystem.readFile(commitsFile);
  const tickets = (await FileSystem.readFile(ticketsFile)).split('\n').filter(Boolean);
  
  const total = tickets.length;
  let current = 0;

  progress.start(`Categorizing ${total} tickets...`);

  for (const ticket of tickets) {
    current++;
    if (config.verbose) {
      progress.update(`Categorizing ${current}/${total}: ${ticket}`);
    }

    // Get all commits for this ticket
    const ticketCommits = commits.split('\n')
      .filter(line => line.includes(ticket))
      .join(' ').toLowerCase();

    // Categorize based on commit messages
    let category = 'other';
    
    if (/\b(fix|bug|error|crash|issue|resolve|patch)\b/.test(ticketCommits)) {
      category = 'bug_fixes';
    } else if (/\b(add|new|implement|create|feature|introduce)\b/.test(ticketCommits)) {
      category = 'new_features';
    } else if (/\b(ui|style|css|design|layout|responsive|theme)\b/.test(ticketCommits)) {
      category = 'ui_updates';
    } else if (/\b(api|endpoint|route|controller|backend|service)\b/.test(ticketCommits)) {
      category = 'api_changes';
    } else if (/\b(refactor|cleanup|optimize|improve|simplify)\b/.test(ticketCommits)) {
      category = 'refactoring';
    }

    categories[category].push(ticket);
  }

  await FileSystem.writeJSON(outputFile, categories);
  
  progress.succeed('Categorization complete');

  // Show summary
  logger.info('Category Summary:');
  Object.entries(categories).forEach(([cat, tickets]) => {
    if (tickets.length > 0) {
      logger.info(`  ${cat.replace(/_/g, ' ')}: ${tickets.length}`);
    }
  });
}

async function stepFetchTicketDetails(config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 4: Fetching Ticket Details');
  
  if (!config.fetchJiraDetails) {
    logger.info('Skipping Jira details (disabled)');
    return;
  }

  const ticketsFile = path.join(config.workDir, 'tickets.txt');
  const outputFile = path.join(config.workDir, 'ticket_details.json');
  
  if (!FileSystem.exists(ticketsFile)) {
    throw new Error('tickets.txt not found. Run extract step first.');
  }
  
  if (FileSystem.exists(outputFile)) {
    logger.info('Using cached ticket details');
    return;
  }

  const tickets = (await FileSystem.readFile(ticketsFile)).split('\n').filter(Boolean);
  const ticketDetails: Record<string, any> = {};
  
  // Check if we have Jira configuration
  const jiraConfig = appConfig.getJiraConfig();
  if (!jiraConfig) {
    logger.warn('Jira configuration not found. Skipping ticket details.');
    await FileSystem.writeJSON(outputFile, ticketDetails);
    return;
  }

  const total = tickets.length;
  let current = 0;
  let successful = 0;

  progress.start(`Fetching details for ${total} tickets...`);

  // Import fetch-jira functionality
  const { execSync } = await import('child_process');
  const toolboxPath = path.resolve(__dirname, '../../..');

  for (const ticket of tickets) {
    current++;
    progress.update(`Fetching ${current}/${total}: ${ticket}`);

    try {
      // Use our fetch-jira tool via command line
      const result = execSync(
        `cd "${toolboxPath}" && ./toolbox fetch-jira ${ticket} --format llm`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const ticketData = JSON.parse(result);
      ticketDetails[ticket] = ticketData;
      successful++;
    } catch (error) {
      if (config.verbose) {
        logger.debug(`Failed to fetch ${ticket}: ${error}`);
      }
    }
  }

  await FileSystem.writeJSON(outputFile, ticketDetails);
  
  progress.succeed(`Fetched details for ${successful}/${total} tickets`);
}

async function stepAnalyzeCode(_git: SimpleGit, _config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 5: Analyzing Code Changes');
  logger.warn('AI analysis pending...');
  // TODO: Implement Claude AI integration
}

async function stepGenerateNotes(config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 6: Generating Release Notes');
  
  const commitsFile = path.join(config.workDir, 'commits.txt');
  const ticketsFile = path.join(config.workDir, 'tickets.txt');
  const categoriesFile = path.join(config.workDir, 'categories.json');
  const detailsFile = path.join(config.workDir, 'ticket_details.json');
  
  if (!FileSystem.exists(commitsFile) || !FileSystem.exists(ticketsFile) || !FileSystem.exists(categoriesFile)) {
    throw new Error('Required files not found. Run previous steps first.');
  }

  progress.start('Generating release notes...');

  // Load all data
  const commits = (await FileSystem.readFile(commitsFile)).split('\n').filter(Boolean);
  const tickets = (await FileSystem.readFile(ticketsFile)).split('\n').filter(Boolean);
  const categories = await FileSystem.readJSON(categoriesFile);
  const ticketDetails = FileSystem.exists(detailsFile) ? await FileSystem.readJSON(detailsFile) : {};


  // Build commit info
  const allCommits: CommitInfo[] = commits.map(line => {
    const [hash, ...messageParts] = line.split(' ');
    return {
      hash,
      author: '', // We don't have author info in the simple format
      message: messageParts.join(' ')
    };
  });

  // Build categorized ticket info
  const categorizedTickets: ReleaseNotesData['categories'] = {
    bugFixes: [],
    newFeatures: [],
    uiUpdates: [],
    apiChanges: [],
    refactoring: [],
    other: []
  };

  // Map category names
  const categoryMap: Record<string, keyof typeof categorizedTickets> = {
    'bug_fixes': 'bugFixes',
    'new_features': 'newFeatures',
    'ui_updates': 'uiUpdates',
    'api_changes': 'apiChanges',
    'refactoring': 'refactoring',
    'other': 'other'
  };

  // Process each category
  for (const [category, ticketIds] of Object.entries(categories)) {
    const mappedCategory = categoryMap[category];
    if (!mappedCategory) continue;

    for (const ticketId of ticketIds as string[]) {
      const details = ticketDetails[ticketId];
      const ticketCommits = allCommits.filter(c => c.message.includes(ticketId));

      const ticketInfo: TicketInfo = {
        id: ticketId,
        title: details?.title || ticketCommits[0]?.message || 'No title',
        status: details?.status,
        assignee: details?.assignee,
        description: details?.description,
        commits: ticketCommits,
        testingNotes: getTestingNotes(category),
        risks: []
      };

      categorizedTickets[mappedCategory].push(ticketInfo);
    }
  }

  // Build release notes data
  const releaseData: ReleaseNotesData = {
    title: 'Release Notes',
    date: format(new Date(), 'MMMM d, yyyy'),
    version: 'Generated by Release Notes Generator v2.0',
    branch: {
      source: config.sourceBranch,
      target: config.targetBranch
    },
    stats: {
      totalCommits: commits.length,
      totalTickets: tickets.length,
      bugFixes: categorizedTickets.bugFixes.length,
      newFeatures: categorizedTickets.newFeatures.length,
      uiUpdates: categorizedTickets.uiUpdates.length,
      apiChanges: categorizedTickets.apiChanges.length,
      refactoring: categorizedTickets.refactoring.length,
      other: categorizedTickets.other.length
    },
    categories: categorizedTickets,
    testingGuidelines: [
      'All unit tests passing',
      'Integration tests completed',
      'Manual smoke testing performed',
      'Performance benchmarks acceptable',
      'No critical console errors'
    ],
    commits: allCommits
  };

  // Generate HTML
  const html = HtmlGenerator.generateReleaseNotes(releaseData);
  
  // Write output file
  await FileSystem.writeFile(config.outputFile, html);
  
  progress.succeed('Release notes generated');
  
  logger.success(`Output saved to: ${config.outputFile}`);
}

function getTestingNotes(category: string): string[] {
  switch (category) {
    case 'bug_fixes':
      return [
        'Verify the reported issue is resolved',
        'Test edge cases around the fix',
        'Check for regression in related functionality'
      ];
    case 'new_features':
      return [
        'Test all new functionality thoroughly',
        'Verify UI/UX matches specifications',
        'Check permissions and access controls'
      ];
    case 'ui_updates':
      return [
        'Visual regression testing required',
        'Test across all supported browsers',
        'Verify mobile responsiveness'
      ];
    case 'api_changes':
      return [
        'Test all affected endpoints',
        'Verify backward compatibility',
        'Check error handling and validation'
      ];
    case 'refactoring':
      return [
        'Full regression testing required',
        'Compare performance metrics',
        'Verify no behavior changes'
      ];
    default:
      return ['General testing required'];
  }
}

program.parse();