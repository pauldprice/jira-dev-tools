#!/usr/bin/env ts-node

import { Command } from 'commander';
import express from 'express';
import * as path from 'path';
import open from 'open';
import { logger } from '../utils/enhanced-logger';
import { createServer } from 'http';

const program = new Command();

program
  .name('wizard')
  .description('Launch an interactive web-based wizard to help build toolbox commands')
  .option('-p, --port <port>', 'Port to run the wizard on', '3456')
  .option('--no-open', 'Do not automatically open browser')
  .action(async (options) => {
    const app = express();
    const port = parseInt(options.port, 10);

    // Serve static files from the wizard public directory
    // Get the project root directory (where package.json is)
    const projectRoot = path.resolve(__dirname, '../..');
    const publicPath = path.join(projectRoot, 'wizard/public');
    
    logger.debug(`Serving static files from: ${publicPath}`);
    app.use(express.static(publicPath));

    // API endpoint to get available commands
    app.get('/api/commands', (_, res) => {
      res.json({
        commands: [
          {
            id: 'fetch-jira',
            name: 'Fetch JIRA Ticket',
            description: 'Fetch and format JIRA ticket information',
            category: 'jira',
            options: [
              {
                name: 'ticketId',
                type: 'text',
                label: 'Ticket ID',
                placeholder: 'APP-1234',
                required: true,
                pattern: '^[A-Z]+-\\d+$',
              },
              {
                name: 'format',
                type: 'select',
                label: 'Output Format',
                options: ['default', 'markdown', 'json'],
                default: 'default',
              },
              {
                name: 'includeComments',
                type: 'checkbox',
                label: 'Include Comments',
                default: false,
              },
            ],
          },
          {
            id: 'release-notes',
            name: 'Generate Release Notes',
            description: 'Generate release notes from git commits and JIRA tickets',
            category: 'release',
            options: [
              {
                name: 'repo',
                type: 'text',
                label: 'Repository Path',
                placeholder: '/path/to/repo',
                required: true,
              },
              {
                name: 'source',
                type: 'text',
                label: 'Source Branch',
                placeholder: 'origin/test',
                default: 'origin/test',
              },
              {
                name: 'target',
                type: 'text',
                label: 'Target Branch',
                placeholder: 'origin/master',
                default: 'origin/master',
              },
              {
                name: 'fixVersion',
                type: 'text',
                label: 'Fix Version',
                placeholder: 'V17.02.00',
              },
              {
                name: 'aiModel',
                type: 'select',
                label: 'AI Model',
                options: ['none', 'haiku', 'sonnet', 'opus'],
                default: 'sonnet',
              },
              {
                name: 'pdf',
                type: 'checkbox',
                label: 'Generate PDF',
                default: true,
              },
              {
                name: 'includePrDescriptions',
                type: 'checkbox',
                label: 'Include PR Descriptions',
                default: false,
              },
            ],
          },
          {
            id: 'analyze-pdf',
            name: 'Analyze PDF',
            description: 'Analyze a PDF file using AI vision',
            category: 'analysis',
            options: [
              {
                name: 'file',
                type: 'text',
                label: 'PDF File Path',
                placeholder: '/path/to/file.pdf',
                required: true,
              },
              {
                name: 'focus',
                type: 'select',
                label: 'Analysis Focus',
                options: ['all', 'layout', 'readability', 'formatting', 'accessibility'],
                default: 'all',
              },
              {
                name: 'json',
                type: 'checkbox',
                label: 'JSON Output',
                default: false,
              },
            ],
          },
          {
            id: 'cache',
            name: 'Cache Management',
            description: 'Manage the toolbox cache',
            category: 'utility',
            options: [
              {
                name: 'action',
                type: 'select',
                label: 'Action',
                options: ['stats', 'clear'],
                default: 'stats',
                required: true,
              },
              {
                name: 'namespace',
                type: 'select',
                label: 'Namespace',
                options: ['all', 'jira', 'claude', 'fetch', 'bitbucket'],
                default: 'all',
                showWhen: { action: 'clear' },
              },
            ],
          },
        ],
      });
    });

    // Serve the React app for the root route
    app.get('/', (_, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
    
    // Handle any other routes by serving the React app
    app.use((_, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });

    const server = createServer(app);

    server.listen(port, () => {
      logger.success(`Toolbox Wizard running at http://localhost:${port}`);
      
      if (options.open) {
        logger.info('Opening browser...');
        open(`http://localhost:${port}`);
      }

      logger.info('Press Ctrl+C to stop the wizard');
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('\nShutting down wizard...');
      server.close(() => {
        process.exit(0);
      });
    });
  });

program.parse();