import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import { logger } from '../../../utils/enhanced-logger';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

export async function promptGmailAccounts() {
  // Ask what operation to perform
  const { operation } = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'operation',
      message: 'What would you like to do?',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'List all Gmail accounts', value: 'list' },
          { name: 'Add a new Gmail account', value: 'add' },
          { name: 'Remove a Gmail account', value: 'remove' },
          { name: 'Set default Gmail account', value: 'set-default' },
          { name: 'Test Gmail account connection', value: 'test' }
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => 
          choice.name.toLowerCase().includes(searchTerm)
        );
      },
      default: 'list'
    }
  ]);

  const answers: any = { operation };

  // Get additional info based on operation
  switch (operation) {
    case 'add':
      const addOptions = await inquirer.prompt([
        {
          type: 'input',
          name: 'alias',
          message: 'Account alias (optional, e.g., "work" or "personal"):'
        },
        {
          type: 'confirm',
          name: 'setDefault',
          message: 'Set as default account?',
          default: false
        }
      ]);
      if (addOptions.alias) answers.alias = addOptions.alias;
      if (addOptions.setDefault) answers.default = true;
      break;

    case 'remove':
    case 'set-default':
    case 'test':
      // For these operations, we need to select an account
      const { GmailAuthManager } = await import('../../../utils/gmail-auth-manager');
      const authManager = GmailAuthManager.getInstance();
      const accounts = await authManager.listAccounts();
      
      if (accounts.length === 0) {
        logger.warn('No Gmail accounts configured.');
        logger.info('Please add an account first.');
        process.exit(1);
      }

      const accountChoices = accounts.map(acc => ({
        name: `${acc.email}${acc.alias ? ` (${acc.alias})` : ''}${acc.isDefault ? ' [DEFAULT]' : ''}`,
        value: acc.email
      }));

      const { emailOrAlias } = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'emailOrAlias',
          message: operation === 'remove' ? 'Select account to remove:' :
                   operation === 'set-default' ? 'Select account to set as default:' :
                   'Select account to test:',
          source: async (_answers: any, input: string) => {
            if (!input) return accountChoices;
            const searchTerm = input.toLowerCase();
            return accountChoices.filter(choice => 
              choice.name.toLowerCase().includes(searchTerm)
            );
          }
        }
      ]);
      answers.emailOrAlias = emailOrAlias;
      break;
  }

  return answers;
}