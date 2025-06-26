import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../enhanced-logger';
import * as readline from 'readline';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
];

export class GoogleAuthManager {
  private oauth2Client?: OAuth2Client;
  private credentialsPath: string;
  private tokenPath: string;

  constructor(credentialsPath?: string, tokenPath?: string) {
    this.credentialsPath = credentialsPath || path.join(process.env.HOME!, '.toolbox', 'google-credentials.json');
    this.tokenPath = tokenPath || path.join(process.env.HOME!, '.toolbox', 'google-token.json');
  }

  async authenticate(): Promise<OAuth2Client> {
    if (this.oauth2Client) return this.oauth2Client;

    try {
      // Load credentials
      const credentials = JSON.parse(await fs.readFile(this.credentialsPath, 'utf-8'));
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
      
      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Try to load existing token
      try {
        const token = JSON.parse(await fs.readFile(this.tokenPath, 'utf-8'));
        this.oauth2Client.setCredentials(token);
        
        // Check if token is expired and refresh if needed
        const tokenInfo = await this.oauth2Client.getAccessToken();
        if (!tokenInfo.token) {
          throw new Error('Token expired');
        }
      } catch (error) {
        // Get new token
        await this.getNewToken();
      }

      return this.oauth2Client;
    } catch (error) {
      throw new Error(`Failed to authenticate with Google: ${error}`);
    }
  }

  private async getNewToken(): Promise<void> {
    if (!this.oauth2Client) throw new Error('OAuth2 client not initialized');

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    logger.info('Authorize this app by visiting this url:');
    logger.info(authUrl);
    logger.info('');
    logger.info('After authorizing, you will be redirected to a URL like:');
    logger.info('http://localhost/?code=4/0AV...&scope=...');
    logger.info('');
    logger.info('Copy ONLY the code value (the part after "code=" and before "&scope=")');
    logger.info('');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const code = await new Promise<string>((resolve) => {
      rl.question('Enter the authorization code here: ', (code) => {
        rl.close();
        resolve(code.trim());
      });
    });

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Store the token for later use
    await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens));
    
    logger.success('Token stored successfully');
  }

  getOAuth2Client(): OAuth2Client {
    if (!this.oauth2Client) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    return this.oauth2Client;
  }
}