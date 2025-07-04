import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

export async function promptCache() {
  const { action } = await inquirer.prompt([
    {
      name: 'action',
      type: 'autocomplete',
      message: 'Action:',
      source: async (_answers: any, input: string) => {
        const choices = ['stats', 'clear'];
        if (!input) return choices;
        return choices.filter(choice => choice.toLowerCase().includes(input.toLowerCase()));
      },
      default: 'stats',
    },
  ]);

  let namespace = 'all';
  if (action === 'clear') {
    const namespaceAnswer = await inquirer.prompt([
      {
        name: 'namespace',
        type: 'autocomplete',
        message: 'Namespace: (type to search)',
        source: async (_answers: any, input: string) => {
          const choices = ['all', 'jira', 'claude', 'fetch', 'bitbucket', 'slack', 'gmail', 'calendar'];
          if (!input) return choices;
          return choices.filter(choice => choice.toLowerCase().includes(input.toLowerCase()));
        },
        default: 'all',
      },
    ]);
    namespace = namespaceAnswer.namespace;
  }

  return { action, namespace };
}