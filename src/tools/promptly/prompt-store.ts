import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SavedPrompt, PromptStore } from './types';
import { logger } from '../../utils/logger';

export class PromptManager {
  private storePath: string;
  private store: PromptStore = { prompts: {}, version: '1.0.0' };

  constructor(customPath?: string) {
    // Use custom path or default to ~/.toolbox/prompts.json
    this.storePath = customPath || path.join(
      process.env.HOME || os.homedir(),
      '.toolbox',
      'prompts.json'
    );
    
    this.loadStore();
  }

  private loadStore(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf8');
        this.store = JSON.parse(data);
        
        // Migrate old format if needed
        if (!this.store.version) {
          this.store = {
            prompts: this.store as any,
            version: '1.0.0'
          };
          this.saveStore();
        }
      } else {
        // Initialize empty store
        this.store = {
          prompts: {},
          version: '1.0.0'
        };
        this.ensureDirectory();
        this.saveStore();
      }
    } catch (error: any) {
      logger.error(`Failed to load prompt store: ${error.message}`);
      // Initialize with empty store on error
      this.store = {
        prompts: {},
        version: '1.0.0'
      };
    }
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private saveStore(): void {
    try {
      this.ensureDirectory();
      fs.writeFileSync(
        this.storePath,
        JSON.stringify(this.store, null, 2),
        'utf8'
      );
    } catch (error: any) {
      logger.error(`Failed to save prompt store: ${error.message}`);
      throw error;
    }
  }

  list(category?: string, search?: string): SavedPrompt[] {
    let prompts = Object.values(this.store.prompts);

    if (category) {
      prompts = prompts.filter(p => p.category === category);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      prompts = prompts.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower) ||
        p.prompt.toLowerCase().includes(searchLower)
      );
    }

    // Sort by last used (most recent first), then by name
    return prompts.sort((a, b) => {
      if (a.lastUsed && b.lastUsed) {
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
      }
      if (a.lastUsed) return -1;
      if (b.lastUsed) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  get(name: string): SavedPrompt | null {
    return this.store.prompts[name] || null;
  }

  save(prompt: SavedPrompt, force: boolean = false): void {
    if (this.store.prompts[prompt.name] && !force) {
      throw new Error(`Prompt "${prompt.name}" already exists. Use --force to overwrite.`);
    }

    this.store.prompts[prompt.name] = prompt;
    this.saveStore();
  }

  delete(name: string): boolean {
    if (!this.store.prompts[name]) {
      return false;
    }

    delete this.store.prompts[name];
    this.saveStore();
    return true;
  }

  updateLastUsed(name: string): void {
    const prompt = this.store.prompts[name];
    if (prompt) {
      prompt.lastUsed = new Date().toISOString();
      prompt.useCount = (prompt.useCount || 0) + 1;
      this.saveStore();
    }
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    Object.values(this.store.prompts).forEach(prompt => {
      if (prompt.category) {
        categories.add(prompt.category);
      }
    });
    return Array.from(categories).sort();
  }

  export(name: string): string {
    const prompt = this.get(name);
    if (!prompt) {
      throw new Error(`Prompt "${name}" not found`);
    }
    return JSON.stringify(prompt, null, 2);
  }

  import(promptData: string): void {
    const prompt = JSON.parse(promptData) as SavedPrompt;
    if (!prompt.name || !prompt.prompt) {
      throw new Error('Invalid prompt data');
    }
    this.save(prompt, true);
  }

  update(name: string, updates: Partial<SavedPrompt>): void {
    const existing = this.get(name);
    if (!existing) {
      throw new Error(`Prompt "${name}" not found`);
    }

    // Merge updates with existing prompt
    const updated: SavedPrompt = {
      ...existing,
      ...updates,
      name: existing.name, // Name cannot be changed via update
      created: existing.created, // Preserve original creation date
      lastModified: new Date().toISOString()
    };

    // Re-parse placeholders if prompt text changed
    if (updates.prompt) {
      const PlaceholderParser = require('./placeholder-parser').PlaceholderParser;
      updated.placeholders = PlaceholderParser.parse(updates.prompt);
    }

    this.store.prompts[name] = updated;
    this.saveStore();
  }
}