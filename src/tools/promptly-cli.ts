#!/usr/bin/env node

import { createPromptlyCommand } from './promptly/promptly';
import { logger } from '../utils/logger';

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (error: any) => {
  logger.error(`Unhandled rejection: ${error?.message || error}`);
  process.exit(1);
});

// Create and run the command
const program = createPromptlyCommand();
program.parse(process.argv);