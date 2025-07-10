import { config } from '../../utils/config';

export function escapeShellArg(arg: string): string {
  if (/[^A-Za-z0-9_\-./]/.test(arg)) {
    return "'" + arg.replace(/'/g, "'\\''") + "'";
  }
  return arg;
}

export function buildCommand(commandId: string, answers: any): string {
  const parts = ['./toolbox'];
  
  switch (commandId) {
    case 'fetch-jira':
      return buildFetchJiraCommand(parts, answers);
      
    case 'release-notes':
      return buildReleaseNotesCommand(parts, answers);
      
    case 'analyze-pdf':
      return buildAnalyzePdfCommand(parts, answers);
      
    case 'cache':
      return buildCacheCommand(parts, answers);
      
    case 'bitbucket':
      return buildBitbucketCommand(parts, answers);
      
    case 'run-sql':
      return buildRunSqlCommand(parts, answers);
      
    case 'track-day':
      return buildTrackDayCommand(parts, answers);
      
    case 'search-email':
      return buildSearchEmailCommand(parts, answers);
      
    case 'gmail-accounts':
      return buildGmailAccountsCommand(parts, answers);
      
    case 'manage-time':
      return buildManageTimeCommand(parts, answers);
      
    case 'promptly':
      return buildPromptlyCommand(parts, answers);
      
    default:
      return parts.join(' ');
  }
}

function buildFetchJiraCommand(parts: string[], answers: any): string {
  parts.push('fetch-jira', answers.ticketId);
  if (answers.format !== 'llm') {
    parts.push('--format', answers.format);
  }
  if (answers.excludeComments) {
    parts.push('--no-comments');
  }
  return parts.join(' ');
}

function buildReleaseNotesCommand(parts: string[], answers: any): string {
  parts.push('release-notes');
  parts.push('--repo', escapeShellArg(answers.repo));
  
  if (answers.generationMode === 'fixVersion') {
    parts.push('--fix-version', escapeShellArg(answers.fixVersion));
  } else {
    if (answers.source !== 'origin/test') {
      parts.push('--source', escapeShellArg(answers.source));
    }
    if (answers.target !== 'origin/master') {
      parts.push('--target', escapeShellArg(answers.target));
    }
  }
  
  if (answers.aiModel !== 'none') {
    parts.push('--ai-model', answers.aiModel);
  }
  if (answers.pdf) {
    parts.push('--pdf');
  }
  if (answers.includePrDescriptions) {
    parts.push('--include-pr-descriptions');
  }
  return parts.join(' ');
}

function buildAnalyzePdfCommand(parts: string[], answers: any): string {
  parts.push('analyze-pdf', escapeShellArg(answers.file));
  if (answers.focus !== 'all') {
    parts.push('--focus', answers.focus);
  }
  if (answers.json) {
    parts.push('--json');
  }
  return parts.join(' ');
}

function buildCacheCommand(parts: string[], answers: any): string {
  parts.push('cache', answers.action);
  if (answers.namespace && answers.namespace !== 'all') {
    parts.push('--namespace', answers.namespace);
  }
  return parts.join(' ');
}

function buildBitbucketCommand(parts: string[], answers: any): string {
  parts.push('bitbucket', answers.subcommand);
  
  if (answers.subcommand === 'diff-stat' || answers.subcommand === 'review-pr') {
    parts.push(answers.prId.toString());
    if (answers.directory && answers.directory !== config.getDefaultRepoPath()) {
      parts.push('--dir', escapeShellArg(answers.directory));
    }
    if (answers.subcommand === 'review-pr') {
      if (answers.model && answers.model !== 'sonnet') {
        parts.push('--model', answers.model);
      }
      if (answers.focusAreas && answers.focusAreas.length > 0) {
        parts.push('--focus', answers.focusAreas.join(','));
      }
    }
  } else if (answers.subcommand === 'list-pr-files') {
    parts.push(answers.prNumber);
    if (answers.directory && answers.directory !== config.getDefaultRepoPath()) {
      parts.push('--dir', escapeShellArg(answers.directory));
    }
  } else if (answers.subcommand === 'list-prs') {
    if (answers.state !== 'open') {
      parts.push('--state', answers.state);
    }
    if (answers.author) {
      parts.push('--author', escapeShellArg(answers.author));
    }
    if (answers.limit !== 10) {
      parts.push('--limit', answers.limit.toString());
    }
    if (answers.format && answers.format !== 'table') {
      parts.push('--format', answers.format);
    }
  }
  
  return parts.join(' ');
}

function buildRunSqlCommand(parts: string[], answers: any): string {
  parts.push('run-sql');
  
  if (answers.environment !== 'development') {
    parts.push('--env', answers.environment);
  }
  
  if (answers.inputMode === 'query') {
    parts.push('--query', escapeShellArg(answers.query));
  } else {
    parts.push('--file', escapeShellArg(answers.file));
  }
  
  if (answers.outputFormat && answers.outputFormat !== 'table') {
    parts.push('--format', answers.outputFormat);
  }
  
  if (answers.outputFile) {
    parts.push('--output', escapeShellArg(answers.outputFile));
  }
  
  if (answers.limit && answers.limit !== 1000) {
    parts.push('--limit', answers.limit.toString());
  }
  
  if (answers.showExecutionTime) {
    parts.push('--timing');
  }
  
  return parts.join(' ');
}

function buildTrackDayCommand(parts: string[], answers: any): string {
  parts.push('track-day');
  
  if (answers.date !== 'today') {
    parts.push('--date', answers.date);
  }
  
  if (answers.format !== 'human') {
    parts.push('--format', answers.format);
  }
  
  if (answers.detail !== 'normal') {
    parts.push('--detail', answers.detail);
  }
  
  if (answers.project) {
    parts.push('--project', escapeShellArg(answers.project));
  }
  
  if (answers.account && answers.account !== 'default') {
    parts.push('--account', answers.account);
  }
  
  if (answers.showSummary) {
    parts.push('--summary');
  }
  
  return parts.join(' ');
}

function buildSearchEmailCommand(parts: string[], answers: any): string {
  parts.push('search-email');
  
  parts.push('--query', escapeShellArg(answers.query));
  
  if (answers.limit !== 10) {
    parts.push('--limit', answers.limit.toString());
  }
  
  if (answers.format !== 'text') {
    parts.push('--format', answers.format);
  }
  
  if (answers.includeBody) {
    parts.push('--include-body');
  }
  
  if (answers.labelFilter) {
    parts.push('--label', escapeShellArg(answers.labelFilter));
  }
  
  if (answers.account && answers.account !== 'default') {
    parts.push('--account', answers.account);
  }
  
  return parts.join(' ');
}

function buildGmailAccountsCommand(parts: string[], answers: any): string {
  parts.push('gmail-accounts', answers.action);
  
  if (answers.action === 'add' && answers.alias) {
    parts.push('--alias', answers.alias);
  }
  
  if (answers.action === 'remove' && answers.accountToRemove) {
    parts.push(answers.accountToRemove);
  }
  
  if (answers.action === 'set-default' && answers.accountToSetDefault) {
    parts.push(answers.accountToSetDefault);
  }
  
  if (answers.action === 'test' && answers.accountToTest) {
    parts.push(answers.accountToTest);
  }
  
  return parts.join(' ');
}

function buildManageTimeCommand(parts: string[], answers: any): string {
  parts.push('manage-time');
  
  if (answers.action === 'add-event') {
    parts.push('add-event');
    parts.push('--title', escapeShellArg(answers.title));
    parts.push('--project', escapeShellArg(answers.project));
    parts.push('--duration', answers.duration.toString());
    
    if (answers.tag) {
      parts.push('--tag', escapeShellArg(answers.tag));
    }
    
    if (answers.note) {
      parts.push('--note', escapeShellArg(answers.note));
    }
  } else if (answers.action === 'list-projects') {
    parts.push('list-projects');
    
    if (answers.format && answers.format !== 'table') {
      parts.push('--format', answers.format);
    }
  } else if (answers.action === 'list-tags') {
    parts.push('list-tags');
    
    if (answers.format && answers.format !== 'table') {
      parts.push('--format', answers.format);
    }
  }
  
  return parts.join(' ');
}

function buildPromptlyCommand(parts: string[], answers: any): string {
  parts.push('promptly', answers.action);
  
  switch (answers.action) {
    case 'list':
      if (answers.category) {
        parts.push('--category', escapeShellArg(answers.category));
      }
      if (answers.search) {
        parts.push('--search', escapeShellArg(answers.search));
      }
      if (answers.verbose) {
        parts.push('--verbose');
      }
      break;
      
    case 'run':
      parts.push(escapeShellArg(answers.name));
      if (answers.contextFrom && answers.contextFrom !== 'clipboard') {
        parts.push('--context-from', answers.contextFrom);
      }
      if (answers.contextFile) {
        parts.push('--context-file', escapeShellArg(answers.contextFile));
      }
      if (answers.outputTo && answers.outputTo !== 'stdout') {
        parts.push('--output-to', answers.outputTo);
      }
      if (answers.outputFile) {
        parts.push('--output-file', escapeShellArg(answers.outputFile));
      }
      if (answers.append) {
        parts.push('--append');
      }
      if (answers.interactive) {
        parts.push('--interactive');
      }
      break;
      
    case 'save':
      parts.push(escapeShellArg(answers.name));
      if (answers.fromClipboard) {
        parts.push('--from-clipboard');
      } else if (answers.fromFile) {
        parts.push('--from-file', escapeShellArg(answers.fromFile));
      } else if (answers.fromString) {
        parts.push('--from-string', escapeShellArg(answers.fromString));
      }
      if (answers.category) {
        parts.push('--category', escapeShellArg(answers.category));
      }
      if (answers.description) {
        parts.push('--description', escapeShellArg(answers.description));
      }
      if (answers.force) {
        parts.push('--force');
      }
      break;
      
    case 'show':
    case 'edit':
    case 'delete':
      parts.push(escapeShellArg(answers.name));
      if (answers.action === 'edit' && answers.editor) {
        parts.push('--editor', escapeShellArg(answers.editor));
      }
      if (answers.action === 'delete' && answers.force) {
        parts.push('--force');
      }
      break;
      
    case 'export':
      parts.push(escapeShellArg(answers.name));
      if (answers.output) {
        parts.push('--output', escapeShellArg(answers.output));
      }
      break;
      
    case 'import':
      parts.push(escapeShellArg(answers.file));
      break;
  }
  
  return parts.join(' ');
}