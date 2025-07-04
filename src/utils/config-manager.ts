import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class ConfigManager {
  private static instance: ConfigManager;
  private configPath: string;
  private config: Record<string, any> = {};

  private constructor() {
    // Use the first writable config location
    const configPaths = [
      path.join(os.homedir(), '.toolbox', 'config.json'),
      path.join(os.homedir(), '.toolboxrc.json')
    ];
    
    this.configPath = configPaths[0]; // Default to first option
    this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private async loadConfig(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
    } catch (error) {
      // Config doesn't exist yet, that's okay
      this.config = {};
    }
  }

  async get(key: string): Promise<any> {
    await this.loadConfig(); // Reload to get latest
    return this.config[key];
  }

  async set(key: string, value: any): Promise<void> {
    await this.loadConfig(); // Reload to get latest
    this.config[key] = value;
    await this.saveConfig();
  }

  async delete(key: string): Promise<void> {
    await this.loadConfig(); // Reload to get latest
    delete this.config[key];
    await this.saveConfig();
  }

  private async saveConfig(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write config file
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }
}