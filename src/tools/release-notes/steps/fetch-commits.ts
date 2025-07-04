import * as path from 'path';
import { execSync } from 'child_process';
import { SimpleGit } from 'simple-git';
import { logger, progress, FileSystem } from '../../../utils';
import { ReleaseNotesConfig } from '../types';

export async function stepFetchCommits(_git: SimpleGit, config: ReleaseNotesConfig): Promise<void> {
  logger.header('Step 1: Fetching Commits');
  
  const outputFile = path.join(config.workDir, 'commits.txt');
  
  if (FileSystem.exists(outputFile)) {
    logger.info('Using cached commits');
    return;
  }

  progress.start(`Fetching commits between ${config.targetBranch} and ${config.sourceBranch}`);
  
  try {
    // Get commits with author and date information
    const gitCommand = `git log ${config.targetBranch}..${config.sourceBranch} --pretty=format:"%H|%an|%ai|%s" --no-merges`;
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