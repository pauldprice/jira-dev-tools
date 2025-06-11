#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { logger, config, progress, createJiraClient } from '../utils';

const program = new Command();

program
  .name('fetch-jira-attachment')
  .description('Download a Jira attachment')
  .argument('<attachment-url>', 'Jira attachment URL or attachment ID')
  .option('-o, --output <file>', 'save to specific file (default: original filename)')
  .option('-d, --directory <dir>', 'save to specific directory (default: current directory)')
  .option('--stdout', 'output to stdout (for piping)')
  .action(async (attachmentUrl: string, options) => {
    try {
      // Validate Jira configuration
      const jiraConfig = config.getJiraConfig();
      if (!jiraConfig) {
        logger.error('Missing Jira configuration. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN');
        process.exit(1);
      }

      // Parse the attachment URL or ID
      let attachmentId: string;
      let filename: string | undefined;
      
      // Check if it's a full URL or just an ID
      if (attachmentUrl.startsWith('http')) {
        // Extract attachment ID from URL
        // Format: https://domain/secure/attachment/12345/filename.ext
        const urlMatch = attachmentUrl.match(/\/secure\/attachment\/(\d+)\/(.+)$/);
        if (urlMatch) {
          attachmentId = urlMatch[1];
          filename = urlMatch[2];
        } else {
          logger.error('Invalid attachment URL format');
          process.exit(1);
        }
      } else if (/^\d+$/.test(attachmentUrl)) {
        // Just an attachment ID
        attachmentId = attachmentUrl;
      } else {
        logger.error('Invalid attachment URL or ID');
        process.exit(1);
      }

      progress.start(`Fetching attachment metadata...`);

      // Create Jira client
      const client = createJiraClient(
        jiraConfig.JIRA_BASE_URL,
        jiraConfig.JIRA_EMAIL,
        jiraConfig.JIRA_API_TOKEN
      );

      // First, get attachment metadata to get the actual download URL
      const attachmentMeta = await client.get<{
        id: string;
        filename: string;
        mimeType: string;
        size: number;
        content: string;
      }>(`/rest/api/3/attachment/${attachmentId}`);

      // Use filename from metadata if we don't have it
      if (!filename) {
        filename = attachmentMeta.filename;
      }

      progress.update(`Downloading ${filename}...`);

      // Download the actual file content
      // The content URL is already a full URL, so we need to make a direct request
      const contentUrl = attachmentMeta.content;
      
      // For the content download, we need to use the client differently
      // since it's a full URL, not a relative path
      const response = await client.get(contentUrl, {
        responseType: 'arraybuffer',
        baseURL: '', // Override baseURL since content URL is absolute
      });

      progress.succeed(`Downloaded ${filename} (${formatFileSize(attachmentMeta.size)})`);

      // Handle output
      if (options.stdout) {
        // Output to stdout as base64 for binary safety
        process.stdout.write(Buffer.from(response).toString('base64'));
      } else {
        // Determine output path
        let outputPath: string;
        
        if (options.output) {
          outputPath = options.output;
        } else {
          const dir = options.directory || '.';
          outputPath = path.join(dir, filename);
        }

        // Ensure directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(outputPath, Buffer.from(response));
        logger.success(`Saved to ${outputPath}`);
      }

    } catch (error: any) {
      progress.fail();
      
      if (error.response?.status === 404) {
        logger.error(`Attachment not found`);
      } else if (error.response?.status === 401) {
        logger.error('Authentication failed. Please check your Jira credentials');
      } else if (error.response?.status === 403) {
        logger.error('Access denied. You may not have permission to view this attachment');
      } else {
        logger.error(`Failed to fetch attachment: ${error.message || error}`);
      }
      
      process.exit(1);
    }
  });

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

program.parse();