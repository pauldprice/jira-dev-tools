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
    // Always include Category and Description lines, even if empty
    lines.push(`# Category: ${prompt.category || ''}`);
    lines.push(`# Description: ${prompt.description || ''}`)
    lines.push('#');
    lines.push('# Instructions:');
    lines.push('# - Edit the prompt text below');
    lines.push('# - You can modify Name, Category, and Description above');
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
   * Parse the edited content and extract both prompt and metadata
   */
  static parseEditedContentWithMetadata(content: string): {
    prompt: string;
    metadata: {
      name?: string;
      category?: string;
      description?: string;
    };
  } {
    const lines = content.split('\n');
    const metadata: { name?: string; category?: string; description?: string } = {};
    const promptLines: string[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Parse metadata from comment lines
      if (trimmedLine.startsWith('#')) {
        const commentContent = trimmedLine.substring(1).trim();
        
        // Match metadata patterns
        if (commentContent.startsWith('Name:')) {
          metadata.name = commentContent.substring(5).trim();
        } else if (commentContent.startsWith('Category:')) {
          metadata.category = commentContent.substring(9).trim();
        } else if (commentContent.startsWith('Description:')) {
          metadata.description = commentContent.substring(12).trim();
        }
      } else {
        // Non-comment line is part of the prompt
        promptLines.push(line);
      }
    }
    
    // Join and trim the prompt
    const prompt = promptLines.join('\n').trim();
    
    return { prompt, metadata };
  }

  /**
   * Get the user's preferred editor
   */
  private static getEditor(): string {
    // Check common editor environment variables first
    const envEditor = process.env.VISUAL || process.env.EDITOR;
    if (envEditor) {
      // Check if it's VS Code without --wait flag
      if (envEditor === 'code' || envEditor.includes('code ')) {
        if (!envEditor.includes('--wait')) {
          return `${envEditor} --wait`;
        }
      }
      return envEditor;
    }
    
    // Try to find available editors
    const editors = [
      { command: 'code', args: '--wait' },  // VS Code
      { command: 'nano', args: '' },        // Simple and widely available
      { command: 'vim', args: '' },         // Also widely available
      { command: 'vi', args: '' },          // Fallback
      { command: 'notepad', args: '' }      // Windows fallback
    ];
    
    for (const editor of editors) {
      try {
        // Check if the editor exists
        execSync(`which ${editor.command} 2>/dev/null || where ${editor.command} 2>nul`, { stdio: 'ignore' });
        return editor.args ? `${editor.command} ${editor.args}` : editor.command;
      } catch {
        // Editor not found, try next
        continue;
      }
    }
    
    // Ultimate fallback
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