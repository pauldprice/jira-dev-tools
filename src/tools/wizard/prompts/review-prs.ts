import inquirer from 'inquirer';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface GitRepo {
  path: string;
  name: string;
  remote?: string;
}

function findGitRepos(searchPath: string, maxDepth: number = 3): GitRepo[] {
  const repos: GitRepo[] = [];
  
  function searchDir(dir: string, depth: number) {
    if (depth > maxDepth) return;
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      // Check if this is a git repo
      if (entries.some(e => e.name === '.git' && e.isDirectory())) {
        let remote: string | undefined;
        try {
          remote = execSync('git remote get-url origin', { 
            cwd: dir, 
            encoding: 'utf-8' 
          }).trim();
        } catch {}
        
        repos.push({
          path: dir,
          name: path.basename(dir),
          remote
        });
        return; // Don't search subdirs of git repos
      }
      
      // Search subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          searchDir(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch (error) {
      // Ignore permission errors
    }
  }
  
  searchDir(searchPath, 0);
  return repos;
}

export async function promptReviewPrs() {
  // Check if we're in a git repo
  const currentDir = process.cwd();
  let isGitRepo = false;
  let currentRepoRemote: string | undefined;
  
  try {
    currentRepoRemote = execSync('git remote get-url origin', { 
      encoding: 'utf-8',
      cwd: currentDir 
    }).trim();
    isGitRepo = currentRepoRemote.includes('bitbucket.org');
  } catch {}

  // Get repository selection
  let repoPath: string | undefined;
  let repoInfo: { workspace: string; slug: string } | undefined;
  
  if (isGitRepo) {
    const { useCurrentRepo } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useCurrentRepo',
        message: `Use current repository (${path.basename(currentDir)})?`,
        default: true
      }
    ]);
    
    if (useCurrentRepo) {
      repoPath = currentDir;
    }
  }
  
  if (!repoPath) {
    // Find nearby git repos
    const searchPaths = [
      currentDir,
      path.join(currentDir, '..'),
      path.join(process.env.HOME || '', 'code'),
      path.join(process.env.HOME || '', 'projects')
    ].filter(p => fs.existsSync(p));
    
    const allRepos: GitRepo[] = [];
    for (const searchPath of searchPaths) {
      allRepos.push(...findGitRepos(searchPath));
    }
    
    // Filter to Bitbucket repos
    const bitbucketRepos = allRepos.filter(r => r.remote?.includes('bitbucket.org'));
    
    if (bitbucketRepos.length > 0) {
      const choices = bitbucketRepos.map(repo => ({
        name: `${repo.name} (${path.dirname(repo.path)})`,
        value: repo.path
      }));
      
      choices.push({
        name: 'Enter repository manually',
        value: 'manual'
      });
      
      const { selectedRepo } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedRepo',
          message: 'Select repository:',
          choices
        }
      ]);
      
      if (selectedRepo !== 'manual') {
        repoPath = selectedRepo;
      }
    }
  }
  
  // Manual entry if needed
  if (!repoPath) {
    const { manualRepo } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualRepo',
        message: 'Enter repository (path or workspace/slug):',
        validate: (input: string) => {
          if (input.includes('/') && !fs.existsSync(input)) {
            // Might be workspace/slug format
            const parts = input.split('/');
            if (parts.length === 2) return true;
          }
          if (fs.existsSync(input)) return true;
          return 'Please enter a valid repository path or workspace/slug';
        }
      }
    ]);
    
    if (manualRepo.includes('/') && !fs.existsSync(manualRepo)) {
      // It's workspace/slug format
      const parts = manualRepo.split('/');
      repoInfo = { workspace: parts[0], slug: parts[1] };
    } else {
      repoPath = manualRepo;
    }
  }

  // Get other options
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'reviewer',
      message: 'Reviewer name (leave empty to use current Bitbucket user):',
    },
    {
      type: 'confirm',
      name: 'useCache',
      message: 'Use cached JIRA data?',
      default: true
    },
    {
      type: 'input',
      name: 'cacheTtl',
      message: 'Cache TTL in hours:',
      default: '24',
      when: (answers: any) => answers.useCache,
      validate: (input: string) => {
        const num = parseInt(input, 10);
        return (!isNaN(num) && num > 0) || 'Please enter a valid number of hours';
      }
    },
    {
      type: 'list',
      name: 'outputFormat',
      message: 'Output format:',
      choices: [
        { name: 'Table (formatted)', value: 'table' },
        { name: 'JSON', value: 'json' }
      ],
      default: 'table'
    }
  ]);

  return {
    repoPath,
    repoInfo,
    reviewer: answers.reviewer || undefined,
    useCache: answers.useCache,
    cacheTtl: answers.cacheTtl,
    outputFormat: answers.outputFormat
  };
}