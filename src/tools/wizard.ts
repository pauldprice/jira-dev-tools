#!/usr/bin/env ts-node

import { Command } from 'commander';
import express from 'express';
import * as path from 'path';
import open from 'open';
import { logger } from '../utils/enhanced-logger';
import { createServer } from 'http';
import * as net from 'net';

const program = new Command();

// Helper function to check if a port is available
const isPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port);
  });
};

// Helper function to find an available port
const findAvailablePort = async (startPort: number, maxAttempts: number = 10): Promise<number> => {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports found between ${startPort} and ${startPort + maxAttempts - 1}`);
};

program
  .name('wizard')
  .description('Launch an interactive web-based wizard to help build toolbox commands')
  .option('-p, --port <port>', 'Port to run the wizard on', '3456')
  .option('--no-open', 'Do not automatically open browser')
  .option('--auto-port', 'Automatically find an available port if the specified one is in use')
  .action(async (options) => {
    const app = express();
    let port = parseInt(options.port, 10);
    
    // Check if we should auto-find a port
    if (options.autoPort) {
      const available = await isPortAvailable(port);
      if (!available) {
        logger.warn(`Port ${port} is in use, finding an available port...`);
        try {
          port = await findAvailablePort(port);
          logger.info(`Using port ${port}`);
        } catch (error) {
          logger.error('Could not find an available port');
          process.exit(1);
        }
      }
    }

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

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use.`);
        logger.info(`Try one of these options:`);
        logger.info(`  1. Use a different port: ./toolbox wizard --port 3457`);
        logger.info(`  2. Find and stop the process using port ${port}:`);
        logger.info(`     lsof -ti:${port} | xargs kill -9`);
        process.exit(1);
      } else if (error.code === 'EACCES') {
        logger.error(`Permission denied to use port ${port}.`);
        logger.info(`Try using a port number above 1024.`);
        process.exit(1);
      } else {
        logger.error(`Server error: ${error.message}`);
        process.exit(1);
      }
    });

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