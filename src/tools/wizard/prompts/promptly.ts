import * as inquirer from 'inquirer';

export async function promptPromptly(): Promise<{ [key: string]: any }> {
  const actionChoices = [
    { name: 'List saved prompts', value: 'list' },
    { name: 'Run a saved prompt', value: 'run' },
    { name: 'Save a new prompt', value: 'save' },
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
    case 'delete':
    case 'export':
      const { name } = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: `Prompt name to ${action}:`,
          validate: (input) => input.length > 0 || 'Prompt name is required'
        }
      ]);
      answers.name = name;

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