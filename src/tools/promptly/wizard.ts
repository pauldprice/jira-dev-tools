import * as readline from 'readline';
import { PromptPlaceholder } from './types';
import chalk from 'chalk';

export class PromptWizard {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Collect values for all placeholders interactively
   */
  async collectValues(
    placeholders: Record<string, PromptPlaceholder>,
    providedValues: Record<string, string> = {}
  ): Promise<Record<string, string>> {
    const values: Record<string, string> = { ...providedValues };
    
    console.log(chalk.blue('\n📝 Prompt Parameter Wizard\n'));
    
    for (const [name, placeholder] of Object.entries(placeholders)) {
      // Skip if already provided
      if (values[name]) {
        continue;
      }
      
      // Skip optional placeholders that have defaults
      if (placeholder.required === false && placeholder.default) {
        values[name] = placeholder.default;
        continue;
      }
      
      // Special handling for context placeholder
      if (placeholder.type === 'context') {
        console.log(chalk.yellow(`\n${name} (context will be provided separately)`));
        continue;
      }
      
      // Collect value interactively
      const value = await this.promptForValue(name, placeholder);
      if (value !== undefined) {
        values[name] = value;
      }
    }
    
    this.close();
    return values;
  }

  private async promptForValue(
    name: string,
    placeholder: PromptPlaceholder
  ): Promise<string | undefined> {
    let prompt = `\n${chalk.cyan(name)}`;
    
    if (placeholder.description) {
      prompt += ` - ${placeholder.description}`;
    }
    
    if (placeholder.type === 'choice' && placeholder.choices) {
      prompt += '\n' + chalk.gray('Options: ' + placeholder.choices.join(', '));
    }
    
    if (placeholder.default) {
      prompt += `\n${chalk.gray(`Default: ${placeholder.default}`)}`;
    }
    
    if (placeholder.required === false) {
      prompt += ` ${chalk.gray('(optional)')}`;
    }
    
    prompt += '\n> ';
    
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        const trimmed = answer.trim();
        
        // Use default if no answer provided
        if (!trimmed && placeholder.default) {
          resolve(placeholder.default);
          return;
        }
        
        // Handle optional fields
        if (!trimmed && placeholder.required === false) {
          resolve(undefined);
          return;
        }
        
        // Validate choice fields
        if (placeholder.type === 'choice' && placeholder.choices) {
          if (!placeholder.choices.includes(trimmed)) {
            console.log(chalk.red(`Invalid choice. Must be one of: ${placeholder.choices.join(', ')}`));
            // Recursively prompt again
            this.promptForValue(name, placeholder).then(resolve);
            return;
          }
        }
        
        resolve(trimmed);
      });
    });
  }

  /**
   * Show a preview of the prompt with substituted values
   */
  static preview(_prompt: string, values: Record<string, string>): void {
    console.log(chalk.blue('\n📄 Prompt Preview:\n'));
    console.log(chalk.gray('─'.repeat(60)));
    
    // Simple preview - just show the values that will be substituted
    for (const [key, value] of Object.entries(values)) {
      if (key !== 'context') {
        console.log(`${chalk.cyan(key)}: ${value}`);
      }
    }
    
    console.log(chalk.gray('─'.repeat(60)));
  }

  /**
   * Confirm before execution
   */
  async confirm(message: string = 'Proceed with execution?'): Promise<boolean> {
    return new Promise((resolve) => {
      this.rl.question(`\n${message} ${chalk.gray('(y/n)')} `, (answer) => {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  close(): void {
    this.rl.close();
  }
}