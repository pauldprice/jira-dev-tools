import { SimpleGit } from 'simple-git';
import * as path from 'path';
import { logger, FileSystem } from '../../utils';
import { ReleaseNotesConfig } from './types';

export async function validateBranches(git: SimpleGit, config: ReleaseNotesConfig): Promise<void> {
  logger.info('Validating branches...');
  
  try {
    // Fetch latest
    await git.fetch();
    
    // Check if branches exist
    const branches = await git.branch();
    const allBranches = [...branches.all];
    
    if (!allBranches.includes(config.sourceBranch)) {
      throw new Error(`Source branch '${config.sourceBranch}' not found`);
    }
    
    if (!allBranches.includes(config.targetBranch)) {
      throw new Error(`Target branch '${config.targetBranch}' not found`);
    }
    
    logger.success('Branches validated');
  } catch (error) {
    logger.error(`Branch validation failed: ${error}`);
    throw error;
  }
}

export async function cleanWorkspace(config: ReleaseNotesConfig): Promise<void> {
  if (!config.keepFiles && FileSystem.exists(config.workDir)) {
    logger.info('Cleaning up temporary files...');
    await FileSystem.remove(config.workDir);
  }
}

export async function detectReleaseVersion(config: ReleaseNotesConfig): Promise<string | undefined> {
  try {
    // Try to extract version from recent commits
    const commitsFile = path.join(config.workDir, 'commits.txt');
    if (FileSystem.exists(commitsFile)) {
      const commits = await FileSystem.readFile(commitsFile);
      const versionMatch = commits.match(/V\d+\.\d+\.\d+/);
      if (versionMatch) {
        return versionMatch[0];
      }
    }
    
    // Try to find version in branch name
    const branchMatch = config.sourceBranch.match(/V\d+\.\d+\.\d+/);
    if (branchMatch) {
      return branchMatch[0];
    }
    
    return undefined;
  } catch (error) {
    logger.debug(`Could not detect release version: ${error}`);
    return undefined;
  }
}

export function extractVersionFromTicketData(ticketData: any): string | undefined {
  if (!ticketData || !ticketData.fields) return undefined;
  
  const fixVersions = ticketData.fields.fixVersions;
  if (fixVersions && fixVersions.length > 0) {
    // Return the first fix version
    return fixVersions[0].name;
  }
  
  return undefined;
}