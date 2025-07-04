import { OAuth2Client } from 'google-auth-library';
import { GmailAuthManager } from '../gmail-auth-manager';
import { logger } from '../enhanced-logger';

export class GoogleAuthManager {
  private gmailAuthManager: GmailAuthManager;
  private accountEmail?: string;

  constructor(_credentialsPath?: string, _tokenPath?: string, accountEmail?: string) {
    // Legacy parameters ignored, using new auth manager
    this.gmailAuthManager = GmailAuthManager.getInstance();
    this.accountEmail = accountEmail;
  }

  async authenticate(): Promise<OAuth2Client> {
    try {
      return await this.gmailAuthManager.authenticate(this.accountEmail);
    } catch (error) {
      throw new Error(`Failed to authenticate with Google: ${error}`);
    }
  }

  getOAuth2Client(): OAuth2Client {
    logger.warn('getOAuth2Client() is deprecated. Use authenticate() directly.');
    throw new Error('getOAuth2Client() is no longer supported. Use authenticate() instead.');
  }
}