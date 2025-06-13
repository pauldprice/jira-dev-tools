import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { FileSystem } from '../fs-utils';

jest.mock('fs');
jest.mock('fs/promises');

describe('FileSystem', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;
  
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
      mockFsPromises.readFile.mockResolvedValue(mockContent as any);
      
      const result = await FileSystem.readFile('/test/file.txt');
      
      expect(result).toBe(mockContent);
      expect(mockFsPromises.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf-8');
    });

    it('should throw error when file cannot be read', async () => {
      const error = new Error('Permission denied');
      mockFsPromises.readFile.mockRejectedValue(error);
      
      await expect(FileSystem.readFile('/test/file.txt')).rejects.toThrow('Permission denied');
    });
  });

  describe('writeFile', () => {
    it('should write content to file', async () => {
      mockFsPromises.mkdir.mockResolvedValue(undefined as any);
      mockFsPromises.writeFile.mockResolvedValue(undefined as any);
      
      await FileSystem.writeFile('/test/file.txt', 'test content');
      
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith('/test/file.txt', 'test content', 'utf-8');
    });
  });

  describe('readJSON', () => {
    it('should parse JSON file correctly', async () => {
      const mockJson = { test: 'value', number: 123 };
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockJson) as any);
      
      const result = await FileSystem.readJSON('/test/config.json');
      
      expect(result).toEqual(mockJson);
    });

    it('should throw error for invalid JSON', async () => {
      mockFsPromises.readFile.mockResolvedValue('invalid json' as any);
      
      await expect(FileSystem.readJSON('/test/invalid.json')).rejects.toThrow();
    });
  });

  describe('writeJSON', () => {
    it('should write formatted JSON', async () => {
      const mockData = { test: 'value' };
      mockFsPromises.mkdir.mockResolvedValue(undefined as any);
      mockFsPromises.writeFile.mockResolvedValue(undefined as any);
      
      await FileSystem.writeJSON('/test/output.json', mockData);
      
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/test/output.json',
        JSON.stringify(mockData, null, 2),
        'utf-8'
      );
    });
  });

  describe('ensureDir', () => {
    it('should create directory recursively', async () => {
      mockFsPromises.mkdir.mockResolvedValue(undefined as any);
      
      await FileSystem.ensureDir('/test/nested/dir');
      
      expect(mockFsPromises.mkdir).toHaveBeenCalledWith('/test/nested/dir', { recursive: true });
    });
  });

  describe('remove', () => {
    it('should remove file or directory', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFsPromises.rm.mockResolvedValue(undefined as any);
      
      await FileSystem.remove('/test/file.txt');
      
      expect(mockFsPromises.rm).toHaveBeenCalledWith('/test/file.txt', { recursive: true, force: true });
    });
  });
});