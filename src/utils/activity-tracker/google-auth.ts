import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../enhanced-logger';
import * as http from 'http';
import * as url from 'url';
import { execSync } from 'child_process';

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
      const credentialData = credentials.installed || credentials.web;
      
      if (!credentialData) {
        throw new Error('Invalid credentials file format. Expected "installed" or "web" application.');
      }
      
      const { client_secret, client_id, redirect_uris } = credentialData;
      
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

    // Try to use local server first
    const { code, redirectUri } = await this.getAuthCodeViaLocalServer();
    
    const { tokens } = await this.oauth2Client.getToken({
      code,
      redirect_uri: redirectUri
    });
    this.oauth2Client.setCredentials(tokens);

    // Store the token for later use
    await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens));
    
    logger.success('Token stored successfully');
  }

  private async getAuthCodeViaLocalServer(): Promise<{ code: string; redirectUri: string }> {
    return new Promise((resolve, reject) => {
      const port = 8080;
      const redirectUri = `http://localhost:${port}`;
      
      // Generate auth URL with specific redirect URI
      const authUrl = this.oauth2Client!.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        redirect_uri: redirectUri
      });

      // Create temporary server to catch the OAuth callback
      const server = http.createServer((req, res) => {
        const queryObject = url.parse(req.url!, true).query;
        
        if (queryObject.code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <head>
                <meta charset="utf-8">
              </head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #4CAF50;">✅ Authorization Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
                <script>setTimeout(() => window.close(), 3000);</script>
              </body>
            </html>
          `);
          
          server.close();
          resolve({ code: queryObject.code as string, redirectUri });
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #f44336;">❌ Authorization Failed</h1>
                <p>No authorization code received.</p>
              </body>
            </html>
          `);
          
          server.close();
          reject(new Error('No authorization code received'));
        }
      });

      server.listen(port, () => {
        logger.info(`Authorization server listening on http://localhost:${port}`);
        logger.info('Opening browser for authorization...');
        
        // Try to open the browser automatically
        try {
          const openCommand = process.platform === 'darwin' ? 'open' :
                            process.platform === 'win32' ? 'start' : 'xdg-open';
          execSync(`${openCommand} "${authUrl}"`);
        } catch (error) {
          logger.info('Could not open browser automatically.');
          logger.info('Please visit this URL manually:');
          logger.info(authUrl);
        }
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authorization timeout - no response received'));
      }, 120000);
    });
  }

  getOAuth2Client(): OAuth2Client {
    if (!this.oauth2Client) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    return this.oauth2Client;
  }
}