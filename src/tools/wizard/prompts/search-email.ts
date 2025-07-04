import inquirer from 'inquirer';
import inquirerAutocompletePrompt from 'inquirer-autocomplete-prompt';
import { logger } from '../../../utils/enhanced-logger';
import { execSync } from 'child_process';
import { DateTime } from 'luxon';

// Register the autocomplete prompt type
inquirer.registerPrompt('autocomplete', inquirerAutocompletePrompt);

export async function promptSearchEmail() {
  // Check available Gmail accounts
  const { GmailAuthManager } = await import('../../../utils/gmail-auth-manager');
  const authManager = GmailAuthManager.getInstance();
  const accounts = await authManager.listAccounts();
  
  let selectedAccount;
  if (accounts.length === 0) {
    logger.warn('No Gmail accounts configured.');
    const { addAccount } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addAccount',
        message: 'Would you like to add a Gmail account now?',
        default: true
      }
    ]);
    
    if (addAccount) {
      // Execute the add account command
      execSync('./toolbox gmail-accounts add', { stdio: 'inherit' });
      // Re-fetch accounts
      const updatedAccounts = await authManager.listAccounts();
      if (updatedAccounts.length > 0) {
        selectedAccount = updatedAccounts[0].email;
      } else {
        logger.error('Failed to add Gmail account');
        process.exit(1);
      }
    } else {
      logger.error('Gmail account required for email search');
      process.exit(1);
    }
  } else if (accounts.length === 1) {
    // Only one account, use it automatically
    selectedAccount = accounts[0].email;
    logger.info(`Using Gmail account: ${selectedAccount}`);
  } else {
    // Multiple accounts, let user choose
    const accountChoices = accounts.map(acc => ({
      name: `${acc.email}${acc.alias ? ` (${acc.alias})` : ''}${acc.isDefault ? ' [DEFAULT]' : ''}`,
      value: acc.email
    }));
    
    accountChoices.push({
      name: '+ Add new Gmail account',
      value: '__add_new__'
    });
    
    const { account } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'account',
        message: 'Select Gmail account:',
        source: async (_answers: any, input: string) => {
          if (!input) return accountChoices;
          const searchTerm = input.toLowerCase();
          return accountChoices.filter(choice => 
            choice.name.toLowerCase().includes(searchTerm)
          );
        },
        default: accounts.find(acc => acc.isDefault)?.email || accounts[0].email
      }
    ]);
    
    if (account === '__add_new__') {
      execSync('./toolbox gmail-accounts add', { stdio: 'inherit' });
      // Re-run the prompt
      return promptSearchEmail();
    }
    
    selectedAccount = account;
  }

  // Get email address and query
  const { email, query } = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Email address to search for (to/from):',
      validate: (input: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(input) || 'Please enter a valid email address';
      }
    },
    {
      type: 'input',
      name: 'query',
      message: 'What would you like to know? (natural language query):',
      validate: (input: string) => input.trim().length > 0 || 'Query is required'
    }
  ]);

  // Ask about date range
  const { dateOption } = await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'dateOption',
      message: 'Date range:',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'All emails', value: 'all' },
          { name: 'Last 7 days', value: '7' },
          { name: 'Last 30 days', value: '30' },
          { name: 'Last 90 days', value: '90' },
          { name: 'Custom date range', value: 'custom' }
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => 
          choice.name.toLowerCase().includes(searchTerm)
        );
      },
      default: '30'
    }
  ]);

  let days, startDate, endDate;
  if (dateOption === 'custom') {
    const dateRange = await inquirer.prompt([
      {
        type: 'input',
        name: 'startDate',
        message: 'Start date (YYYY-MM-DD):',
        validate: (input: string) => {
          if (!input) return true; // Optional
          const dt = DateTime.fromISO(input);
          return dt.isValid || 'Please enter a valid date in YYYY-MM-DD format';
        }
      },
      {
        type: 'input',
        name: 'endDate',
        message: 'End date (YYYY-MM-DD):',
        validate: (input: string) => {
          if (!input) return true; // Optional
          const dt = DateTime.fromISO(input);
          return dt.isValid || 'Please enter a valid date in YYYY-MM-DD format';
        }
      }
    ]);
    startDate = dateRange.startDate;
    endDate = dateRange.endDate;
  } else if (dateOption !== 'all') {
    days = dateOption;
  }

  // Ask about additional filters
  const { useFilters } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useFilters',
      message: 'Add additional filters (subject/body keywords)?',
      default: false
    }
  ]);

  let subject, body;
  if (useFilters) {
    const filters = await inquirer.prompt([
      {
        type: 'input',
        name: 'subject',
        message: 'Subject keywords (optional):'
      },
      {
        type: 'input',
        name: 'body',
        message: 'Body content keywords (optional):'
      }
    ]);
    subject = filters.subject;
    body = filters.body;
  }

  // Ask about options
  const options = await inquirer.prompt([
    {
      type: 'input',
      name: 'limit',
      message: 'Maximum number of emails to process:',
      default: '50',
      validate: (input: string) => {
        const num = parseInt(input, 10);
        return (!isNaN(num) && num > 0 && num <= 500) || 'Please enter a number between 1 and 500';
      }
    },
    {
      type: 'confirm',
      name: 'includeAttachments',
      message: 'Include attachment information?',
      default: false
    },
    {
      type: 'autocomplete',
      name: 'model',
      message: 'AI model for analysis:',
      source: async (_answers: any, input: string) => {
        const choices = [
          { name: 'Claude Haiku (fast, basic)', value: 'haiku' },
          { name: 'Claude Sonnet (balanced)', value: 'sonnet' },
          { name: 'Claude Opus (thorough)', value: 'opus' }
        ];
        if (!input) return choices;
        const searchTerm = input.toLowerCase();
        return choices.filter(choice => 
          choice.name.toLowerCase().includes(searchTerm)
        );
      },
      default: 'haiku'
    },
    {
      type: 'confirm',
      name: 'showReferences',
      message: 'Show email references after analysis?',
      default: true
    }
  ]);

  // Ask about export
  const { shouldExport } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldExport',
      message: 'Export results to file?',
      default: false
    }
  ]);

  let exportFile;
  if (shouldExport) {
    const { format } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'format',
        message: 'Export format:',
        source: async (_answers: any, input: string) => {
          const choices = [
            { name: 'Markdown (.md)', value: 'md' },
            { name: 'JSON (.json)', value: 'json' }
          ];
          if (!input) return choices;
          const searchTerm = input.toLowerCase();
          return choices.filter(choice => 
            choice.name.toLowerCase().includes(searchTerm)
          );
        },
        default: 'md'
      }
    ]);

    const defaultFilename = `email_search_${email.split('@')[0]}_${DateTime.now().toFormat('yyyy-MM-dd')}.${format}`;
    const { filename } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filename',
        message: 'Export filename:',
        default: defaultFilename
      }
    ]);
    exportFile = filename;
  }

  return {
    account: selectedAccount,
    email,
    query,
    days,
    startDate,
    endDate,
    subject,
    body,
    limit: options.limit,
    includeAttachments: options.includeAttachments,
    model: options.model,
    showReferences: options.showReferences,
    export: exportFile
  };
}