import * as fs from 'fs';
import { createCachedClaudeClient } from '../../utils/cached-claude';
import { ClipboardManager } from './clipboard';
import { PlaceholderParser } from './placeholder-parser';
import { PromptWizard } from './wizard';
import { SavedPrompt, RunOptions } from './types';
import { logger } from '../../utils/logger';
import chalk from 'chalk';

export class PromptRunner {
  private claudeClient: any;

  constructor(apiKey: string) {
    this.claudeClient = createCachedClaudeClient(apiKey);
  }

  async run(prompt: SavedPrompt, options: RunOptions): Promise<string> {
    try {
      // Get context based on source
      const context = await this.getContext(options);
      
      if (!options.silent && context) {
        console.log(chalk.gray(`Context loaded (${context.length} characters)`));
      }
      
      // Prepare values including context
      const values = {
        ...options.params,
        ...(context ? { context } : {})
      };

      // Validate placeholders
      const validation = PlaceholderParser.validate(values, prompt.placeholders);
      if (!validation.valid) {
        throw new Error(`Invalid parameters:\n${validation.errors.join('\n')}`);
      }

      // Substitute placeholders
      const finalPrompt = PlaceholderParser.substitute(
        prompt.prompt,
        values,
        prompt.placeholders
      );

      // Handle dry run
      if (options.dryRun) {
        console.log(chalk.blue('\n🔍 Dry Run - Final Prompt:\n'));
        console.log(chalk.gray('─'.repeat(60)));
        if (prompt.systemPrompt) {
          console.log(chalk.yellow('System Prompt:'));
          console.log(prompt.systemPrompt);
          console.log();
        }
        console.log(chalk.yellow('User Prompt:'));
        console.log(finalPrompt);
        console.log(chalk.gray('─'.repeat(60)));
        return '';
      }

      // Show progress
      if (!options.silent) {
        console.log(chalk.blue('\n🤖 Running prompt...'));
      }

      // Execute the prompt
      const model = options.model || prompt.defaults.model || 'claude-3-5-sonnet-20241022';
      
      const result = await this.claudeClient.analyze(finalPrompt, {
        system: prompt.systemPrompt,
        model,
        maxTokens: 4000,
        temperature: 0.3,
        cache: !options.noCache
      });

      // Handle output
      await this.handleOutput(result, options);

      return result;
    } catch (error: any) {
      logger.error(`Prompt execution failed: ${error.message}`);
      throw error;
    }
  }

  private async getContext(options: RunOptions): Promise<string | null> {
    const source = options.contextFrom || 'clipboard';

    switch (source) {
      case 'clipboard':
        try {
          const content = ClipboardManager.read();
          if (!content.trim()) {
            logger.warn('Clipboard is empty');
            return null;
          }
          return content;
        } catch (error) {
          logger.warn('Failed to read from clipboard');
          return null;
        }

      case 'file':
        if (!options.contextFile) {
          throw new Error('Context file path required when using file input');
        }
        return fs.readFileSync(options.contextFile, 'utf8');

      case 'stdin':
        return this.readStdin();

      default:
        return null;
    }
  }

  private readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      
      process.stdin.setEncoding('utf8');
      
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      
      process.stdin.on('end', () => {
        resolve(data);
      });
      
      process.stdin.on('error', (err) => {
        reject(err);
      });

      // Check if stdin is a TTY (no piped input)
      if (process.stdin.isTTY) {
        resolve('');
      }
    });
  }

  private async handleOutput(result: string, options: RunOptions): Promise<void> {
    const destination = options.outputTo || 'stdout';

    switch (destination) {
      case 'clipboard':
        ClipboardManager.write(result);
        if (!options.silent) {
          console.log(chalk.green('\n✅ Output copied to clipboard'));
        }
        break;

      case 'file':
        if (!options.outputFile) {
          throw new Error('Output file path required when using file output');
        }
        
        if (options.append) {
          fs.appendFileSync(options.outputFile, '\n' + result);
        } else {
          fs.writeFileSync(options.outputFile, result);
        }
        
        if (!options.silent) {
          console.log(chalk.green(`\n✅ Output saved to: ${options.outputFile}`));
        }
        break;

      case 'stdout':
      default:
        if (!options.silent) {
          console.log(chalk.blue('\n📄 Output:\n'));
          console.log(chalk.gray('─'.repeat(60)));
        }
        console.log(result);
        if (!options.silent) {
          console.log(chalk.gray('─'.repeat(60)));
        }
        break;
    }
  }

  /**
   * Run a prompt interactively with wizard
   */
  async runInteractive(
    prompt: SavedPrompt,
    options: RunOptions
  ): Promise<string> {
    const wizard = new PromptWizard();
    
    try {
      // Collect missing values
      const values = await wizard.collectValues(
        prompt.placeholders,
        options.params || {}
      );
      
      // Show preview
      PromptWizard.preview(prompt.prompt, values);
      
      // Confirm execution
      const confirmed = await wizard.confirm();
      if (!confirmed) {
        console.log(chalk.yellow('\n❌ Execution cancelled'));
        return '';
      }
      
      // Run with collected values
      return this.run(prompt, {
        ...options,
        params: values
      });
    } finally {
      wizard.close();
    }
  }
}