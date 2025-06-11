#!/usr/bin/env node
import { Command } from 'commander';
import { logger, progress, FileSystem, config as appConfig, HtmlGenerator, getTicketCodeDiff, ParallelProcessor, PDFGenerator, fetchJiraTicketCached, createCachedClaudeClient } from '../utils';
import type { ReleaseNotesData, TicketInfo, CommitInfo, JiraCredentials } from '../utils';
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
  aiModel?: string;
  generatePDF: boolean;
  pdfFile?: string;
  debugLimit?: number;
  releaseVersion: string;
}

const program = new Command();

program
  .name('generate-release-notes')
  .description('Generate release notes from git commits between branches')
  .requiredOption('--version <version>', 'release version (e.g., V17.01.00)')
  .option('-p, --repo <path>', 'path to git repository (default: current directory)', process.cwd())
  .option('-s, --source <branch>', 'source branch with new commits (default: origin/test)', 'origin/test')
  .option('-t, --target <branch>', 'target branch to compare against (default: origin/master)', 'origin/master')
  .option('-o, --output <file>', 'output file name')
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
  .option('--ai-model <model>', 'Claude AI model to use (haiku, sonnet, opus)', 'sonnet')
  .option('--pdf', 'generate PDF output in addition to HTML')
  .option('--pdf-only', 'generate only PDF output (implies --pdf)')
  .option('--debug <tickets>', 'debug mode: process only specified number of tickets', parseInt)
  .option('--no-cache', 'disable caching for API and AI calls')
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

      // Generate output filename based on version if not specified
      const outputFileName = options.output || `release_notes_${options.version}_${format(new Date(), 'yyyy-MM-dd')}.html`;
      
      const config: ReleaseNotesConfig = {
        repoPath,
        sourceBranch: options.source,
        targetBranch: options.target,
        workDir: path.join(repoPath, options.workDir),
        outputFile: path.join(repoPath, outputFileName),
        keepFiles: options.keep || false,
        verbose: options.verbose || false,
        jiraProject: options.jiraProject,
        fetchJiraDetails: !options.noJira,
        useAI: !options.noAi,
        aiModel: options.aiModel,
        generatePDF: options.pdf || options.pdfOnly || false,
        pdfFile: path.join(repoPath, outputFileName.replace('.html', '.pdf')),
        debugLimit: options.debug,
        releaseVersion: options.version,
      };

      logger.info(`Repository: ${config.repoPath}`);
      logger.info(`Branches: ${config.targetBranch}..${config.sourceBranch}`);
      
      if (config.debugLimit) {
        logger.info(`Debug mode: Processing only ${config.debugLimit} tickets`);
      }

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

      // Generate PDF if requested
      if (config.generatePDF && config.pdfFile) {
        try {
          progress.start('Generating PDF...');
          await PDFGenerator.generateFromHTML(config.outputFile, config.pdfFile);
          progress.succeed(`PDF generated: ${config.pdfFile}`);
          
          // Always remove HTML file after successful PDF generation
          try {
            await FileSystem.remove(config.outputFile);
          } catch (error) {
            // Ignore cleanup errors
          }
          
          logger.success(`Release notes PDF generated: ${config.pdfFile}`);
        } catch (error: any) {
          progress.fail();
          logger.error(`Failed to generate PDF: ${error.message}`);
          logger.info(`HTML file retained at: ${config.outputFile}`);
          // Don't fail the whole process if PDF generation fails
        }
      } else {
        logger.success(`Release notes generated: ${config.outputFile}`);
      }

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
async function stepFetchCommits(_git: SimpleGit, config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 1: Fetching Commits');
  
  const outputFile = path.join(config.workDir, 'commits.txt');
  
  if (FileSystem.exists(outputFile)) {
    logger.info('Using cached commits');
    return;
  }

  progress.start(`Fetching commits between ${config.targetBranch} and ${config.sourceBranch}`);
  
  try {
    // Use git command directly for more reliable results
    const { execSync } = await import('child_process');
    const gitCommand = `git log ${config.targetBranch}..${config.sourceBranch} --oneline --no-merges`;
    const gitOutput = execSync(gitCommand, { 
      cwd: config.repoPath,
      encoding: 'utf-8'
    }).trim();
    
    const commits = gitOutput.split('\n').filter(line => line.trim());
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
  
  if (FileSystem.exists(outputFile) && !config.debugLimit) {
    logger.info('Using cached tickets');
    return;
  }

  progress.start('Extracting ticket numbers...');
  
  const commits = await FileSystem.readFile(inputFile);
  const ticketPattern = new RegExp(`${config.jiraProject}-\\d+`, 'g');
  let tickets = [...new Set(commits.match(ticketPattern) || [])];
  
  // Apply debug limit if specified
  if (config.debugLimit && tickets.length > config.debugLimit) {
    const originalCount = tickets.length;
    tickets = tickets.slice(0, config.debugLimit);
    logger.info(`Debug mode: Limited from ${originalCount} to ${tickets.length} tickets`);
  }
  
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
  let successful = 0;

  progress.start(`Fetching details for ${total} tickets...`);

  // Create parallel processor for Jira fetching
  const processor = new ParallelProcessor({
    maxConcurrency: 5, // Jira API can handle more concurrent requests
    delayBetweenBatches: 200, // Smaller delay for Jira
    onProgress: (completed, total) => {
      progress.update(`Fetching ${completed}/${total} tickets`);
    }
  });

  // Fetch tickets in parallel
  const results = await processor.processWithSlidingWindow(
    tickets,
    async (ticket) => {
      const ticketData = await fetchJiraTicketCached(
        ticket, 
        jiraConfig as JiraCredentials,
        { 
          includeComments: true,
          includeHistory: false,
          format: 'llm'
        },
        {
          ttl: 60 * 60 * 1000, // Cache for 1 hour
          enabled: config.fetchJiraDetails
        }
      );
      
      return { ticket, data: ticketData };
    }
  );

  // Collect results
  results.forEach((result, index) => {
    const ticket = tickets[index];
    
    if (result instanceof Error) {
      const errorMessage = result.message || 'Unknown error';
      if (config.verbose) {
        logger.warn(`Failed to fetch ${ticket}: ${errorMessage}`);
      }
    } else if (result) {
      const { ticket, data } = result as any;
      ticketDetails[ticket] = data;
      successful++;
    }
  });

  await FileSystem.writeJSON(outputFile, ticketDetails);
  
  progress.succeed(`Fetched details for ${successful}/${total} tickets`);
}

async function stepAnalyzeCode(_git: SimpleGit, config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 5: Analyzing Code Changes');
  
  const ticketsFile = path.join(config.workDir, 'tickets.txt');
  const detailsFile = path.join(config.workDir, 'ticket_details.json');
  const outputFile = path.join(config.workDir, 'code_analysis.json');
  
  if (!FileSystem.exists(ticketsFile)) {
    throw new Error('tickets.txt not found. Run extract step first.');
  }
  
  if (FileSystem.exists(outputFile)) {
    logger.info('Using cached code analysis');
    return;
  }

  // Check if Claude is available
  const claudeClient = createCachedClaudeClient(undefined, config.aiModel, {
    debug: config.verbose,
    enabled: config.useAI
  });
  if (!claudeClient) {
    logger.warn('Claude API not configured. Skipping AI analysis.');
    logger.info('To enable AI analysis, set ANTHROPIC_API_KEY in environment or create ~/.toolbox/config.json');
    await FileSystem.writeJSON(outputFile, {});
    return;
  }

  // Set cache options
  claudeClient.setCacheOptions({
    enabled: true,
    ttl: 24 * 60 * 60 * 1000 // Cache AI responses for 24 hours
  });
  
  if (config.verbose && config.aiModel) {
    logger.info(`Using AI model: ${config.aiModel}`);
  }

  const tickets = (await FileSystem.readFile(ticketsFile)).split('\n').filter(Boolean);
  const ticketDetails = FileSystem.exists(detailsFile) ? await FileSystem.readJSON(detailsFile) : {};
  const codeAnalysis: Record<string, any> = {};
  
  const total = tickets.length;
  let successful = 0;

  progress.start(`Analyzing code for ${total} tickets...`);

  // Create parallel processor with progress updates
  const processor = new ParallelProcessor({
    maxConcurrency: 3, // Process 3 tickets at a time to avoid rate limits
    delayBetweenBatches: 500, // 500ms delay between batches
    onProgress: (completed, total) => {
      progress.update(`Analyzing ${completed}/${total} tickets`);
    }
  });

  // Process tickets in parallel
  const results = await processor.processWithSlidingWindow(
    tickets,
    async (ticket, _index) => {
      // Get code diff for this ticket
      const diff = await getTicketCodeDiff(config.repoPath, ticket, config.targetBranch);
      
      if (!diff) {
        logger.info(`No code diff found for ${ticket} - this ticket may not have commits in this branch`);
        return null;
      }
      
      if (!diff.files || diff.files.length === 0) {
        logger.info(`No file changes found for ${ticket} - commits may only contain merge commits`);
        return null;
      }

      // Get Jira data if available
      const jiraData = ticketDetails[ticket];
      
      // Analyze with Claude
      const analysis = await claudeClient.analyzeCodeChanges(diff, jiraData);
      
      // Generate comprehensive summary
      let finalSummary = analysis.summary;
      if (jiraData) {
        finalSummary = await claudeClient.generateTicketSummary(ticket, jiraData, analysis);
      }

      return {
        ticket,
        data: {
          diff: {
            stats: diff.stats,
            filesChanged: diff.files.map(f => ({
              path: f.path,
              changeType: f.changeType,
              additions: f.additions,
              deletions: f.deletions
            }))
          },
          analysis: {
            ...analysis,
            summary: finalSummary
          }
        }
      };
    }
  );

  // Collect results
  results.forEach((result, index) => {
    const ticket = tickets[index];
    
    if (result instanceof Error) {
      logger.debug(`Failed to analyze ${ticket}: ${result.message}`);
    } else if (result && result !== null) {
      const { ticket, data } = result as any;
      codeAnalysis[ticket] = data;
      successful++;
    } else if (result === null) {
      logger.debug(`Skipped ${ticket}: No code diff found in branch`);
    }
  });

  await FileSystem.writeJSON(outputFile, codeAnalysis);
  
  progress.succeed(`Analyzed ${successful}/${total} tickets`);
  
  if (successful < total) {
    logger.info(`Some tickets could not be analyzed. This might be due to:
  - No commits found for the ticket
  - API rate limits
  - Large diffs exceeding token limits`);
  }
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
  
  // Load code analysis if available
  const analysisFile = path.join(config.workDir, 'code_analysis.json');
  const codeAnalysis = FileSystem.exists(analysisFile) ? await FileSystem.readJSON(analysisFile) : {};


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

      // Get AI analysis if available
      const analysis = codeAnalysis[ticketId]?.analysis;
      
      // Use AI-generated summary if available, otherwise fall back to Jira description
      let description = details?.description;
      if (analysis?.summary) {
        description = analysis.summary;
      }
      
      // Use AI-generated testing notes if available
      let testingNotes = getTestingNotes(category);
      if (analysis?.testingNotes && analysis.testingNotes.length > 0) {
        testingNotes = analysis.testingNotes;
      }
      
      // Include risks from AI analysis
      const risks = analysis?.risks || [];
      
      // Debug logging
      if (config.verbose) {
        logger.info(`Ticket ${ticketId}: testingNotes count = ${testingNotes.length}, risks count = ${risks.length}`);
        if (testingNotes.length > 0) {
          logger.info(`First testing note: ${testingNotes[0].substring(0, 50)}...`);
        }
      }

      const ticketInfo: TicketInfo = {
        id: ticketId,
        title: details?.title || ticketCommits[0]?.message || 'No title',
        status: details?.status,
        assignee: details?.assignee,
        description,
        commits: ticketCommits,
        testingNotes,
        risks
      };

      categorizedTickets[mappedCategory].push(ticketInfo);
    }
  }

  // Generate primary focus using Claude if available
  let primaryFocus: string | undefined;
  if (config.useAI) {
    const claudeClient = createCachedClaudeClient(undefined, config.aiModel);
    if (claudeClient) {
      progress.start('Generating release primary focus...');
      
      // Prepare ticket summaries for Claude
      const allTicketSummaries = [
        ...categorizedTickets.bugFixes.map(t => ({ 
          id: t.id, 
          title: t.title, 
          description: t.description, 
          category: 'Bug Fix' 
        })),
        ...categorizedTickets.newFeatures.map(t => ({ 
          id: t.id, 
          title: t.title, 
          description: t.description, 
          category: 'New Feature' 
        })),
        ...categorizedTickets.apiChanges.map(t => ({ 
          id: t.id, 
          title: t.title, 
          description: t.description, 
          category: 'API Change' 
        })),
        ...categorizedTickets.uiUpdates.map(t => ({ 
          id: t.id, 
          title: t.title, 
          description: t.description, 
          category: 'UI Update' 
        })),
        ...categorizedTickets.refactoring.map(t => ({ 
          id: t.id, 
          title: t.title, 
          description: t.description, 
          category: 'Refactoring' 
        })),
        ...categorizedTickets.other.map(t => ({ 
          id: t.id, 
          title: t.title, 
          description: t.description, 
          category: 'Other' 
        }))
      ];
      
      try {
        primaryFocus = await claudeClient.generateReleasePrimaryFocus(allTicketSummaries);
        progress.succeed(`Primary focus: ${primaryFocus}`);
      } catch (error: any) {
        progress.fail();
        logger.debug(`Failed to generate primary focus: ${error.message}`);
      }
    }
  }

  // Build release notes data
  const releaseData: ReleaseNotesData = {
    title: `Release Notes - ${config.releaseVersion}`,
    date: format(new Date(), 'MMMM d, yyyy'),
    version: config.releaseVersion,
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
    commits: allCommits,
    primaryFocus,
    jiraBaseUrl: appConfig.get('JIRA_BASE_URL')
  };

  // Generate HTML optimized for PDF output
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