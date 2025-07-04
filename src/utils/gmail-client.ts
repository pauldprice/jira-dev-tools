import { google, gmail_v1 } from 'googleapis';
import { GmailAuthManager } from './gmail-auth-manager';
import { logger } from './enhanced-logger';

export interface EmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet: string;
  body?: string;
  attachments?: AttachmentInfo[];
}

export interface AttachmentInfo {
  filename: string;
  mimeType: string;
  size: number;
}

export interface SearchOptions {
  maxResults?: number;
  includeBody?: boolean;
  includeAttachments?: boolean;
}

export class GmailClient {
  private gmail?: gmail_v1.Gmail;
  private authManager: GmailAuthManager;
  private userEmail?: string;
  private accountEmail?: string;
  
  constructor(accountEmail?: string) {
    this.authManager = GmailAuthManager.getInstance();
    this.accountEmail = accountEmail;
  }

  async initialize(): Promise<void> {
    try {
      const auth = await this.authManager.authenticate(this.accountEmail);
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

  async searchEmails(query: string, options: SearchOptions = {}): Promise<EmailMessage[]> {
    if (!this.gmail) {
      await this.initialize();
    }
    if (!this.gmail) throw new Error('Gmail client not initialized');

    const { maxResults = 50, includeBody = true, includeAttachments = false } = options;

    try {
      // Search for messages - request more than needed to account for filtering
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(maxResults * 2, 500) // Request 2x but cap at 500
      });

      const messages = response.data.messages || [];
      
      if (messages.length === 0) {
        return [];
      }

      logger.debug(`Gmail search returned ${messages.length} message IDs`);

      // Limit the messages to the requested maxResults
      const messagesToFetch = messages.slice(0, maxResults);
      logger.debug(`Fetching details for ${messagesToFetch.length} messages (limit: ${maxResults})`);

      // Fetch full message details
      const emailPromises = messagesToFetch.map(msg => 
        this.fetchEmailDetails(msg.id!, includeBody, includeAttachments)
      );
      
      const emails = await Promise.all(emailPromises);
      return emails.filter(email => email !== null) as EmailMessage[];
      
    } catch (error: any) {
      logger.error('Gmail search error:', error);
      throw new Error(`Failed to search emails: ${error.message}`);
    }
  }

  private async fetchEmailDetails(
    messageId: string, 
    includeBody: boolean,
    includeAttachments: boolean
  ): Promise<EmailMessage | null> {
    if (!this.gmail) throw new Error('Gmail client not initialized');

    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: includeBody ? 'full' : 'metadata'
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      
      // Extract header values
      const getHeader = (name: string): string => 
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
      
      const from = getHeader('from');
      const to = getHeader('to').split(',').map(e => e.trim()).filter(e => e);
      const cc = getHeader('cc').split(',').map(e => e.trim()).filter(e => e);
      const subject = getHeader('subject');
      
      let body = '';
      let attachments: AttachmentInfo[] = [];
      
      if (includeBody && message.payload) {
        body = this.extractBody(message.payload);
      }
      
      if (includeAttachments && message.payload) {
        attachments = this.extractAttachments(message.payload);
      }

      return {
        id: message.id!,
        threadId: message.threadId!,
        internalDate: message.internalDate!,
        from,
        to,
        cc: cc.length > 0 ? cc : undefined,
        subject,
        snippet: message.snippet || '',
        body: includeBody ? body : undefined,
        attachments: includeAttachments ? attachments : undefined
      };
      
    } catch (error: any) {
      logger.error(`Error fetching email ${messageId}:`, error);
      return null;
    }
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart): string {
    let body = '';

    // Single part message
    if (payload.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    
    // Multipart message
    if (payload.parts) {
      for (const part of payload.parts) {
        // Prefer text/plain
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          break;
        }
        // Fall back to text/html
        if (part.mimeType === 'text/html' && part.body?.data && !body) {
          const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
          // Simple HTML to text conversion
          body = html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        }
        // Recursively check nested parts
        if (part.parts) {
          const nestedBody = this.extractBodyFromParts(part.parts);
          if (nestedBody && !body) {
            body = nestedBody;
          }
        }
      }
    }

    return body;
  }

  private extractBodyFromParts(parts: gmail_v1.Schema$MessagePart[]): string {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        const nested = this.extractBodyFromParts(part.parts);
        if (nested) return nested;
      }
    }
    
    // Fall back to HTML if no plain text found
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        return html
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    
    return '';
  }

  private extractAttachments(payload: gmail_v1.Schema$MessagePart): AttachmentInfo[] {
    const attachments: AttachmentInfo[] = [];

    const findAttachments = (part: gmail_v1.Schema$MessagePart) => {
      if (part.filename && part.body?.size) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size
        });
      }
      
      if (part.parts) {
        part.parts.forEach(p => findAttachments(p));
      }
    };

    findAttachments(payload);
    return attachments;
  }

  async getUserEmail(): Promise<string | undefined> {
    if (!this.gmail) {
      await this.initialize();
    }
    return this.userEmail;
  }
}