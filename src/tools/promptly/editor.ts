import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { SavedPrompt } from './types';
import { logger } from '../../utils/logger';

export class PromptEditor {
  /**
   * Open a prompt in the user's editor
   */
  static async edit(prompt: SavedPrompt): Promise<string> {
    // Create a temporary file with the prompt content
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `promptly-${prompt.name}-${Date.now()}.txt`);
    
    // Format the prompt for editing
    const content = this.formatForEditing(prompt);
    fs.writeFileSync(tmpFile, content, 'utf8');
    
    try {
      // Get the editor command
      const editor = this.getEditor();
      
      // Open the file in the editor
      logger.info(`Opening in ${editor}...`);
      execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
      
      // Read the edited content
      const editedContent = fs.readFileSync(tmpFile, 'utf8');
      
      // Clean up
      fs.unlinkSync(tmpFile);
      
      return editedContent;
    } catch (error: any) {
      // Clean up on error
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
      throw new Error(`Failed to edit prompt: ${error.message}`);
    }
  }

  /**
   * Format prompt for editing with metadata as comments
   */
  private static formatForEditing(prompt: SavedPrompt): string {
    const lines: string[] = [];
    
    // Add metadata as comments at the top
    lines.push('# Promptly - Edit Prompt');
    lines.push(`# Name: ${prompt.name}`);
    if (prompt.category) {
      lines.push(`# Category: ${prompt.category}`);
    }
    if (prompt.description) {
      lines.push(`# Description: ${prompt.description}`);
    }
    lines.push('#');
    lines.push('# Instructions:');
    lines.push('# - Edit the prompt text below');
    lines.push('# - Use ${variable} or ${variable:default} for placeholders');
    lines.push('# - Lines starting with # are ignored');
    lines.push('# - Save and close the editor when done');
    lines.push('#');
    
    // Add separator
    lines.push('# ' + '='.repeat(58));
    lines.push('');
    
    // Add the actual prompt
    lines.push(prompt.prompt);
    
    return lines.join('\n');
  }

  /**
   * Parse the edited content back to just the prompt
   */
  static parseEditedContent(content: string): string {
    // Remove comment lines and trim
    const lines = content.split('\n');
    const promptLines = lines.filter(line => !line.trim().startsWith('#'));
    
    // Join and trim the result
    return promptLines.join('\n').trim();
  }

  /**
   * Get the user's preferred editor
   */
  private static getEditor(): string {
    // Check common editor environment variables
    const editors = [
      process.env.VISUAL,
      process.env.EDITOR,
      // Fallback editors in order of preference
      'code --wait',  // VS Code with wait flag
      'nano',         // Simple and widely available
      'vim',          // Also widely available
      'vi',           // Fallback
      'notepad'       // Windows fallback
    ];
    
    for (const editor of editors) {
      if (editor) {
        // Check if it's VS Code without --wait flag
        if (editor === 'code' || editor.includes('code ')) {
          if (!editor.includes('--wait')) {
            return `${editor} --wait`;
          }
        }
        return editor;
      }
    }
    
    // This should never happen, but just in case
    return 'vi';
  }

  /**
   * Check if editor is available
   */
  static isEditorAvailable(): boolean {
    try {
      const editor = this.getEditor();
      // Try to check if the editor command exists
      const cmd = editor.split(' ')[0];
      execSync(`which ${cmd} || where ${cmd}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}