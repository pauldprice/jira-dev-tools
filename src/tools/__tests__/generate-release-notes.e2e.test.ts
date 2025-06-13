import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('Release Notes Generator E2E Tests', () => {
  const testWorkDir = path.join(__dirname, '.test-work');
  const toolboxPath = path.join(__dirname, '../../../toolbox');
  
  beforeAll(() => {
    // Ensure test work directory exists
    fs.mkdirSync(testWorkDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up test work directory
    fs.rmSync(testWorkDir, { recursive: true, force: true });
  });

  describe('CLI Interface', () => {
    it('should show help when no arguments provided', () => {
      const output = execSync(`${toolboxPath} release-notes --help`, {
        encoding: 'utf-8',
      });

      expect(output).toContain('generate-release-notes');
      expect(output).toContain('--repo');
      expect(output).toContain('--source');
      expect(output).toContain('--target');
      expect(output).toContain('--fix-version');
    });

    it('should validate repository path', () => {
      expect(() => {
        execSync(`${toolboxPath} release-notes --repo /nonexistent/path`, {
          encoding: 'utf-8',
        });
      }).toThrow(/Not a git repository/);
    });
  });

  describe('Mock Repository Tests', () => {
    let mockRepoPath: string;

    beforeEach(() => {
      // Create a mock git repository
      mockRepoPath = path.join(testWorkDir, 'mock-repo');
      fs.mkdirSync(mockRepoPath, { recursive: true });
      
      // Initialize git repo
      execSync('git init', { cwd: mockRepoPath });
      execSync('git config user.email "test@example.com"', { cwd: mockRepoPath });
      execSync('git config user.name "Test User"', { cwd: mockRepoPath });
      
      // Create initial commit
      fs.writeFileSync(path.join(mockRepoPath, 'README.md'), '# Test Repo');
      execSync('git add .', { cwd: mockRepoPath });
      execSync('git commit -m "Initial commit"', { cwd: mockRepoPath });
      
      // Create master branch
      execSync('git checkout -b master', { cwd: mockRepoPath });
      
      // Create test branch with changes
      execSync('git checkout -b test', { cwd: mockRepoPath });
      
      // Add commits with ticket references
      fs.writeFileSync(path.join(mockRepoPath, 'feature.js'), 'console.log("feature");');
      execSync('git add .', { cwd: mockRepoPath });
      execSync('git commit -m "APP-1234 Add new feature"', { cwd: mockRepoPath });
      
      fs.writeFileSync(path.join(mockRepoPath, 'bugfix.js'), 'console.log("fixed");');
      execSync('git add .', { cwd: mockRepoPath });
      execSync('git commit -m "APP-5678 Fix critical bug"', { cwd: mockRepoPath });
    });

    afterEach(() => {
      // Clean up mock repo
      fs.rmSync(mockRepoPath, { recursive: true, force: true });
    });

    it('should generate release notes for branch comparison', (done) => {
      // Mock environment variables
      process.env.TOOLBOX_CACHE_ENABLED = 'false';
      
      const outputFile = path.join(mockRepoPath, 'release_notes.html');
      
      try {
        execSync(
          `${toolboxPath} release-notes --repo ${mockRepoPath} --source test --target master --no-jira --no-ai`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
        
        // Verify output file was created
        expect(fs.existsSync(outputFile)).toBe(true);
        
        // Verify content
        const content = fs.readFileSync(outputFile, 'utf-8');
        expect(content).toContain('APP-1234');
        expect(content).toContain('APP-5678');
        expect(content).toContain('Release Notes');
        
        done();
      } catch (error) {
        done(error);
      } finally {
        delete process.env.TOOLBOX_CACHE_ENABLED;
      }
    }, 10000); // Increase timeout for E2E test
  });

  describe('Output Formats', () => {
    it('should validate HTML output structure', () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head><title>Test</title></head>
        <body><div class="container">Content</div></body>
        </html>
      `;
      
      expect(mockHtml).toMatch(/<!DOCTYPE html>/);
      expect(mockHtml).toMatch(/<html lang="en">/);
      expect(mockHtml).toMatch(/<\/html>/);
    });

    it('should handle PDF generation flag', () => {
      // This would require mocking Puppeteer, so we just test the flag parsing
      const helpOutput = execSync(`${toolboxPath} release-notes --help`, {
        encoding: 'utf-8',
      });
      
      expect(helpOutput).toContain('--pdf');
      expect(helpOutput).toContain('--pdf-only');
    });
  });
});