import { execSync } from 'child_process';
import { platform } from 'os';
import { logger } from '../../utils/logger';

export class ClipboardManager {
  /**
   * Read content from clipboard
   */
  static read(): string {
    try {
      const platformName = platform();
      
      if (platformName === 'darwin') {
        // macOS
        return execSync('pbpaste', { encoding: 'utf8' });
      } else if (platformName === 'win32') {
        // Windows
        return execSync('powershell -command "Get-Clipboard"', { encoding: 'utf8' });
      } else {
        // Linux (requires xclip or xsel)
        try {
          return execSync('xclip -selection clipboard -o', { encoding: 'utf8' });
        } catch {
          // Fallback to xsel
          return execSync('xsel --clipboard --output', { encoding: 'utf8' });
        }
      }
    } catch (error: any) {
      logger.error(`Failed to read from clipboard: ${error.message}`);
      throw new Error('Failed to read from clipboard. Make sure clipboard tools are installed.');
    }
  }

  /**
   * Write content to clipboard
   */
  static write(content: string): void {
    try {
      const platformName = platform();
      
      if (platformName === 'darwin') {
        // macOS
        execSync('pbcopy', { input: content });
      } else if (platformName === 'win32') {
        // Windows
        execSync('clip', { input: content });
      } else {
        // Linux (requires xclip or xsel)
        try {
          execSync('xclip -selection clipboard', { input: content });
        } catch {
          // Fallback to xsel
          execSync('xsel --clipboard --input', { input: content });
        }
      }
    } catch (error: any) {
      logger.error(`Failed to write to clipboard: ${error.message}`);
      throw new Error('Failed to write to clipboard. Make sure clipboard tools are installed.');
    }
  }

  /**
   * Check if clipboard tools are available
   */
  static isAvailable(): boolean {
    try {
      const platformName = platform();
      
      if (platformName === 'darwin') {
        execSync('which pbpaste', { stdio: 'ignore' });
        execSync('which pbcopy', { stdio: 'ignore' });
        return true;
      } else if (platformName === 'win32') {
        // Windows clipboard is always available
        return true;
      } else {
        // Check for xclip or xsel on Linux
        try {
          execSync('which xclip', { stdio: 'ignore' });
          return true;
        } catch {
          try {
            execSync('which xsel', { stdio: 'ignore' });
            return true;
          } catch {
            return false;
          }
        }
      }
    } catch {
      return false;
    }
  }
}