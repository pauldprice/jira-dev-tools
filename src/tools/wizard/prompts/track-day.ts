import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import { DateTime } from 'luxon';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

export async function promptTrackDay() {
  // Ask for date
  const { dateOption } = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'dateOption',
      message: 'Which day to track?',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'Yesterday', value: 'yesterday' },
          { name: 'Today', value: 'today' },
          { name: 'Specific date', value: 'specific' }
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => 
          choice.name.toLowerCase().includes(searchTerm)
        );
      },
      default: 'yesterday'
    }
  ]);

  let date;
  if (dateOption === 'yesterday') {
    date = DateTime.now().minus({ days: 1 }).toISODate();
  } else if (dateOption === 'today') {
    date = DateTime.now().toISODate();
  } else {
    const { specificDate } = await inquirer.prompt([
      {
        type: 'input',
        name: 'specificDate',
        message: 'Enter date (YYYY-MM-DD):',
        default: DateTime.now().minus({ days: 1 }).toISODate(),
        validate: (input: string) => {
          const dt = DateTime.fromISO(input);
          return dt.isValid || 'Please enter a valid date in YYYY-MM-DD format';
        }
      }
    ]);
    date = specificDate;
  }

  // Ask which services to include
  const { services } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'services',
      message: 'Which services to track?',
      choices: [
        { name: 'Slack', value: 'slack', checked: true },
        { name: 'Gmail', value: 'gmail', checked: true },
        { name: 'Google Calendar', value: 'calendar', checked: true }
      ]
    }
  ]);

  // Ask about LLM summarization
  const { useLLM } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useLLM',
      message: 'Use AI to enhance summaries?',
      default: true
    }
  ]);

  // Ask about output format
  const { outputFormat } = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'outputFormat',
      message: 'Output format:',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'CSV file', value: 'csv' },
          { name: 'JSON (to console)', value: 'json' }
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => 
          choice.name.toLowerCase().includes(searchTerm)
        );
      },
      default: 'csv'
    }
  ]);

  let outputFile;
  if (outputFormat === 'csv') {
    const { filename } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filename',
        message: 'Output filename:',
        default: `activity_${date}.csv`
      }
    ]);
    outputFile = filename;
  }

  // Ask about workday settings
  const { customizeWorkday } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'customizeWorkday',
      message: 'Customize workday settings?',
      default: false
    }
  ]);

  let workdayStart = '08:00';
  let workdayEnd = '18:00';
  let darkPeriodThreshold = '30';

  if (customizeWorkday) {
    const workdaySettings = await inquirer.prompt([
      {
        type: 'input',
        name: 'workdayStart',
        message: 'Workday start time (HH:mm):',
        default: '08:00',
        validate: (input: string) => /^\d{2}:\d{2}$/.test(input) || 'Please use HH:mm format'
      },
      {
        type: 'input',
        name: 'workdayEnd',
        message: 'Workday end time (HH:mm):',
        default: '18:00',
        validate: (input: string) => /^\d{2}:\d{2}$/.test(input) || 'Please use HH:mm format'
      },
      {
        type: 'input',
        name: 'darkPeriodThreshold',
        message: 'Minimum gap for dark periods (minutes):',
        default: '30',
        validate: (input: string) => !isNaN(parseInt(input, 10)) || 'Please enter a number'
      }
    ]);
    
    workdayStart = workdaySettings.workdayStart;
    workdayEnd = workdaySettings.workdayEnd;
    darkPeriodThreshold = workdaySettings.darkPeriodThreshold;
  }

  return {
    date,
    services,
    useLLM,
    outputFormat,
    outputFile,
    workdayStart,
    workdayEnd,
    darkPeriodThreshold
  };
}