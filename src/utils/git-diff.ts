import { execSync } from 'child_process';
import { logger } from './logger';

export interface CodeDiff {
  ticketId: string;
  files: FileDiff[];
  stats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  rawDiff: string;
}

export interface FileDiff {
  path: string;
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  diff: string;
}

/**
 * Get all commits for a specific ticket
 */
export function getTicketCommits(repoPath: string, ticketId: string, targetBranch: string = 'origin/master'): string[] {
  try {
    // Get all commits in the branch that mention this ticket
    const allCommits = execSync(
      `git log ${targetBranch}..HEAD --grep="${ticketId}" --format=%H`,
      { cwd: repoPath, encoding: 'utf-8' }
    ).trim().split('\n').filter(Boolean);

    return allCommits;
  } catch (error) {
    logger.debug(`No commits found for ticket ${ticketId}`);
    return [];
  }
}

/**
 * Get the code diff for all commits related to a ticket
 */
export async function getTicketCodeDiff(
  repoPath: string, 
  ticketId: string, 
  targetBranch: string = 'origin/master'
): Promise<CodeDiff | null> {
  try {
    const commits = getTicketCommits(repoPath, ticketId, targetBranch);
    
    if (commits.length === 0) {
      logger.debug(`No commits found for ticket ${ticketId}`);
      return null;
    }

    // Get the merge base to find where this branch diverged
    const mergeBase = execSync(
      `git merge-base ${targetBranch} ${commits[commits.length - 1]}`,
      { cwd: repoPath, encoding: 'utf-8' }
    ).trim();

    // Get the combined diff for all changes
    const rawDiff = execSync(
      `git diff ${mergeBase}..${commits[0]}`,
      { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
    );

    // Get statistics
    const stats = execSync(
      `git diff --shortstat ${mergeBase}..${commits[0]}`,
      { cwd: repoPath, encoding: 'utf-8' }
    ).trim();

    // Parse stats
    const statsMatch = stats.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    const filesChanged = parseInt(statsMatch?.[1] || '0');
    const insertions = parseInt(statsMatch?.[2] || '0');
    const deletions = parseInt(statsMatch?.[3] || '0');

    // Get list of changed files with their diffs
    const fileList = execSync(
      `git diff --name-status ${mergeBase}..${commits[0]}`,
      { cwd: repoPath, encoding: 'utf-8' }
    ).trim().split('\n').filter(Boolean);

    const files: FileDiff[] = [];

    for (const fileLine of fileList) {
      const [status, ...pathParts] = fileLine.split('\t');
      const path = pathParts.join('\t');
      
      let changeType: FileDiff['changeType'] = 'modified';
      if (status === 'A') changeType = 'added';
      else if (status === 'D') changeType = 'deleted';
      else if (status.startsWith('R')) changeType = 'renamed';

      // Get individual file diff
      let fileDiff = '';
      try {
        if (changeType !== 'deleted') {
          fileDiff = execSync(
            `git diff ${mergeBase}..${commits[0]} -- "${path}"`,
            { cwd: repoPath, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 } // 5MB per file
          );
        }
      } catch (error) {
        logger.debug(`Could not get diff for file ${path}`);
      }

      // Get file stats
      const fileStats = execSync(
        `git diff --numstat ${mergeBase}..${commits[0]} -- "${path}"`,
        { cwd: repoPath, encoding: 'utf-8' }
      ).trim();

      const [additions = '0', deletions = '0'] = fileStats.split('\t');

      files.push({
        path,
        changeType,
        additions: parseInt(additions) || 0,
        deletions: parseInt(deletions) || 0,
        diff: fileDiff
      });
    }

    return {
      ticketId,
      files,
      stats: {
        filesChanged,
        insertions,
        deletions
      },
      rawDiff
    };
  } catch (error: any) {
    logger.error(`Failed to get diff for ticket ${ticketId}: ${error.message}`);
    return null;
  }
}

/**
 * Format code diff for AI analysis
 */
export function formatDiffForAI(diff: CodeDiff): string {
  const output: string[] = [];
  
  output.push(`Code changes for ticket ${diff.ticketId}:`);
  output.push(`Files changed: ${diff.stats.filesChanged}, +${diff.stats.insertions}, -${diff.stats.deletions}`);
  output.push('');
  
  // Group files by type
  const byType = {
    added: diff.files.filter(f => f.changeType === 'added'),
    modified: diff.files.filter(f => f.changeType === 'modified'),
    deleted: diff.files.filter(f => f.changeType === 'deleted'),
    renamed: diff.files.filter(f => f.changeType === 'renamed')
  };
  
  if (byType.added.length > 0) {
    output.push('NEW FILES:');
    byType.added.forEach(f => output.push(`  + ${f.path}`));
    output.push('');
  }
  
  if (byType.modified.length > 0) {
    output.push('MODIFIED FILES:');
    byType.modified.forEach(f => output.push(`  ~ ${f.path} (+${f.additions}, -${f.deletions})`));
    output.push('');
  }
  
  if (byType.deleted.length > 0) {
    output.push('DELETED FILES:');
    byType.deleted.forEach(f => output.push(`  - ${f.path}`));
    output.push('');
  }
  
  // Include key file diffs (limit to important files)
  const importantFiles = diff.files
    .filter(f => f.changeType !== 'deleted')
    .filter(f => {
      // Focus on source files, exclude generated files
      const isSourceFile = /\.(ts|tsx|js|jsx|vue|py|go|java|cs|rb|php)$/.test(f.path);
      const isNotTest = !f.path.includes('.test.') && !f.path.includes('.spec.');
      const isNotGenerated = !f.path.includes('generated') && !f.path.includes('dist/');
      return isSourceFile && isNotTest && isNotGenerated;
    })
    .slice(0, 10); // Limit to 10 most important files
  
  if (importantFiles.length > 0) {
    output.push('KEY CODE CHANGES:');
    output.push('');
    
    importantFiles.forEach(file => {
      output.push(`File: ${file.path}`);
      output.push('```diff');
      // Limit diff to 100 lines per file to avoid token limits
      const lines = file.diff.split('\n').slice(0, 100);
      output.push(lines.join('\n'));
      if (file.diff.split('\n').length > 100) {
        output.push('... (diff truncated)');
      }
      output.push('```');
      output.push('');
    });
  }
  
  return output.join('\n');
}