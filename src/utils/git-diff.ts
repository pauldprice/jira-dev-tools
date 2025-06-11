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

    // Create a temporary patch file with only this ticket's changes
    const patchFile = `/tmp/ticket-${ticketId}-${Date.now()}.patch`;
    
    try {
      // Generate patches for each commit
      const patches: string[] = [];
      for (const commit of commits) {
        try {
          const patch = execSync(
            `git format-patch -1 --stdout ${commit}`,
            { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
          );
          patches.push(patch);
        } catch (error) {
          logger.debug(`Could not get patch for commit ${commit}`);
        }
      }
      
      // Get combined stats from all commits
      let totalFiles = 0;
      let totalInsertions = 0;
      let totalDeletions = 0;
      const fileMap = new Map<string, FileDiff>();
      
      for (const commit of commits) {
        try {
          // Get stats for this commit
          const stats = execSync(
            `git show --stat --format="" ${commit}`,
            { cwd: repoPath, encoding: 'utf-8' }
          ).trim();
          
          // Parse file changes from stat output
          const lines = stats.split('\n').filter(line => line.includes('|'));
          
          for (const line of lines) {
            const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([\+\-]+)/);
            if (match) {
              const [, filePath, , diffBar] = match;
              const additions = (diffBar.match(/\+/g) || []).length;
              const deletions = (diffBar.match(/-/g) || []).length;
              
              const existing = fileMap.get(filePath) || {
                path: filePath.trim(),
                changeType: 'modified' as FileDiff['changeType'],
                additions: 0,
                deletions: 0,
                diff: ''
              };
              
              fileMap.set(filePath.trim(), {
                ...existing,
                additions: existing.additions + additions,
                deletions: existing.deletions + deletions
              });
            }
          }
          
          // Get simple stats
          const statSummary = execSync(
            `git show --shortstat --format="" ${commit}`,
            { cwd: repoPath, encoding: 'utf-8' }
          ).trim();
          
          const statsMatch = statSummary.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
          if (statsMatch) {
            totalInsertions += parseInt(statsMatch[2] || '0');
            totalDeletions += parseInt(statsMatch[3] || '0');
          }
        } catch (error) {
          logger.debug(`Could not get stats for commit ${commit}`);
        }
      }
      
      // Convert map to array and get actual diffs for important files
      const files: FileDiff[] = [];
      const importantExtensions = /\.(ts|tsx|js|jsx|vue|py|go|java|cs|rb|php|sql)$/;
      
      for (const [filePath, fileDiff] of fileMap) {
        // For important files, try to get a combined diff
        let diff = '';
        if (importantExtensions.test(filePath) && files.length < 10) {
          try {
            // Get the diff by showing all ticket commits for this file
            diff = execSync(
              `git show ${commits.join(' ')} -- "${filePath}" | grep -E "^[+-]" | head -200 || true`,
              { cwd: repoPath, encoding: 'utf-8', maxBuffer: 1 * 1024 * 1024 }
            );
          } catch (error) {
            logger.debug(`Could not get diff for ${filePath}`);
          }
        }
        
        files.push({
          ...fileDiff,
          path: filePath,
          diff
        });
      }
      
      totalFiles = files.length;
      
      return {
        ticketId,
        files,
        stats: {
          filesChanged: totalFiles,
          insertions: totalInsertions,
          deletions: totalDeletions
        },
        rawDiff: patches.join('\n---\n')
      };
    } finally {
      // Clean up temp file if created
      try {
        execSync(`rm -f ${patchFile}`, { cwd: repoPath });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
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