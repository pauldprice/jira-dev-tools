import * as path from 'path';
import { SimpleGit } from 'simple-git';
import { logger, progress, FileSystem } from '../../../utils';
import { ReleaseNotesConfig } from '../types';

export async function stepExtractTickets(_git: SimpleGit, config: ReleaseNotesConfig): Promise<void> {
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