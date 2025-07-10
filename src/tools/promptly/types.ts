export interface PromptPlaceholder {
  type: 'string' | 'choice' | 'multiline' | 'context' | 'optional';
  default?: string;
  description?: string;
  required?: boolean;
  choices?: string[];
}

export interface PromptDefaults {
  model?: string;
  contextFrom?: 'clipboard' | 'file' | 'stdin';
  outputTo?: 'clipboard' | 'file' | 'stdout';
  outputFormat?: 'json' | 'markdown' | 'text';
}

export interface SavedPrompt {
  name: string;
  category?: string;
  description?: string;
  prompt: string;
  systemPrompt?: string;
  placeholders: Record<string, PromptPlaceholder>;
  defaults: PromptDefaults;
  created: string;
  lastUsed?: string;
  useCount: number;
}

export interface PromptStore {
  prompts: Record<string, SavedPrompt>;
  version: string;
}

export interface RunOptions {
  contextFrom?: 'clipboard' | 'file' | 'stdin';
  contextFile?: string;
  outputTo?: 'clipboard' | 'file' | 'stdout';
  outputFile?: string;
  model?: string;
  params?: Record<string, string>;
  dryRun?: boolean;
  stream?: boolean;
  append?: boolean;
  silent?: boolean;
  noCache?: boolean;
  timeout?: number;
}

export interface SaveOptions {
  fromClipboard?: boolean;
  fromFile?: string;
  fromString?: string;
  category?: string;
  description?: string;
  model?: string;
  systemPrompt?: string;
  outputFormat?: 'json' | 'markdown' | 'text';
  force?: boolean;
}