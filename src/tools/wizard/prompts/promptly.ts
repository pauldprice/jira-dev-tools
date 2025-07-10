import * as inquirer from 'inquirer';

export async function promptPromptly(): Promise<{ [key: string]: any }> {
  const actionChoices = [
    { name: 'List saved prompts', value: 'list' },
    { name: 'Run a saved prompt', value: 'run' },
    { name: 'Save a new prompt', value: 'save' },
    { name: 'Edit an existing prompt', value: 'edit' },
    { name: 'Show prompt details', value: 'show' },
    { name: 'Delete a prompt', value: 'delete' },
    { name: 'Export a prompt', value: 'export' },
    { name: 'Import a prompt', value: 'import' }
  ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: actionChoices
    }
  ]);

  const answers: any = { action };

  switch (action) {
    case 'list':
      const listOptions = await inquirer.prompt([
        {
          type: 'input',
          name: 'category',
          message: 'Filter by category (optional):'
        },
        {
          type: 'input',
          name: 'search',
          message: 'Search term (optional):'
        },
        {
          type: 'confirm',
          name: 'verbose',
          message: 'Show detailed view?',
          default: false
        }
      ]);
      Object.assign(answers, listOptions);
      break;

    case 'run':
      const runOptions = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Prompt name to run:',
          validate: (input) => input.length > 0 || 'Prompt name is required'
        },
        {
          type: 'list',
          name: 'contextFrom',
          message: 'Where is the context/input coming from?',
          choices: [
            { name: 'Clipboard', value: 'clipboard' },
            { name: 'File', value: 'file' },
            { name: 'Standard input (pipe)', value: 'stdin' }
          ],
          default: 'clipboard'
        }
      ]);

      if (runOptions.contextFrom === 'file') {
        const { contextFile } = await inquirer.prompt([
          {
            type: 'input',
            name: 'contextFile',
            message: 'Context file path:',
            validate: (input) => input.length > 0 || 'File path is required'
          }
        ]);
        runOptions.contextFile = contextFile;
      }

      const outputOptions = await inquirer.prompt([
        {
          type: 'list',
          name: 'outputTo',
          message: 'Where should the output go?',
          choices: [
            { name: 'Standard output (console)', value: 'stdout' },
            { name: 'Clipboard', value: 'clipboard' },
            { name: 'File', value: 'file' }
          ],
          default: 'stdout'
        }
      ]);

      if (outputOptions.outputTo === 'file') {
        const fileOptions = await inquirer.prompt([
          {
            type: 'input',
            name: 'outputFile',
            message: 'Output file path:',
            validate: (input) => input.length > 0 || 'File path is required'
          },
          {
            type: 'confirm',
            name: 'append',
            message: 'Append to file (instead of overwrite)?',
            default: false
          }
        ]);
        Object.assign(outputOptions, fileOptions);
      }

      const { interactive } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'interactive',
          message: 'Use interactive mode for parameters?',
          default: true
        }
      ]);

      Object.assign(answers, runOptions, outputOptions, { interactive });
      break;

    case 'save':
      const saveOptions = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Prompt name:',
          validate: (input) => input.length > 0 || 'Prompt name is required'
        },
        {
          type: 'list',
          name: 'promptSource',
          message: 'Where is the prompt template?',
          choices: [
            { name: 'Type it now', value: 'string' },
            { name: 'From clipboard', value: 'clipboard' },
            { name: 'From file', value: 'file' }
          ]
        }
      ]);

      if (saveOptions.promptSource === 'string') {
        const { promptContent } = await inquirer.prompt([
          {
            type: 'editor',
            name: 'promptContent',
            message: 'Enter the prompt template (use ${variable} for placeholders):'
          }
        ]);
        saveOptions.fromString = promptContent;
      } else if (saveOptions.promptSource === 'file') {
        const { fromFile } = await inquirer.prompt([
          {
            type: 'input',
            name: 'fromFile',
            message: 'Prompt file path:',
            validate: (input) => input.length > 0 || 'File path is required'
          }
        ]);
        saveOptions.fromFile = fromFile;
      } else {
        saveOptions.fromClipboard = true;
      }

      const metadata = await inquirer.prompt([
        {
          type: 'input',
          name: 'category',
          message: 'Category (optional):'
        },
        {
          type: 'input',
          name: 'description',
          message: 'Description (optional):'
        },
        {
          type: 'confirm',
          name: 'force',
          message: 'Overwrite if prompt already exists?',
          default: false
        }
      ]);

      delete saveOptions.promptSource;
      Object.assign(answers, saveOptions, metadata);
      break;

    case 'show':
    case 'edit':
    case 'delete':
    case 'export':
      // For edit action, let's make it easier by showing a list of prompts
      if (action === 'edit') {
        // Import PromptManager to get list of prompts
        const { PromptManager } = await import('../../../tools/promptly/prompt-store');
        const manager = new PromptManager();
        const prompts = manager.list();
        
        if (prompts.length === 0) {
          console.log('No prompts available to edit');
          process.exit(0);
        }
        
        const promptChoices = prompts.map(p => ({
          name: `${p.name}${p.category ? ` (${p.category})` : ''} - ${p.description || 'No description'}`,
          value: p.name
        }));
        
        const { selectedPrompt } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedPrompt',
            message: 'Select a prompt to edit:',
            choices: promptChoices
          }
        ]);
        answers.name = selectedPrompt;
        
        // Ask if they want to use a specific editor
        const { useCustomEditor } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'useCustomEditor',
            message: 'Use a specific editor? (default: $EDITOR or auto-detect)',
            default: false
          }
        ]);
        
        if (useCustomEditor) {
          const { editor } = await inquirer.prompt([
            {
              type: 'list',
              name: 'editor',
              message: 'Select editor:',
              choices: [
                { name: 'VS Code', value: 'code --wait' },
                { name: 'Vim', value: 'vim' },
                { name: 'Nano', value: 'nano' },
                { name: 'Emacs', value: 'emacs' },
                { name: 'Other (specify)', value: 'other' }
              ]
            }
          ]);
          
          if (editor === 'other') {
            const { customEditor } = await inquirer.prompt([
              {
                type: 'input',
                name: 'customEditor',
                message: 'Enter editor command:',
                validate: (input) => input.length > 0 || 'Editor command is required'
              }
            ]);
            answers.editor = customEditor;
          } else {
            answers.editor = editor;
          }
        }
      } else {
        // For other actions, just ask for the name
        const { name } = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: `Prompt name to ${action}:`,
            validate: (input) => input.length > 0 || 'Prompt name is required'
          }
        ]);
        answers.name = name;
      }

      if (action === 'delete') {
        const { force } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'force',
            message: 'Skip confirmation?',
            default: false
          }
        ]);
        answers.force = force;
      } else if (action === 'export') {
        const { output } = await inquirer.prompt([
          {
            type: 'input',
            name: 'output',
            message: 'Output file (leave empty for stdout):'
          }
        ]);
        if (output) {
          answers.output = output;
        }
      }
      break;

    case 'import':
      const { file } = await inquirer.prompt([
        {
          type: 'input',
          name: 'file',
          message: 'JSON file to import:',
          validate: (input) => input.length > 0 || 'File path is required'
        }
      ]);
      answers.file = file;
      break;
  }

  return answers;
}