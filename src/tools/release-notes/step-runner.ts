import { SimpleGit } from 'simple-git';
import * as path from 'path';
import { logger, FileSystem } from '../../utils';
import { ReleaseNotesConfig } from './types';
import {
  stepFetchCommits,
  stepExtractTickets,
  stepCategorizeTickets,
  stepFetchTicketDetails,
  stepAnalyzeCode,
  stepGenerateNotes,
  stepFetchTicketsByVersion,
  stepExtractCommitsForTickets
} from './steps';

const STEPS: Record<string, { name: string; fn: (git: SimpleGit, config: ReleaseNotesConfig) => Promise<void> }> = {
  'fetch-commits': { name: 'Fetch Commits', fn: stepFetchCommits },
  'extract': { name: 'Extract Tickets', fn: stepExtractTickets },
  'categorize': { name: 'Categorize Tickets', fn: stepCategorizeTickets },
  'fetch-details': { name: 'Fetch Ticket Details', fn: stepFetchTicketDetails },
  'analyze': { name: 'Analyze Code', fn: stepAnalyzeCode },
  'generate': { name: 'Generate Notes', fn: stepGenerateNotes },
  'fetch-by-version': { name: 'Fetch Tickets by Version', fn: stepFetchTicketsByVersion },
  'extract-commits': { name: 'Extract Commits for Tickets', fn: stepExtractCommitsForTickets },
};

export function displaySteps(): void {
  logger.info('Available steps:');
  Object.entries(STEPS).forEach(([key, step]) => {
    logger.info(`  ${key.padEnd(20)} - ${step.name}`);
  });
}

export async function runStep(step: string, git: SimpleGit, config: ReleaseNotesConfig): Promise<void> {
  if (!STEPS[step]) {
    throw new Error(`Unknown step: ${step}. Use --steps to see available steps.`);
  }
  
  const stepDef = STEPS[step];
  logger.header(`Running step: ${stepDef.name}`);
  
  try {
    await stepDef.fn(git, config);
    await saveProgress(config, step);
  } catch (error) {
    logger.error(`Step '${step}' failed: ${error}`);
    throw error;
  }
}

export async function runAllSteps(git: SimpleGit, config: ReleaseNotesConfig, resume: boolean): Promise<void> {
  let lastCompleted = '';
  
  if (resume) {
    lastCompleted = await getLastCompletedStep(config);
    if (lastCompleted) {
      logger.info(`Resuming from last completed step: ${lastCompleted}`);
    }
  }
  
  const stepOrder = config.mode === 'version' 
    ? ['fetch-by-version', 'extract-commits', 'categorize', 'fetch-details', 'analyze', 'generate']
    : ['fetch-commits', 'extract', 'categorize', 'fetch-details', 'analyze', 'generate'];
  
  let shouldRun = !resume || !lastCompleted;
  
  for (const step of stepOrder) {
    if (!shouldRun && step === lastCompleted) {
      shouldRun = true;
      continue;
    }
    
    if (shouldRun) {
      // Skip certain steps based on configuration
      if (step === 'fetch-details' && !config.fetchJiraDetails) {
        logger.info('Skipping Jira details fetch (--no-jira)');
        continue;
      }
      if (step === 'analyze' && !config.useAI) {
        logger.info('Skipping AI analysis (--no-ai)');
        continue;
      }
      
      await runStep(step, git, config);
    }
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