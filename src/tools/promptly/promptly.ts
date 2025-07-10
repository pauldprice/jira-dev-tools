import { Command } from 'commander';
import * as fs from 'fs';
import chalk from 'chalk';
import { PromptManager } from './prompt-store';
import { PromptRunner } from './prompt-runner';
import { PlaceholderParser } from './placeholder-parser';
import { ClipboardManager } from './clipboard';
import { PromptWizard } from './wizard';
import { PromptEditor } from './editor';
import { SavedPrompt, SaveOptions, RunOptions } from './types';
import { logger } from '../../utils/logger';
import { table } from 'table';

export function createPromptlyCommand(): Command {
  const program = new Command('promptly')
    .description('Manage and run reusable AI prompts')
    .version('1.0.0');

  // List command
  program
    .command('list')
    .description('List saved prompts')
    .option('-c, --category <category>', 'Filter by category')
    .option('-s, --search <search>', 'Search in prompt names and descriptions')
    .option('-v, --verbose', 'Show full details including placeholders')
    .action(async (options) => {
      try {
        const manager = new PromptManager();
        const prompts = manager.list(options.category, options.search);

        if (prompts.length === 0) {
          console.log(chalk.yellow('No prompts found'));
          return;
        }

        if (options.verbose) {
          // Detailed view
          prompts.forEach(prompt => {
            console.log(chalk.blue(`\n📝 ${prompt.name}`));
            if (prompt.category) {
              console.log(chalk.gray(`Category: ${prompt.category}`));
            }
            if (prompt.description) {
              console.log(chalk.gray(`Description: ${prompt.description}`));
            }
            console.log(chalk.gray(`Created: ${new Date(prompt.created).toLocaleDateString()}`));
            if (prompt.lastUsed) {
              console.log(chalk.gray(`Last used: ${new Date(prompt.lastUsed).toLocaleDateString()} (${prompt.useCount} times)`));
            }
            
            // Show placeholders
            const placeholderNames = Object.keys(prompt.placeholders);
            if (placeholderNames.length > 0) {
              console.log(chalk.gray(`Placeholders: ${placeholderNames.join(', ')}`));
            }
            
            console.log(chalk.gray('─'.repeat(60)));
          });
        } else {
          // Table view
          const data = [
            ['Name', 'Category', 'Description', 'Last Used', 'Uses']
          ];
          
          prompts.forEach(prompt => {
            data.push([
              prompt.name,
              prompt.category || '-',
              prompt.description ? prompt.description.substring(0, 40) + '...' : '-',
              prompt.lastUsed ? new Date(prompt.lastUsed).toLocaleDateString() : 'Never',
              prompt.useCount.toString()
            ]);
          });
          
          console.log(table(data));
        }

        // Show categories
        const categories = manager.getCategories();
        if (categories.length > 0) {
          console.log(chalk.gray(`\nCategories: ${categories.join(', ')}`));
        }
      } catch (error: any) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  // Save command
  program
    .command('save <name...>')
    .description('Save a new prompt')
    .option('-f, --from-file <file>', 'Read prompt from file')
    .option('-s, --from-string <string>', 'Provide prompt as string')
    .option('-c, --from-clipboard', 'Read prompt from clipboard')
    .option('--category <category>', 'Prompt category')
    .option('--description <description>', 'Prompt description')
    .option('--model <model>', 'Default AI model')
    .option('--system-prompt <prompt>', 'System prompt')
    .option('--force', 'Overwrite existing prompt')
    .action(async (nameArray, options: SaveOptions) => {
      try {
        // Join the name array back into a single string
        const name = nameArray.join(' ');
        
        // Get prompt content
        let promptContent: string;
        
        if (options.fromClipboard) {
          promptContent = ClipboardManager.read();
        } else if (options.fromFile) {
          promptContent = fs.readFileSync(options.fromFile, 'utf8');
        } else if (options.fromString) {
          promptContent = options.fromString;
        } else {
          console.log(chalk.red('Error: Must specify prompt source (--from-file, --from-string, or --from-clipboard)'));
          process.exit(1);
        }

        // Parse placeholders
        const placeholders = PlaceholderParser.parse(promptContent);

        // Create saved prompt
        const savedPrompt: SavedPrompt = {
          name,
          category: options.category,
          description: options.description,
          prompt: promptContent,
          systemPrompt: options.systemPrompt,
          placeholders,
          defaults: {
            model: options.model,
            outputFormat: options.outputFormat
          },
          created: new Date().toISOString(),
          useCount: 0
        };

        // Save
        const manager = new PromptManager();
        manager.save(savedPrompt, options.force || false);

        console.log(chalk.green(`✅ Prompt "${name}" saved successfully`));
        
        // Show placeholders found
        const placeholderNames = Object.keys(placeholders);
        if (placeholderNames.length > 0) {
          console.log(chalk.gray(`Placeholders found: ${placeholderNames.join(', ')}`));
        }
      } catch (error: any) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  // Run command
  program
    .command('run <name>')
    .description('Run a saved prompt')
    .option('--context-from <source>', 'Context source: clipboard, file, stdin', 'clipboard')
    .option('--context-file <file>', 'Context file path (when using file input)')
    .option('--output-to <dest>', 'Output destination: clipboard, file, stdout', 'stdout')
    .option('--output-file <file>', 'Output file path (when using file output)')
    .option('--model <model>', 'Override default AI model')
    .option('-p, --param <key=value...>', 'Set placeholder values', (val, prev) => {
      const [key, ...valueParts] = val.split('=');
      const value = valueParts.join('=');
      return { ...prev, [key]: value };
    }, {})
    .option('--dry-run', 'Preview the prompt without executing')
    .option('--append', 'Append to output file instead of overwriting')
    .option('--silent', 'Suppress progress messages')
    .option('--no-cache', 'Bypass cache and force fresh API call')
    .option('-i, --interactive', 'Use wizard for missing parameters')
    .action(async (name, options) => {
      try {
        const manager = new PromptManager();
        const prompt = manager.get(name);
        
        if (!prompt) {
          console.log(chalk.red(`Error: Prompt "${name}" not found`));
          process.exit(1);
        }

        // Check for API key
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey && !options.dryRun) {
          console.log(chalk.red('Error: ANTHROPIC_API_KEY environment variable not set'));
          process.exit(1);
        }

        // Create run options
        const runOptions: RunOptions = {
          contextFrom: options.contextFrom,
          contextFile: options.contextFile,
          outputTo: options.outputTo,
          outputFile: options.outputFile,
          model: options.model,
          params: options.param || {},
          dryRun: options.dryRun,
          append: options.append,
          silent: options.silent,
          noCache: !options.cache
        };

        // Run the prompt
        const runner = new PromptRunner(apiKey!);
        
        if (options.interactive) {
          await runner.runInteractive(prompt, runOptions);
        } else {
          await runner.run(prompt, runOptions);
        }

        // Update usage stats
        if (!options.dryRun) {
          manager.updateLastUsed(name);
        }
      } catch (error: any) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  // Delete command
  program
    .command('delete <name>')
    .description('Delete a saved prompt')
    .option('--force', 'Skip confirmation')
    .action(async (name, options) => {
      try {
        const manager = new PromptManager();
        
        if (!options.force) {
          const wizard = new PromptWizard();
          const confirmed = await wizard.confirm(`Delete prompt "${name}"?`);
          wizard.close();
          
          if (!confirmed) {
            console.log(chalk.yellow('Deletion cancelled'));
            return;
          }
        }

        const deleted = manager.delete(name);
        if (deleted) {
          console.log(chalk.green(`✅ Prompt "${name}" deleted`));
        } else {
          console.log(chalk.red(`Error: Prompt "${name}" not found`));
        }
      } catch (error: any) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  // Show command
  program
    .command('show <name>')
    .description('Display details of a specific prompt')
    .action(async (name) => {
      try {
        const manager = new PromptManager();
        const prompt = manager.get(name);
        
        if (!prompt) {
          console.log(chalk.red(`Error: Prompt "${name}" not found`));
          process.exit(1);
        }

        console.log(chalk.blue(`\n📝 ${prompt.name}`));
        console.log(chalk.gray('─'.repeat(60)));
        
        if (prompt.category) {
          console.log(chalk.cyan('Category:'), prompt.category);
        }
        if (prompt.description) {
          console.log(chalk.cyan('Description:'), prompt.description);
        }
        
        console.log(chalk.cyan('Created:'), new Date(prompt.created).toLocaleString());
        if (prompt.lastModified) {
          console.log(chalk.cyan('Last modified:'), new Date(prompt.lastModified).toLocaleString());
        }
        if (prompt.lastUsed) {
          console.log(chalk.cyan('Last used:'), new Date(prompt.lastUsed).toLocaleString());
          console.log(chalk.cyan('Use count:'), prompt.useCount);
        }
        
        if (prompt.systemPrompt) {
          console.log(chalk.cyan('\nSystem Prompt:'));
          console.log(chalk.gray(prompt.systemPrompt));
        }
        
        console.log(chalk.cyan('\nPrompt:'));
        console.log(chalk.gray(prompt.prompt));
        
        // Show placeholders
        const placeholderEntries = Object.entries(prompt.placeholders);
        if (placeholderEntries.length > 0) {
          console.log(chalk.cyan('\nPlaceholders:'));
          placeholderEntries.forEach(([name, ph]) => {
            let desc = `  ${name}`;
            if (ph.type) desc += ` (${ph.type})`;
            if (ph.required === false) desc += ' [optional]';
            if (ph.default) desc += ` = "${ph.default}"`;
            if (ph.description) desc += ` - ${ph.description}`;
            console.log(chalk.gray(desc));
            
            if (ph.choices) {
              console.log(chalk.gray(`    Choices: ${ph.choices.join(', ')}`));
            }
          });
        }
        
        console.log(chalk.gray('─'.repeat(60)));
      } catch (error: any) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  // Edit command
  program
    .command('edit <name>')
    .description('Edit an existing prompt in your editor')
    .option('--editor <editor>', 'Specify editor to use (default: $EDITOR or auto-detect)')
    .action(async (name, options) => {
      try {
        const manager = new PromptManager();
        const prompt = manager.get(name);
        
        if (!prompt) {
          console.log(chalk.red(`Error: Prompt "${name}" not found`));
          process.exit(1);
        }

        // Set custom editor if provided
        if (options.editor) {
          process.env.VISUAL = options.editor;
        }

        console.log(chalk.blue(`\n📝 Editing prompt: ${name}`));
        
        // Open in editor
        const editedContent = await PromptEditor.edit(prompt);
        const { prompt: parsedPrompt, metadata } = PromptEditor.parseEditedContentWithMetadata(editedContent);
        
        // Debug logging
        if (process.env.DEBUG_PROMPTLY) {
          console.log(chalk.gray('\nDebug info:'));
          console.log(chalk.gray(`Original name: "${prompt.name}"`));
          console.log(chalk.gray(`Parsed name: "${metadata.name}"`));
          console.log(chalk.gray(`Original category: "${prompt.category}"`));
          console.log(chalk.gray(`Parsed category: "${metadata.category}"`));
          console.log(chalk.gray(`Original description: "${prompt.description}"`));
          console.log(chalk.gray(`Parsed description: "${metadata.description}"`));
          console.log(chalk.gray(`Content changed: ${parsedPrompt !== prompt.prompt}`));
        }
        
        // Check if nothing changed
        // For metadata, we need to handle empty strings as removal
        const newName = metadata.name || prompt.name;
        const nameChanged = newName !== prompt.name;
        
        const originalCategory = prompt.category || '';
        const newCategory = metadata.category !== undefined ? metadata.category : originalCategory;
        const categoryChanged = newCategory !== originalCategory;
        
        const originalDescription = prompt.description || '';
        const newDescription = metadata.description !== undefined ? metadata.description : originalDescription;
        const descriptionChanged = newDescription !== originalDescription;
        
        const contentChanged = parsedPrompt !== prompt.prompt;
        
        if (!contentChanged && !nameChanged && !categoryChanged && !descriptionChanged) {
          console.log(chalk.yellow('\nNo changes made'));
          return;
        }

        // Build update object
        const updates: Partial<SavedPrompt> & { newName?: string } = {
          prompt: parsedPrompt
        };
        
        // Only update metadata if it was changed
        if (nameChanged) {
          updates.newName = newName;
        }
        if (categoryChanged) {
          updates.category = newCategory || undefined;
        }
        if (descriptionChanged) {
          updates.description = newDescription || undefined;
        }

        // Update the prompt
        try {
          manager.update(name, updates);
        } catch (error: any) {
          if (error.message.includes('already exists')) {
            console.log(chalk.red(`\n❌ Error: Prompt "${newName}" already exists`));
            return;
          }
          throw error;
        }

        // Show what changed
        const updatedPrompt = manager.get(newName);
        if (nameChanged) {
          console.log(chalk.green(`\n✅ Prompt renamed from "${name}" to "${newName}"`));
        } else {
          console.log(chalk.green(`\n✅ Prompt "${name}" updated`));
        }
        
        // Show what was updated
        if (contentChanged) {
          console.log(chalk.gray('Content updated'));
        }
        if (nameChanged) {
          console.log(chalk.gray(`Name updated: ${name} → ${newName}`));
        }
        if (categoryChanged) {
          console.log(chalk.gray(`Category updated: ${originalCategory || '(none)'} → ${newCategory || '(none)'}`));
        }
        if (descriptionChanged) {
          console.log(chalk.gray(`Description updated: ${originalDescription || '(none)'} → ${newDescription || '(none)'}`));
        }
        
        // Show new placeholders
        const placeholderNames = Object.keys(updatedPrompt!.placeholders);
        if (placeholderNames.length > 0) {
          console.log(chalk.gray(`Placeholders: ${placeholderNames.join(', ')}`));
        }
      } catch (error: any) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  // Export command
  program
    .command('export <name>')
    .description('Export a prompt as JSON')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (name, options) => {
      try {
        const manager = new PromptManager();
        const json = manager.export(name);
        
        if (options.output) {
          fs.writeFileSync(options.output, json);
          console.log(chalk.green(`✅ Exported to ${options.output}`));
        } else {
          console.log(json);
        }
      } catch (error: any) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  // Import command
  program
    .command('import <file>')
    .description('Import a prompt from JSON file')
    .action(async (file) => {
      try {
        const manager = new PromptManager();
        const data = fs.readFileSync(file, 'utf8');
        manager.import(data);
        
        const prompt = JSON.parse(data);
        console.log(chalk.green(`✅ Imported prompt "${prompt.name}"`));
      } catch (error: any) {
        logger.error(error.message);
        process.exit(1);
      }
    });

  return program;
}