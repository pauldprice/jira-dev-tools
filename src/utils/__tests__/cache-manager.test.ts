import { CacheManager } from '../cache-manager';
import { FileSystem } from '../fs-utils';
import * as path from 'path';

jest.mock('../fs-utils');

describe('CacheManager', () => {
  const mockFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;
  let cacheManager: CacheManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileSystem.exists.mockReturnValue(false);
    cacheManager = new CacheManager({ 
      namespace: 'test',
      baseDir: '/test/cache',
      enabled: true,
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const cache = new CacheManager();
      expect(cache).toBeDefined();
    });

    it('should respect enabled flag from environment', () => {
      process.env.TOOLBOX_CACHE_ENABLED = 'false';
      const cache = new CacheManager();
      // Cache operations should be no-ops when disabled
      process.env.TOOLBOX_CACHE_ENABLED = undefined;
    });
  });

  describe('generateKey', () => {
    it('should generate consistent hash for same input', async () => {
      const input = { test: 'data', number: 123 };
      
      const key1 = await cacheManager.generateKey(input);
      const key2 = await cacheManager.generateKey(input);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{16}$/); // SHA256 truncated to 16 chars
    });

    it('should generate different hashes for different inputs', async () => {
      const key1 = await cacheManager.generateKey({ test: 'data1' });
      const key2 = await cacheManager.generateKey({ test: 'data2' });
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('get', () => {
    it('should return null for non-existent cache', async () => {
      mockFileSystem.exists.mockReturnValue(false);
      
      const result = await cacheManager.get('testkey');
      
      expect(result).toBeNull();
    });

    it('should return cached data when valid', async () => {
      const cachedData = {
        timestamp: Date.now(),
        data: { test: 'value' },
      };
      
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readJSON.mockResolvedValue(cachedData);
      
      const result = await cacheManager.get('testkey');
      
      expect(result).toEqual(cachedData.data);
    });

    it('should return null for expired cache', async () => {
      const cachedData = {
        timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        data: { test: 'value' },
      };
      
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readJSON.mockResolvedValue(cachedData);
      
      const result = await cacheManager.get('testkey', 60 * 60 * 1000); // 1 hour TTL
      
      expect(result).toBeNull();
    });

    it('should return data for non-expired cache', async () => {
      const cachedData = {
        timestamp: Date.now() - 30 * 60 * 1000, // 30 minutes ago
        data: { test: 'value' },
      };
      
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readJSON.mockResolvedValue(cachedData);
      
      const result = await cacheManager.get('testkey', 60 * 60 * 1000); // 1 hour TTL
      
      expect(result).toEqual(cachedData.data);
    });
  });

  describe('set', () => {
    it('should save data with timestamp', async () => {
      const testData = { test: 'value' };
      const testMeta = { source: 'test' };
      
      await cacheManager.set('testkey', testData, testMeta);
      
      expect(mockFileSystem.ensureDir).toHaveBeenCalled();
      expect(mockFileSystem.writeJSON).toHaveBeenCalledWith(
        expect.stringContaining('testkey.json'),
        expect.objectContaining({
          timestamp: expect.any(Number),
          data: testData,
          meta: testMeta,
        })
      );
    });

    it('should not save when cache is disabled', async () => {
      const disabledCache = new CacheManager({ enabled: false });
      
      await disabledCache.set('testkey', { test: 'value' });
      
      expect(mockFileSystem.writeJSON).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all cache files in namespace', async () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readdir.mockResolvedValue(['file1.json', 'file2.json']);
      
      await cacheManager.clear();
      
      expect(mockFileSystem.remove).toHaveBeenCalledTimes(2);
    });

    it('should handle non-existent cache directory', async () => {
      mockFileSystem.exists.mockReturnValue(false);
      
      await expect(cacheManager.clear()).resolves.not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockFileSystem.exists.mockReturnValue(true);
      mockFileSystem.readdir.mockResolvedValue(['file1.json', 'file2.json']);
      mockFileSystem.stat.mockResolvedValue({ size: 1024 } as any);
      
      const stats = await cacheManager.getStats();
      
      expect(stats).toEqual({
        namespace: 'test',
        entries: 2,
        totalSize: 2048,
        enabled: true,
      });
    });
  });
});