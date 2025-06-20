import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync, mkdirSync } from 'fs';

export class FileSystem {
  static async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  static async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }

  static async writeFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.ensureDir(dir);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  static async appendFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.ensureDir(dir);
    await fs.appendFile(filePath, content, 'utf-8');
  }

  static async readJSON<T = any>(filePath: string): Promise<T> {
    const content = await this.readFile(filePath);
    return JSON.parse(content);
  }

  static async writeJSON(filePath: string, data: any, pretty: boolean = true): Promise<void> {
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    await this.writeFile(filePath, content);
  }

  static exists(filePath: string): boolean {
    return existsSync(filePath);
  }

  static async remove(filePath: string): Promise<void> {
    if (this.exists(filePath)) {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.unlink(filePath);
      }
    }
  }

  static async copy(src: string, dest: string): Promise<void> {
    await fs.cp(src, dest, { recursive: true });
  }

  static async listFiles(dirPath: string): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile())
      .map(entry => path.join(dirPath, entry.name));
  }

  static async listDirectories(dirPath: string): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(dirPath, entry.name));
  }

  static ensureDirSync(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  static async readdir(dirPath: string): Promise<string[]> {
    return await fs.readdir(dirPath);
  }

  static async stat(filePath: string): Promise<{ size: number; mtime: Date; isDirectory(): boolean }> {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      mtime: stats.mtime,
      isDirectory: () => stats.isDirectory()
    };
  }

  static async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath);
  }
}