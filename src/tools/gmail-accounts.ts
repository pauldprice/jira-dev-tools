#!/usr/bin/env ts-node

import { Command } from 'commander';
import { GmailAuthManager } from '../utils/gmail-auth-manager';
import { logger } from '../utils/enhanced-logger';
import chalk from 'chalk';
import inquirer from 'inquirer';

const program = new Command();

program
  .name('gmail-accounts')
  .description('Manage Gmail accounts for the toolbox');

program
  .command('list')
  .description('List all configured Gmail accounts')
  .action(async () => {
    try {
      const authManager = GmailAuthManager.getInstance();
      const accounts = await authManager.listAccounts();
      
      if (accounts.length === 0) {
        logger.info('No Gmail accounts configured.');
        logger.info('Run "toolbox gmail-accounts add" to add an account.');
        return;
      }
      
      console.log(chalk.blue('\n═══════════════════════════════════════════════════════════════'));
      console.log(chalk.cyan('Configured Gmail Accounts:'));
      console.log(chalk.blue('═══════════════════════════════════════════════════════════════\n'));
      
      for (const account of accounts) {
        const defaultLabel = account.isDefault ? chalk.green(' [DEFAULT]') : '';
        const aliasLabel = account.alias ? chalk.gray(` (${account.alias})`) : '';
        console.log(`  ${chalk.white(account.email)}${aliasLabel}${defaultLabel}`);
      }
      
      console.log();
      process.exit(0);
    } catch (error) {
      logger.error('Failed to list accounts:', error);
      process.exit(1);
    }
  });

program
  .command('add')
  .description('Add a new Gmail account')
  .option('-a, --alias <alias>', 'Set an alias for this account')
  .option('-d, --default', 'Set as default account')
  .action(async (options) => {
    try {
      const authManager = GmailAuthManager.getInstance();
      
      logger.info('Adding new Gmail account...');
      logger.info('You will be redirected to Google to authorize access.');
      
      // Add the account (this will trigger OAuth flow)
      const client = await authManager.addAccount(undefined, options.alias);
      
      // Get the email address
      const { google } = await import('googleapis');
      const gmail = google.gmail({ version: 'v1', auth: client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const email = profile.data.emailAddress!;
      
      // Set as default if requested
      if (options.default) {
        const { ConfigManager } = await import('../utils/config-manager');
        const configManager = ConfigManager.getInstance();
        await configManager.set('default_gmail_account', email);
        logger.success(`Set ${email} as default account`);
      }
      
      logger.success(`Successfully added Gmail account: ${email}`);
      process.exit(0);
    } catch (error: any) {
      logger.error('Failed to add account:', error.message || error);
      process.exit(1);
    }
  });

program
  .command('remove <emailOrAlias>')
  .description('Remove a Gmail account')
  .action(async (emailOrAlias) => {
    try {
      const authManager = GmailAuthManager.getInstance();
      
      // Confirm removal
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove account "${emailOrAlias}"?`,
          default: false
        }
      ]);
      
      if (!confirm) {
        logger.info('Cancelled');
        process.exit(0);
      }
      
      await authManager.removeAccount(emailOrAlias);
      logger.success('Account removed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Failed to remove account:', error);
      process.exit(1);
    }
  });

program
  .command('set-default <emailOrAlias>')
  .description('Set the default Gmail account')
  .action(async (emailOrAlias) => {
    try {
      const authManager = GmailAuthManager.getInstance();
      const accounts = await authManager.listAccounts();
      
      // Find account by email or alias
      const account = accounts.find(acc => 
        acc.email === emailOrAlias || acc.alias === emailOrAlias
      );
      
      if (!account) {
        logger.error(`Account not found: ${emailOrAlias}`);
        process.exit(1);
      }
      
      const { ConfigManager } = await import('../utils/config-manager');
      const configManager = ConfigManager.getInstance();
      await configManager.set('default_gmail_account', account.email);
      
      logger.success(`Set ${account.email} as default account`);
      process.exit(0);
    } catch (error) {
      logger.error('Failed to set default account:', error);
      process.exit(1);
    }
  });

program
  .command('test [emailOrAlias]')
  .description('Test Gmail access for an account')
  .action(async (emailOrAlias) => {
    try {
      const authManager = GmailAuthManager.getInstance();
      
      logger.info(`Testing Gmail access${emailOrAlias ? ` for ${emailOrAlias}` : ''}...`);
      
      const client = await authManager.authenticate(emailOrAlias);
      
      // Test by getting user profile
      const { google } = await import('googleapis');
      const gmail = google.gmail({ version: 'v1', auth: client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      
      logger.success(`Successfully connected to Gmail as: ${profile.data.emailAddress}`);
      logger.info(`Total messages: ${profile.data.messagesTotal}`);
      logger.info(`Total threads: ${profile.data.threadsTotal}`);
      process.exit(0);
    } catch (error) {
      logger.error('Failed to connect to Gmail:', error);
      process.exit(1);
    }
  });

program.parse();