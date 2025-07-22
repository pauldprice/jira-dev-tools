import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './enhanced-logger';
import { ConfigManager } from './config-manager';
import * as http from 'http';
import * as url from 'url';
import { execSync } from 'child_process';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
];

export interface GmailAccount {
  email: string;
  alias?: string;
  isDefault?: boolean;
}

export interface GmailAccountConfig {
  email: string;
  alias?: string;
  token?: any;
  refreshToken?: string;
}

export class GmailAuthManager {
  private static instance: GmailAuthManager;
  private oauth2Clients: Map<string, OAuth2Client> = new Map();
  private credentialsPath: string;
  private authDir: string;
  private configManager: ConfigManager;

  private constructor() {
    this.configManager = ConfigManager.getInstance();
    this.authDir = path.join(process.env.HOME!, '.toolbox', '.google-auth');
    this.credentialsPath = path.join(process.env.HOME!, '.toolbox', 'google-credentials.json');
  }

  static getInstance(): GmailAuthManager {
    if (!GmailAuthManager.instance) {
      GmailAuthManager.instance = new GmailAuthManager();
    }
    return GmailAuthManager.instance;
  }

  async initialize(): Promise<void> {
    // Ensure auth directory exists
    await fs.mkdir(this.authDir, { recursive: true });
    
    // Check for migration needs
    await this.migrateOldTokenIfNeeded();
  }

  private async migrateOldTokenIfNeeded(): Promise<void> {
    const oldTokenPath = path.join(process.env.HOME!, '.toolbox', 'google-token.json');
    
    try {
      // Check if old token exists
      const oldTokenData = await fs.readFile(oldTokenPath, 'utf-8');
      const token = JSON.parse(oldTokenData);
      
      logger.info('Found legacy Google token, migrating to new format...');
      
      // We need to authenticate once to get the email address
      const tempClient = await this.createOAuth2Client();
      tempClient.setCredentials(token);
      
      // Get user's email
      const gmail = google.gmail({ version: 'v1', auth: tempClient });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const email = profile.data.emailAddress;
      
      if (!email) {
        throw new Error('Could not determine email address from token');
      }
      
      // Save token with email-based filename
      const newTokenPath = path.join(this.authDir, `token-${email}.json`);
      await fs.writeFile(newTokenPath, JSON.stringify(token, null, 2));
      
      // Update config with this account
      const accounts = await this.getAccountsConfig();
      if (!accounts[email]) {
        accounts[email] = {
          email,
          alias: email.split('@')[0], // Use username as default alias
        };
        
        // Set as default if no other accounts exist
        if (Object.keys(accounts).length === 1) {
          await this.configManager.set('default_gmail_account', email);
        }
        
        await this.configManager.set('gmail_accounts', accounts);
      }
      
      // Remove old token file
      await fs.unlink(oldTokenPath);
      logger.success(`Migrated token for ${email} successfully`);
      
    } catch (error) {
      // Old token doesn't exist or is invalid, that's okay
      logger.debug('No legacy token to migrate');
    }
  }

  private async getAccountsConfig(): Promise<Record<string, GmailAccountConfig>> {
    return await this.configManager.get('gmail_accounts') || {};
  }

  async listAccounts(): Promise<GmailAccount[]> {
    await this.initialize();
    const accounts = await this.getAccountsConfig();
    const defaultAccount = await this.configManager.get('default_gmail_account');
    
    return Object.entries(accounts).map(([email, config]) => ({
      email,
      alias: config.alias,
      isDefault: email === defaultAccount
    }));
  }

  async getDefaultAccount(): Promise<string | null> {
    const defaultAccount = await this.configManager.get('default_gmail_account');
    if (defaultAccount) return defaultAccount;
    
    // If no default set, use the first account
    const accounts = await this.listAccounts();
    return accounts.length > 0 ? accounts[0].email : null;
  }

  async addAccount(email?: string, alias?: string): Promise<OAuth2Client> {
    const client = await this.createOAuth2Client();
    
    // Get new token through OAuth flow
    const token = await this.getNewToken(client);
    
    // Get the email address if not provided
    if (!email) {
      const gmail = google.gmail({ version: 'v1', auth: client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      email = profile.data.emailAddress!;
    }
    
    // Save token
    const tokenPath = path.join(this.authDir, `token-${email}.json`);
    await fs.writeFile(tokenPath, JSON.stringify(token, null, 2));
    
    // Update config
    const accounts = await this.getAccountsConfig();
    accounts[email] = {
      email,
      alias: alias || email.split('@')[0]
    };
    
    // Set as default if it's the first account
    if (Object.keys(accounts).length === 1) {
      await this.configManager.set('default_gmail_account', email);
    }
    
    await this.configManager.set('gmail_accounts', accounts);
    
    // Cache the client
    this.oauth2Clients.set(email, client);
    
    logger.success(`Added Gmail account: ${email}${alias ? ` (${alias})` : ''}`);
    return client;
  }

  async removeAccount(emailOrAlias: string): Promise<void> {
    const accounts = await this.getAccountsConfig();
    
    // Find account by email or alias
    let emailToRemove: string | null = null;
    for (const [email, config] of Object.entries(accounts)) {
      if (email === emailOrAlias || config.alias === emailOrAlias) {
        emailToRemove = email;
        break;
      }
    }
    
    if (!emailToRemove) {
      throw new Error(`Account not found: ${emailOrAlias}`);
    }
    
    // Remove token file
    const tokenPath = path.join(this.authDir, `token-${emailToRemove}.json`);
    try {
      await fs.unlink(tokenPath);
    } catch (error) {
      // Token file might not exist
    }
    
    // Remove from config
    delete accounts[emailToRemove];
    await this.configManager.set('gmail_accounts', accounts);
    
    // Update default if needed
    const defaultAccount = await this.configManager.get('default_gmail_account');
    if (defaultAccount === emailToRemove) {
      const remainingAccounts = Object.keys(accounts);
      if (remainingAccounts.length > 0) {
        await this.configManager.set('default_gmail_account', remainingAccounts[0]);
      } else {
        await this.configManager.delete('default_gmail_account');
      }
    }
    
    // Remove from cache
    this.oauth2Clients.delete(emailToRemove);
    
    logger.success(`Removed Gmail account: ${emailToRemove}`);
  }

  async authenticate(accountEmail?: string): Promise<OAuth2Client> {
    await this.initialize();
    
    // Determine which account to use
    let targetEmail = accountEmail;
    
    if (!targetEmail) {
      const defaultAccount = await this.getDefaultAccount();
      if (!defaultAccount) {
        throw new Error('No Gmail accounts configured. Run "toolbox gmail-accounts add" to add an account.');
      }
      targetEmail = defaultAccount;
    }
    
    // Check if already authenticated
    if (this.oauth2Clients.has(targetEmail)) {
      return this.oauth2Clients.get(targetEmail)!;
    }
    
    // Find account by email or alias
    const accounts = await this.getAccountsConfig();
    let accountEmail_: string | null = null;
    
    for (const [email, config] of Object.entries(accounts)) {
      if (email === targetEmail || config.alias === targetEmail) {
        accountEmail_ = email;
        break;
      }
    }
    
    if (!accountEmail_) {
      throw new Error(`Gmail account not found: ${targetEmail}`);
    }
    
    // Create OAuth client
    const client = await this.createOAuth2Client();
    
    // Load token
    const tokenPath = path.join(this.authDir, `token-${accountEmail_}.json`);
    try {
      const token = JSON.parse(await fs.readFile(tokenPath, 'utf-8'));
      client.setCredentials(token);
      
      // Check if token is expired and refresh if needed
      const tokenInfo = await client.getAccessToken();
      if (!tokenInfo.token) {
        throw new Error('Token expired');
      }
      
      // Update token if refreshed
      if (client.credentials.access_token !== token.access_token) {
        await fs.writeFile(tokenPath, JSON.stringify(client.credentials, null, 2));
      }
    } catch (error) {
      logger.warn(`Token invalid or expired for ${accountEmail_}, re-authenticating...`);
      const newToken = await this.getNewToken(client);
      await fs.writeFile(tokenPath, JSON.stringify(newToken, null, 2));
    }
    
    // Cache the client
    this.oauth2Clients.set(accountEmail_, client);
    
    return client;
  }

  private async createOAuth2Client(): Promise<OAuth2Client> {
    // Check if credentials file exists
    try {
      await fs.access(this.credentialsPath);
    } catch {
      throw new Error(`Google credentials file not found at ${this.credentialsPath}. Please download OAuth credentials from Google Cloud Console and save them to this location.`);
    }
    
    // Load credentials
    const credentials = JSON.parse(await fs.readFile(this.credentialsPath, 'utf-8'));
    const credentialData = credentials.installed || credentials.web;
    
    if (!credentialData) {
      throw new Error('Invalid credentials file format. Expected "installed" or "web" application.');
    }
    
    const { client_secret, client_id, redirect_uris } = credentialData;
    
    return new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );
  }

  private async getNewToken(oauth2Client: OAuth2Client): Promise<any> {
    // Try to use local server first
    const { code, redirectUri } = await this.getAuthCodeViaLocalServer(oauth2Client);
    
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: redirectUri
    });
    
    oauth2Client.setCredentials(tokens);
    return tokens;
  }

  private async getAuthCodeViaLocalServer(oauth2Client: OAuth2Client): Promise<{ code: string; redirectUri: string }> {
    return new Promise((resolve, reject) => {
      const port = 8080;
      const redirectUri = `http://localhost:${port}`;
      
      // Generate auth URL with specific redirect URI
      const authUrl = oauth2Client.generateAuthUrl({
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
          
          server.close(() => {
            // Server fully closed
          });
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
          
          server.close(() => {
            // Server fully closed
          });
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
      const timeoutId = setTimeout(() => {
        server.close(() => {
          reject(new Error('Authorization timeout - no response received'));
        });
      }, 120000);
      
      // Clear timeout on success
      const originalResolve = resolve;
      resolve = (value) => {
        clearTimeout(timeoutId);
        originalResolve(value);
      };
    });
  }
}