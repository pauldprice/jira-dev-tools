import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import * as path from 'path';
import * as fs from 'fs';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

export async function promptAnalyzePdf() {
  return inquirer.prompt([
    {
      name: 'file',
      type: 'input',
      message: 'PDF File Path:',
      default: () => {
        const files = fs.readdirSync('.')
          .filter(f => f.endsWith('.pdf') && f.includes('release_notes'))
          .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
        return files[0] || '';
      },
      validate: (input: string) => {
        const absPath = path.resolve(input);
        if (!fs.existsSync(absPath)) {
          return 'File does not exist';
        }
        if (!input.endsWith('.pdf')) {
          return 'File must be a PDF';
        }
        return true;
      },
    },
    {
      name: 'focus',
      type: 'autocomplete',
      message: 'Analysis Focus: (type to search)',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'All aspects', value: 'all' },
          { name: 'Layout', value: 'layout' },
          { name: 'Readability', value: 'readability' },
          { name: 'Formatting', value: 'formatting' },
          { name: 'Accessibility', value: 'accessibility' },
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => choice.name.toLowerCase().includes(searchTerm));
      },
      default: 'all',
    },
    {
      name: 'json',
      type: 'confirm',
      message: 'JSON Output?',
      default: false,
    },
  ]);
}