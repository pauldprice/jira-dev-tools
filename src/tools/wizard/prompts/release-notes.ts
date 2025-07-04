import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../../../utils/config';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

export async function promptReleaseNotes() {
  // First, get the repository path
  const { repo } = await inquirer.prompt([
    {
      name: 'repo',
      type: 'input',
      message: 'Repository Path:',
      default: config.getDefaultRepoPath(),
      validate: (input: string) => {
        const absPath = path.resolve(input);
        if (!fs.existsSync(absPath)) {
          return 'Path does not exist';
        }
        if (!fs.existsSync(path.join(absPath, '.git'))) {
          return 'Not a git repository';
        }
        return true;
      },
    },
  ]);

  // Then get the generation mode
  const { generationMode } = await inquirer.prompt([
    {
      name: 'generationMode',
      type: 'autocomplete',
      message: 'Generation Mode: (type to search)',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'Branch comparison (test vs master)', value: 'branch' },
          { name: 'Fix Version (all tickets with specific version)', value: 'fixVersion' },
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
      },
      default: 'branch',
    },
  ]);

  // Get mode-specific options
  let modeAnswers: any = {};
  if (generationMode === 'branch') {
    modeAnswers = await inquirer.prompt([
      {
        name: 'source',
        type: 'input',
        message: 'Source Branch:',
        default: 'origin/test',
      },
      {
        name: 'target',
        type: 'input',
        message: 'Target Branch:',
        default: 'origin/master',
      },
    ]);
  } else {
    modeAnswers = await inquirer.prompt([
      {
        name: 'fixVersion',
        type: 'input',
        message: 'Fix Version (e.g., V17.02.00):',
        validate: (input: string) => input.trim() !== '' || 'Fix Version is required',
      },
    ]);
  }

  // Get common options
  const commonAnswers = await inquirer.prompt([
    {
      name: 'aiModel',
      type: 'autocomplete',
      message: 'AI Model: (type to search)',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'None (no AI analysis)', value: 'none' },
          { name: 'Claude Haiku (fast, basic)', value: 'haiku' },
          { name: 'Claude Sonnet (balanced)', value: 'sonnet' },
          { name: 'Claude Opus (advanced)', value: 'opus' },
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
      },
      default: 'sonnet',
    },
    {
      name: 'pdf',
      type: 'confirm',
      message: 'Generate PDF?',
      default: true,
    },
    {
      name: 'includePrDescriptions',
      type: 'confirm',
      message: 'Include PR Descriptions?',
      default: false,
    },
  ]);

  return { repo, generationMode, ...modeAnswers, ...commonAnswers };
}