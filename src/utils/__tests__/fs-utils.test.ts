import * as fs from 'fs';
import * as path from 'path';
import { FileSystem } from '../fs-utils';

jest.mock('fs');
jest.mock('fs/promises');

describe('FileSystem', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exists', () => {
    it('should return true when file exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      
      const result = FileSystem.exists('/test/file.txt');
      
      expect(result).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should return false when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const result = FileSystem.exists('/test/nonexistent.txt');
      
      expect(result).toBe(false);
    });
  });

  describe('readFile', () => {
    it('should read file content as string', async () => {
      const mockContent = 'test content';
      mockFs.promises = {
        readFile: jest.fn().mockResolvedValue(Buffer.from(mockContent)),
      } as any;
      
      const result = await FileSystem.readFile('/test/file.txt');
      
      expect(result).toBe(mockContent);
      expect(mockFs.promises.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf-8');
    });

    it('should throw error when file cannot be read', async () => {
      const error = new Error('Permission denied');
      mockFs.promises = {
        readFile: jest.fn().mockRejectedValue(error),
      } as any;
      
      await expect(FileSystem.readFile('/test/file.txt')).rejects.toThrow('Permission denied');
    });
  });

  describe('writeFile', () => {
    it('should write content to file', async () => {
      mockFs.promises = {
        writeFile: jest.fn().mockResolvedValue(undefined),
      } as any;
      
      await FileSystem.writeFile('/test/file.txt', 'test content');
      
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith('/test/file.txt', 'test content', 'utf-8');
    });
  });

  describe('readJSON', () => {
    it('should parse JSON file correctly', async () => {
      const mockJson = { test: 'value', number: 123 };
      mockFs.promises = {
        readFile: jest.fn().mockResolvedValue(JSON.stringify(mockJson)),
      } as any;
      
      const result = await FileSystem.readJSON('/test/config.json');
      
      expect(result).toEqual(mockJson);
    });

    it('should throw error for invalid JSON', async () => {
      mockFs.promises = {
        readFile: jest.fn().mockResolvedValue('invalid json'),
      } as any;
      
      await expect(FileSystem.readJSON('/test/invalid.json')).rejects.toThrow();
    });
  });

  describe('writeJSON', () => {
    it('should write formatted JSON', async () => {
      const mockData = { test: 'value' };
      mockFs.promises = {
        writeFile: jest.fn().mockResolvedValue(undefined),
      } as any;
      
      await FileSystem.writeJSON('/test/output.json', mockData);
      
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        '/test/output.json',
        JSON.stringify(mockData, null, 2),
        'utf-8'
      );
    });
  });

  describe('ensureDir', () => {
    it('should create directory recursively', async () => {
      mockFs.promises = {
        mkdir: jest.fn().mockResolvedValue(undefined),
      } as any;
      
      await FileSystem.ensureDir('/test/nested/dir');
      
      expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/test/nested/dir', { recursive: true });
    });
  });

  describe('remove', () => {
    it('should remove file or directory', async () => {
      mockFs.promises = {
        rm: jest.fn().mockResolvedValue(undefined),
      } as any;
      
      await FileSystem.remove('/test/file.txt');
      
      expect(mockFs.promises.rm).toHaveBeenCalledWith('/test/file.txt', { recursive: true, force: true });
    });
  });
});