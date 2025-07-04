import inquirer from 'inquirer';

export async function promptFetchJira() {
  return inquirer.prompt([
    {
      name: 'ticketId',
      type: 'input',
      message: 'Ticket ID:',
      validate: (input: string) => /^[A-Z]+-\d+$/.test(input) || 'Please enter a valid ticket ID (e.g., APP-1234)',
    },
    {
      name: 'format',
      type: 'autocomplete',
      message: 'Output Format:',
      source: async (_answers: any, input: string) => {
        const choices = ['llm', 'raw'];
        if (!input) return choices;
        return choices.filter(choice => choice.toLowerCase().includes(input.toLowerCase()));
      },
      default: 'llm',
    },
    {
      name: 'excludeComments',
      type: 'confirm',
      message: 'Exclude Comments?',
      default: false,
    },
  ]);
}