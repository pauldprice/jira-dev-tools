#!/usr/bin/env node
import { Command } from 'commander';
import { logger, progress, FileSystem } from '../utils';
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

async function stepCategorizeTickets(_config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 3: Categorizing Tickets');
  logger.warn('Categorization implementation pending...');
  // TODO: Implement categorization logic
}

async function stepFetchTicketDetails(_config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 4: Fetching Ticket Details');
  logger.warn('Jira integration pending...');
  // TODO: Implement Jira fetching using our fetch-jira tool
}

async function stepAnalyzeCode(_git: SimpleGit, _config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 5: Analyzing Code Changes');
  logger.warn('AI analysis pending...');
  // TODO: Implement Claude AI integration
}

async function stepGenerateNotes(_config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 6: Generating Release Notes');
  logger.warn('Note generation pending...');
  // TODO: Implement final markdown generation
}

program.parse();