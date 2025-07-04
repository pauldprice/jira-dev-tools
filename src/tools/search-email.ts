#!/usr/bin/env ts-node

import { Command } from 'commander';
import { GmailClient } from '../utils/gmail-client';
import { logger } from '../utils/enhanced-logger';
import { CachedClaudeClient } from '../utils/cached-claude';
import { ConfigLoader } from '../utils/config';
import { DateTime } from 'luxon';
import chalk from 'chalk';
import * as fs from 'fs/promises';

const program = new Command();
const config = ConfigLoader.getInstance();

interface EmailMessage {
  id: string;
  threadId: string;
  date: Date;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  snippet: string;
  attachments: string[];
}

interface SearchOptions {
  email: string;
  query: string;
  account?: string;
  days?: number;
  startDate?: string;
  endDate?: string;
  subject?: string;
  body?: string;
  limit?: number;
  includeAttachments?: boolean;
  model?: 'haiku' | 'sonnet' | 'opus';
  verbose?: boolean;
  showReferences?: boolean;
  export?: string;
}

async function searchAndAnalyze(options: SearchOptions) {
  const gmail = new GmailClient(options.account);
  const apiKey = config.get('ANTHROPIC_API_KEY');
  const claude = new CachedClaudeClient(apiKey!, options.model || 'haiku');

  try {
    // Build Gmail search query
    const searchParts: string[] = [];
    
    // Add email address search (both to and from)
    searchParts.push(`(from:${options.email} OR to:${options.email})`);
    
    // Add date range
    if (options.startDate || options.endDate || options.days) {
      if (options.days) {
        const afterDate = DateTime.now().minus({ days: options.days }).toFormat('yyyy/MM/dd');
        searchParts.push(`after:${afterDate}`);
      } else {
        if (options.startDate) {
          searchParts.push(`after:${options.startDate}`);
        }
        if (options.endDate) {
          searchParts.push(`before:${options.endDate}`);
        }
      }
    }
    
    // Add subject search
    if (options.subject) {
      searchParts.push(`subject:"${options.subject}"`);
    }
    
    // Add body search
    if (options.body) {
      searchParts.push(`"${options.body}"`);
    }

    const gmailQuery = searchParts.join(' ');
    logger.info(`Searching Gmail with query: ${gmailQuery}`);

    // Debug logging
    logger.debug(`Options limit: ${options.limit}`);
    logger.debug(`Using maxResults: ${options.limit || 50}`);

    // Get emails
    const maxEmails = options.limit || 50;
    const emails = await gmail.searchEmails(gmailQuery, {
      maxResults: maxEmails,
      includeBody: true,
      includeAttachments: options.includeAttachments
    });

    if (emails.length === 0) {
      logger.warn('No emails found matching the search criteria');
      return;
    }

    logger.info(`Processing ${emails.length} emails (limit was ${maxEmails})`);

    // Convert to our format
    const messages: EmailMessage[] = emails.map(email => ({
      id: email.id,
      threadId: email.threadId,
      date: new Date(parseInt(email.internalDate)),
      from: email.from,
      to: email.to,
      cc: email.cc || [],
      subject: email.subject,
      body: email.body || email.snippet,
      snippet: email.snippet,
      attachments: email.attachments?.map(a => a.filename) || []
    }));

    // Sort by date (newest first)
    messages.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Build context for LLM
    const context = buildContext(messages);

    // Create prompt
    const systemPrompt = `You are an AI assistant helping to analyze email conversations. You have access to email messages between the user and a specific contact. Answer the user's query based on the email context provided. Be specific and reference actual emails when relevant.`;

    const userPrompt = `Email Contact: ${options.email}

Email Context:
${context}

User Query: ${options.query}

Please answer the query based on the email conversations above. If referencing specific emails, mention the date and subject.`;

    // Get LLM response
    logger.info('Analyzing emails with AI...');
    const response = await claude.analyze(userPrompt, {
      system: systemPrompt,
      maxTokens: 2000
    });

    // Display results
    console.log(chalk.blue('\n═══════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('AI Analysis:'));
    console.log(chalk.blue('═══════════════════════════════════════════════════════════════\n'));
    console.log(response);

    if (options.showReferences) {
      console.log(chalk.blue('\n═══════════════════════════════════════════════════════════════'));
      console.log(chalk.cyan('Email References:'));
      console.log(chalk.blue('═══════════════════════════════════════════════════════════════\n'));
      
      messages.forEach((msg, idx) => {
        console.log(chalk.yellow(`[${idx + 1}] ${DateTime.fromJSDate(msg.date).toFormat('yyyy-MM-dd HH:mm')}`));
        console.log(chalk.white(`    Subject: ${msg.subject}`));
        console.log(chalk.gray(`    From: ${msg.from} → To: ${msg.to.join(', ')}`));
        if (msg.attachments.length > 0) {
          console.log(chalk.gray(`    Attachments: ${msg.attachments.join(', ')}`));
        }
        console.log();
      });
    }

    // Export if requested
    if (options.export) {
      await exportResults(messages, response, options);
      logger.info(`Results exported to ${options.export}`);
    }

  } catch (error) {
    logger.error('Failed to search and analyze emails:', error);
    process.exit(1);
  }
}

function buildContext(messages: EmailMessage[]): string {
  const lines: string[] = [];
  
  messages.forEach((msg, idx) => {
    lines.push(`--- Email ${idx + 1} ---`);
    lines.push(`Date: ${DateTime.fromJSDate(msg.date).toFormat('yyyy-MM-dd HH:mm')}`);
    lines.push(`From: ${msg.from}`);
    lines.push(`To: ${msg.to.join(', ')}`);
    if (msg.cc.length > 0) {
      lines.push(`CC: ${msg.cc.join(', ')}`);
    }
    lines.push(`Subject: ${msg.subject}`);
    if (msg.attachments.length > 0) {
      lines.push(`Attachments: ${msg.attachments.join(', ')}`);
    }
    lines.push('');
    
    // Truncate very long bodies
    const maxBodyLength = 2000;
    const body = msg.body.trim();
    if (body.length > maxBodyLength) {
      lines.push(body.substring(0, maxBodyLength) + '... [truncated]');
    } else {
      lines.push(body);
    }
    lines.push('\n');
  });
  
  return lines.join('\n');
}

async function exportResults(messages: EmailMessage[], analysis: string, options: SearchOptions) {
  
  const exportData = {
    searchCriteria: {
      email: options.email,
      query: options.query,
      days: options.days,
      startDate: options.startDate,
      endDate: options.endDate,
      subject: options.subject,
      body: options.body
    },
    searchDate: new Date().toISOString(),
    emailCount: messages.length,
    analysis,
    emails: messages.map(msg => ({
      date: msg.date.toISOString(),
      from: msg.from,
      to: msg.to,
      cc: msg.cc,
      subject: msg.subject,
      body: msg.body,
      attachments: msg.attachments
    }))
  };
  
  if (options.export!.endsWith('.json')) {
    await fs.writeFile(options.export!, JSON.stringify(exportData, null, 2));
  } else {
    // Export as markdown
    const lines: string[] = [
      `# Email Search Results`,
      ``,
      `**Search Date:** ${new Date().toISOString()}`,
      `**Contact:** ${options.email}`,
      `**Query:** ${options.query}`,
      `**Emails Found:** ${messages.length}`,
      ``,
      `## AI Analysis`,
      ``,
      analysis,
      ``,
      `## Email Details`,
      ``
    ];
    
    messages.forEach((msg, idx) => {
      lines.push(`### Email ${idx + 1}`);
      lines.push(``);
      lines.push(`- **Date:** ${DateTime.fromJSDate(msg.date).toFormat('yyyy-MM-dd HH:mm')}`);
      lines.push(`- **From:** ${msg.from}`);
      lines.push(`- **To:** ${msg.to.join(', ')}`);
      if (msg.cc.length > 0) {
        lines.push(`- **CC:** ${msg.cc.join(', ')}`);
      }
      lines.push(`- **Subject:** ${msg.subject}`);
      if (msg.attachments.length > 0) {
        lines.push(`- **Attachments:** ${msg.attachments.join(', ')}`);
      }
      lines.push(``);
      lines.push(`**Body:**`);
      lines.push(``);
      lines.push('```');
      lines.push(msg.body);
      lines.push('```');
      lines.push(``);
    });
    
    await fs.writeFile(options.export!, lines.join('\n'));
  }
}

program
  .name('search-email')
  .description('Search Gmail for conversations with a specific contact and analyze with AI')
  .requiredOption('-e, --email <address>', 'Email address to search for (to/from)')
  .requiredOption('-q, --query <query>', 'Natural language query to answer')
  .option('--account <emailOrAlias>', 'Gmail account to use (email or alias)')
  .option('-d, --days <number>', 'Search emails from last N days', parseInt)
  .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
  .option('--end-date <date>', 'End date (YYYY-MM-DD)')
  .option('-s, --subject <keywords>', 'Filter by subject keywords')
  .option('-b, --body <keywords>', 'Filter by body content keywords')
  .option('-l, --limit <number>', 'Maximum number of emails to process', parseInt)
  .option('-a, --include-attachments', 'Include attachment information')
  .option('-m, --model <model>', 'AI model to use (haiku, sonnet, opus)', 'haiku')
  .option('-r, --show-references', 'Show email references after analysis')
  .option('-x, --export <file>', 'Export results to file (.json or .md)')
  .option('-v, --verbose', 'Show detailed progress')
  .action(async (options) => {
    if (options.verbose) {
      logger.setLevel('debug');
    }

    // Validate API key
    const apiKey = config.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      logger.error('ANTHROPIC_API_KEY not found in environment or config');
      process.exit(1);
    }

    // Validate date options
    if (options.days && (options.startDate || options.endDate)) {
      logger.error('Cannot use --days with --start-date or --end-date');
      process.exit(1);
    }

    await searchAndAnalyze(options);
  });

program.parse();