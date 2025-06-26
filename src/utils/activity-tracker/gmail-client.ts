import { google, gmail_v1 } from 'googleapis';
import { DateTime } from 'luxon';
import { ActivityItem } from './types';
import { GoogleAuthManager } from './google-auth';
import { logger } from '../enhanced-logger';
import { CacheManager } from '../cache-manager';

export class GmailActivityClient {
  private gmail?: gmail_v1.Gmail;
  private authManager: GoogleAuthManager;
  private userEmail?: string;
  private cacheManager: CacheManager;

  constructor(authManager: GoogleAuthManager) {
    this.authManager = authManager;
    this.cacheManager = new CacheManager();
  }

  async initialize(): Promise<void> {
    try {
      const auth = await this.authManager.authenticate();
      this.gmail = google.gmail({ version: 'v1', auth });
      
      // Get user's email address
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      this.userEmail = profile.data.emailAddress || undefined;
      logger.debug(`Gmail authenticated as: ${this.userEmail}`);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown Gmail initialization error';
      throw new Error(`Failed to initialize Gmail client: ${errorMessage}`);
    }
  }

  async fetchDayActivity(date: DateTime): Promise<ActivityItem[]> {
    if (!this.gmail) throw new Error('Gmail client not initialized');

    const startOfDay = date.startOf('day');
    const endOfDay = date.endOf('day');
    
    const cacheKey = `gmail-activity:${date.toISODate()}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      logger.debug('Using cached Gmail activity');
      // Restore DateTime objects from cached data
      return (cached as any[]).map(item => ({
        ...item,
        startTime: DateTime.fromISO(item.startTime),
        endTime: DateTime.fromISO(item.endTime)
      }));
    }

    const activities: ActivityItem[] = [];

    try {
      // Build query for emails sent or forwarded by the user
      const query = `from:${this.userEmail} after:${startOfDay.toSeconds()} before:${endOfDay.toSeconds()}`;
      
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 100
      });

      if (response.data.messages) {
        for (const message of response.data.messages) {
          const activity = await this.processEmailMessage(message.id!);
          if (activity) {
            activities.push(activity);
          }
        }
      }

      // Sort by start time
      activities.sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
      
      await this.cacheManager.set(cacheKey, activities);
      return activities;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
      logger.error(`Failed to fetch Gmail activity: ${errorMessage}`);
      if (error.response?.status === 403) {
        logger.error('Gmail API access denied. Please check that Gmail API is enabled in Google Cloud Console.');
      }
      throw error; // Re-throw to let the caller handle it
    }
  }

  private async processEmailMessage(messageId: string): Promise<ActivityItem | null> {
    if (!this.gmail) return null;

    try {
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const headers = message.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('subject');
      const to = getHeader('to').split(',').map(e => e.trim());
      const cc = getHeader('cc').split(',').filter(e => e).map(e => e.trim());
      const dateStr = getHeader('date');

      if (!dateStr) return null;

      const timestamp = DateTime.fromRFC2822(dateStr);
      
      // Extract email body
      const body = this.extractEmailBody(message.data.payload);
      
      // Determine if this is a forwarded email
      const isForwarded = subject.toLowerCase().includes('fwd:') || body.includes('---------- Forwarded message');
      
      // Get all participants
      const participants = [...to, ...cc].filter(email => email && email !== this.userEmail);

      return {
        startTime: timestamp,
        endTime: timestamp.plus({ minutes: 5 }), // Estimate 5 minutes for email
        participants,
        title: isForwarded ? `Forwarded: ${subject}` : `Email: ${subject}`,
        summary: body.substring(0, 200) + '...', // Will be enhanced by LLM
        type: 'email',
        rawContent: `Subject: ${subject}\n\nTo: ${to.join(', ')}\n${cc.length > 0 ? `Cc: ${cc.join(', ')}\n` : ''}\n\n${body}`
      };
    } catch (error) {
      logger.error(`Failed to process email ${messageId}: ${error}`);
      return null;
    }
  }

  private extractEmailBody(payload: any): string {
    let body = '';

    if (payload.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          break;
        } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
          // Fallback to HTML if no plain text
          const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
          // Simple HTML stripping
          body = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        } else if (part.parts) {
          // Recursive for multipart
          body = this.extractEmailBody(part);
          if (body) break;
        }
      }
    }

    return body.trim();
  }
}