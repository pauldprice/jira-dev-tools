import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

export interface JiraConfig {
  JIRA_BASE_URL: string;
  JIRA_EMAIL: string;
  JIRA_API_TOKEN: string;
}

export interface AnthropicConfig {
  ANTHROPIC_API_KEY?: string;
}

export interface ToolboxConfig extends JiraConfig, AnthropicConfig {
  VERBOSE?: boolean;
  NO_COLOR?: boolean;
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: Partial<ToolboxConfig> = {};

  private constructor() {
    this.loadConfig();
  }

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  private loadConfig(): void {
    // 1. Load from .env file in project root
    const projectRoot = this.findProjectRoot();
    if (projectRoot) {
      const envPath = path.join(projectRoot, '.env');
      if (fs.existsSync(envPath)) {
        const envConfig = dotenv.config({ path: envPath });
        dotenvExpand.expand(envConfig);
      }
    }

    // 2. Load from shell-sourced environment for .jiraconfig compatibility
    this.loadShellEnvironment();

    // 3. Process environment variables into config
    this.config = {
      JIRA_BASE_URL: process.env.JIRA_BASE_URL,
      JIRA_EMAIL: process.env.JIRA_EMAIL,
      JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      VERBOSE: process.env.VERBOSE === 'true' || 
               process.argv.includes('--verbose') || 
               process.argv.includes('-v'),
      NO_COLOR: process.env.NO_COLOR === 'true' || 
                process.argv.includes('--no-color'),
    };
  }

  private findProjectRoot(): string | null {
    let currentDir = process.cwd();
    while (currentDir !== '/') {
      if (fs.existsSync(path.join(currentDir, 'package.json'))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    return null;
  }

  private loadShellEnvironment(): void {
    const jiraConfigPath = path.join(os.homedir(), 'bin', '.jiraconfig');
    if (!fs.existsSync(jiraConfigPath)) {
      return;
    }

    try {
      // Execute a shell that sources the config and outputs the environment as JSON
      const script = `
        source "${jiraConfigPath}" 2>/dev/null
        node -e "
          const env = {};
          ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'].forEach(key => {
            if (process.env[key]) env[key] = process.env[key];
          });
          console.log(JSON.stringify(env));
        "
      `;
      
      const output = execSync(script, { 
        shell: '/bin/bash',
        env: { ...process.env, NODE_ENV: process.env.NODE_ENV }
      }).toString().trim();

      if (output) {
        const shellEnv = JSON.parse(output);
        Object.assign(process.env, shellEnv);
      }
    } catch (error) {
      // If the shell script approach fails, try a simpler regex-based approach
      this.loadShellConfigFallback(jiraConfigPath);
    }
  }

  private loadShellConfigFallback(configPath: string): void {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      
      // Match export VAR=value or export VAR="value" or export VAR='value'
      const exportRegex = /export\s+(\w+)=(['"]?)([^'"]*)\2/g;
      let match;
      
      while ((match = exportRegex.exec(content)) !== null) {
        const [, key, , value] = match;
        if (['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'].includes(key)) {
          process.env[key] = value;
        }
      }
    } catch (error) {
      // Silently fail if config cannot be read
    }
  }

  get<K extends keyof ToolboxConfig>(key: K): ToolboxConfig[K] | undefined {
    return this.config[key];
  }

  getJiraConfig(): JiraConfig | null {
    if (
      this.config.JIRA_BASE_URL &&
      this.config.JIRA_EMAIL &&
      this.config.JIRA_API_TOKEN
    ) {
      return {
        JIRA_BASE_URL: this.config.JIRA_BASE_URL,
        JIRA_EMAIL: this.config.JIRA_EMAIL,
        JIRA_API_TOKEN: this.config.JIRA_API_TOKEN,
      };
    }
    return null;
  }

  isVerbose(): boolean {
    return this.config.VERBOSE === true;
  }

  validate(requiredKeys: (keyof ToolboxConfig)[]): void {
    const missing = requiredKeys.filter(key => !this.config[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
  }
}

export const config = ConfigLoader.getInstance();