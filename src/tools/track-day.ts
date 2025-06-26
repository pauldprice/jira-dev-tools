#!/usr/bin/env ts-node

import { Command } from 'commander';
import { DateTime } from 'luxon';
import { createObjectCsvWriter } from 'csv-writer';
import { SlackActivityClient } from '../utils/activity-tracker/slack-client';
import { GoogleAuthManager } from '../utils/activity-tracker/google-auth';
import { GmailActivityClient } from '../utils/activity-tracker/gmail-client';
import { CalendarActivityClient } from '../utils/activity-tracker/calendar-client';
import { ActivityProcessor } from '../utils/activity-tracker/activity-processor';
import { ActivityTrackerConfig, ActivityItem } from '../utils/activity-tracker/types';
import { logger } from '../utils/enhanced-logger';
import { config as appConfig } from '../utils/config';
import ora from 'ora';

const program = new Command();

program
  .name('track-day')
  .description('Track and summarize daily activities from Slack, Gmail, and Google Calendar')
  .option('-d, --date <date>', 'Date to track (YYYY-MM-DD format, defaults to yesterday)')
  .option('-o, --output <file>', 'Output CSV file (defaults to activity_YYYY-MM-DD.csv)')
  .option('--slack-token <token>', 'Slack API token (or set SLACK_API_TOKEN env var)')
  .option('--google-creds <path>', 'Path to Google credentials JSON file')
  .option('--google-token <path>', 'Path to store Google OAuth token')
  .option('--timezone <tz>', 'Timezone for activity times (defaults to system timezone)')
  .option('--workday-start <time>', 'Workday start time in HH:mm format', '08:00')
  .option('--workday-end <time>', 'Workday end time in HH:mm format', '18:00')
  .option('--dark-period-threshold <minutes>', 'Minimum gap to consider as dark period', '30')
  .option('--no-slack', 'Skip Slack activity')
  .option('--no-gmail', 'Skip Gmail activity')
  .option('--no-calendar', 'Skip Calendar activity')
  .option('--no-llm', 'Skip LLM summarization')
  .option('--json', 'Output as JSON instead of CSV')
  .action(async (options) => {
    const spinner = ora('Initializing activity tracker...').start();

    try {
      // Determine date to track
      const trackDate = options.date 
        ? DateTime.fromISO(options.date)
        : DateTime.now().minus({ days: 1 }).startOf('day');
      
      if (!trackDate.isValid) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }

      logger.info(`Tracking activities for: ${trackDate.toISODate()}`);

      // Build configuration
      const config: ActivityTrackerConfig = {
        slackToken: options.slackToken || process.env.SLACK_API_TOKEN || appConfig.get('SLACK_API_TOKEN'),
        googleCredentialsPath: options.googleCreds || appConfig.get('GOOGLE_CREDENTIALS_PATH'),
        googleTokenPath: options.googleToken || appConfig.get('GOOGLE_TOKEN_PATH'),
        darkPeriodThreshold: parseInt(options.darkPeriodThreshold, 10),
        workdayStart: options.workdayStart,
        workdayEnd: options.workdayEnd,
        timezone: options.timezone || DateTime.local().zoneName || undefined
      };

      const allActivities: ActivityItem[] = [];

      // Fetch Slack activities
      if (options.slack !== false && config.slackToken) {
        spinner.text = 'Fetching Slack activities...';
        try {
          const slackClient = new SlackActivityClient(config.slackToken);
          await slackClient.initialize();
          const slackActivities = await slackClient.fetchDayActivity(trackDate);
          allActivities.push(...slackActivities);
          spinner.succeed(`Found ${slackActivities.length} Slack conversations`);
        } catch (error) {
          spinner.fail('Failed to fetch Slack activities');
          logger.warn('Slack error:', error);
        }
      } else if (options.slack !== false) {
        spinner.warn('Skipping Slack: No API token provided');
      }

      // Initialize Google Auth if needed
      let googleAuth: GoogleAuthManager | null = null;
      if ((options.gmail !== false || options.calendar !== false) && config.googleCredentialsPath) {
        // Stop spinner for auth process
        spinner.stop();
        
        try {
          googleAuth = new GoogleAuthManager(
            config.googleCredentialsPath,
            config.googleTokenPath
          );
          await googleAuth.authenticate();
          spinner.start('Continuing activity tracking...');
        } catch (error) {
          logger.warn('Failed to authenticate with Google:', error);
          googleAuth = null;
          spinner.start('Continuing without Google services...');
        }
      }

      // Fetch Gmail activities
      if (options.gmail !== false && googleAuth) {
        spinner.text = 'Fetching Gmail activities...';
        try {
          const gmailClient = new GmailActivityClient(googleAuth);
          await gmailClient.initialize();
          const gmailActivities = await gmailClient.fetchDayActivity(trackDate);
          allActivities.push(...gmailActivities);
          spinner.succeed(`Found ${gmailActivities.length} emails`);
        } catch (error: any) {
          spinner.fail('Failed to fetch Gmail activities');
          logger.warn('Gmail error:', error.message || error);
          if (error.errors) {
            logger.debug('Detailed error:', JSON.stringify(error.errors, null, 2));
          }
        }
      }

      // Fetch Calendar activities
      if (options.calendar !== false && googleAuth) {
        spinner.text = 'Fetching Calendar events...';
        try {
          const calendarClient = new CalendarActivityClient(googleAuth);
          await calendarClient.initialize();
          const calendarActivities = await calendarClient.fetchDayActivity(trackDate);
          allActivities.push(...calendarActivities);
          spinner.succeed(`Found ${calendarActivities.length} calendar events`);
        } catch (error: any) {
          spinner.fail('Failed to fetch Calendar activities');
          logger.warn('Calendar error:', error.message || error);
          if (error.errors) {
            logger.debug('Detailed error:', JSON.stringify(error.errors, null, 2));
          }
        }
      }

      // Process activities
      spinner.text = 'Processing activities...';
      const processor = new ActivityProcessor(config);
      const processedActivities = options.llm !== false
        ? await processor.processActivities(allActivities)
        : await processor.processActivities(allActivities); // Process with dark periods regardless

      spinner.succeed(`Processed ${processedActivities.length} total activities`);

      // Output results
      const outputFile = options.output || `activity_${trackDate.toISODate()}.csv`;
      
      if (options.json) {
        // Output as JSON
        const jsonOutput = processedActivities.map(activity => ({
          start_time: activity.startTime.toISO(),
          end_time: activity.endTime.toISO(),
          duration_minutes: Math.round(activity.endTime.diff(activity.startTime, 'minutes').minutes),
          participants: activity.participants.join('; ') || activity.channel || '-',
          title: activity.title,
          summary: activity.summary,
          type: activity.type
        }));
        
        console.log(JSON.stringify(jsonOutput, null, 2));
      } else {
        // Output as CSV
        const csvData = processor.formatToCSV(processedActivities);
        const csvWriter = createObjectCsvWriter({
          path: outputFile,
          header: csvData[0].map((h, i) => ({ id: `col${i}`, title: h }))
        });

        const records = csvData.slice(1).map(row => 
          row.reduce((obj, val, i) => ({ ...obj, [`col${i}`]: val }), {})
        );

        await csvWriter.writeRecords(records);
        logger.success(`Activity log saved to: ${outputFile}`);
        
        // Show summary
        const totalMinutes = processedActivities.reduce((sum, activity) => 
          sum + activity.endTime.diff(activity.startTime, 'minutes').minutes, 0
        );
        const darkMinutes = processedActivities
          .filter(a => a.type === 'dark_period')
          .reduce((sum, activity) => 
            sum + activity.endTime.diff(activity.startTime, 'minutes').minutes, 0
          );
        
        logger.info(`\nSummary for ${trackDate.toISODate()}:`);
        logger.info(`- Total tracked time: ${Math.round(totalMinutes)} minutes (${(totalMinutes / 60).toFixed(1)} hours)`);
        logger.info(`- Active time: ${Math.round(totalMinutes - darkMinutes)} minutes`);
        logger.info(`- Dark periods: ${Math.round(darkMinutes)} minutes`);
        logger.info(`- Number of interactions: ${processedActivities.filter(a => a.type !== 'dark_period').length}`);
      }

    } catch (error: any) {
      spinner.fail('Failed to track activities');
      if (error instanceof Error) {
        logger.error('Error:', error.message);
        if (error.stack && process.env.DEBUG) {
          logger.debug('Stack trace:', error.stack);
        }
      } else {
        logger.error('Error:', error);
      }
      process.exit(1);
    }
  });

program.parse();