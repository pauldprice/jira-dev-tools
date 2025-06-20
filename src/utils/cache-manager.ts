import * as crypto from 'crypto';
import * as path from 'path';
import { FileSystem } from './fs-utils';
import { logger } from './logger';

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  namespace?: string; // Cache namespace for organization
  cacheDir?: string; // Custom cache directory
  enabled?: boolean; // Enable/disable caching
  debug?: boolean; // Debug logging
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  hash: string;
  metadata?: Record<string, any>;
}

export class CacheManager {
  private cacheDir: string;
  private enabled: boolean;
  private debug: boolean;

  constructor(options: CacheOptions = {}) {
    const baseDir = options.cacheDir || '.toolbox_cache';
    this.cacheDir = options.namespace 
      ? path.join(baseDir, options.namespace)
      : baseDir;
    
    this.enabled = options.enabled ?? true;
    this.debug = options.debug ?? false;

    if (this.enabled) {
      FileSystem.ensureDirSync(this.cacheDir);
    }
  }

  /**
   * Generate a hash from multiple inputs
   */
  static generateHash(...inputs: any[]): string {
    const hash = crypto.createHash('sha256');
    
    for (const input of inputs) {
      if (input === null || input === undefined) {
        hash.update('null');
      } else if (typeof input === 'object') {
        // Sort object keys for consistent hashing
        const sorted = JSON.stringify(input, Object.keys(input).sort());
        hash.update(sorted);
      } else {
        hash.update(String(input));
      }
    }
    
    return hash.digest('hex');
  }

  /**
   * Get cached data if available and not expired
   */
  async get<T>(key: string, ttl?: number): Promise<T | null> {
    if (!this.enabled) return null;

    const filePath = this.getCachePath(key);
    
    if (!FileSystem.exists(filePath)) {
      if (this.debug) logger.info(`Cache miss: ${key}`);
      return null;
    }

    try {
      const entry: CacheEntry<T> = await FileSystem.readJSON(filePath);
      
      // Check TTL
      if (ttl !== undefined) {
        const age = Date.now() - entry.timestamp;
        if (age > ttl) {
          if (this.debug) logger.info(`Cache expired: ${key} (age: ${age}ms, ttl: ${ttl}ms)`);
          await this.delete(key);
          return null;
        }
      }

      if (this.debug) logger.info(`Cache hit: ${key}`);
      return entry.data;
    } catch (error) {
      if (this.debug) logger.info(`Cache read error: ${key}`);
      return null;
    }
  }

  /**
   * Store data in cache
   */
  async set<T>(key: string, data: T, metadata?: Record<string, any>): Promise<void> {
    if (!this.enabled) return;

    const filePath = this.getCachePath(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      hash: key,
      metadata
    };

    try {
      await FileSystem.writeJSON(filePath, entry);
      if (this.debug) logger.info(`Cache set: ${key}`);
    } catch (error) {
      if (this.debug) logger.info(`Cache write error: ${key}`);
    }
  }

  /**
   * Delete cached entry
   */
  async delete(key: string): Promise<void> {
    if (!this.enabled) return;

    const filePath = this.getCachePath(key);
    try {
      await FileSystem.remove(filePath);
      if (this.debug) logger.info(`Cache deleted: ${key}`);
    } catch (error) {
      if (this.debug) logger.info(`Cache delete error: ${key}`);
    }
  }

  /**
   * Clear all cache entries in this namespace
   */
  async clear(): Promise<void> {
    if (!this.enabled) return;

    try {
      await FileSystem.remove(this.cacheDir);
      await FileSystem.ensureDir(this.cacheDir);
      if (this.debug) logger.info('Cache cleared');
    } catch (error) {
      if (this.debug) logger.info('Cache clear error');
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    count: number;
    size: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  }> {
    let totalCount = 0;
    let totalSize = 0;
    let oldest: number | undefined;
    let newest: number | undefined;

    // Read all subdirectories in the cache directory
    const subdirs = await FileSystem.readdir(this.cacheDir);
    
    for (const subdir of subdirs) {
      const subdirPath = path.join(this.cacheDir, subdir);
      const stat = await FileSystem.stat(subdirPath);
      
      // Skip if not a directory
      if (!stat.isDirectory()) continue;
      
      // Read all files in the subdirectory
      const files = await FileSystem.readdir(subdirPath);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(subdirPath, file);
        const fileStat = await FileSystem.stat(filePath);
        totalSize += fileStat.size;
        totalCount++;

        try {
          const entry: CacheEntry = await FileSystem.readJSON(filePath);
          if (!oldest || entry.timestamp < oldest) oldest = entry.timestamp;
          if (!newest || entry.timestamp > newest) newest = entry.timestamp;
        } catch {
          // Ignore invalid entries
        }
      }
    }

    return {
      count: totalCount,
      size: totalSize,
      oldestEntry: oldest ? new Date(oldest) : undefined,
      newestEntry: newest ? new Date(newest) : undefined
    };
  }

  private getCachePath(key: string): string {
    // Use first 8 chars of hash for subdirectory to avoid too many files in one dir
    const subdir = key.substring(0, 8);
    const dir = path.join(this.cacheDir, subdir);
    FileSystem.ensureDirSync(dir);
    return path.join(dir, `${key}.json`);
  }
}

/**
 * Global cache instance for convenience
 */
export const globalCache = new CacheManager({
  namespace: 'global'
});