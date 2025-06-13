import { getTicketCommits, getTicketBranches, getTicketCodeDiff, formatDiffForAI } from '../git-diff';
import { execSync } from 'child_process';

// Mock child_process
jest.mock('child_process');

describe('Git Diff Integration Tests', () => {
  const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
  const testRepoPath = '/test/repo';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTicketCommits', () => {
    it('should extract commits for a specific ticket', () => {
      const mockGitOutput = `
abc123
def456
ghi789
`.trim();

      mockExecSync.mockReturnValue(Buffer.from(mockGitOutput));

      const commits = getTicketCommits(testRepoPath, 'APP-1234');

      expect(commits).toEqual(['abc123', 'def456', 'ghi789']);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git log'),
        expect.objectContaining({
          cwd: testRepoPath,
          encoding: 'utf-8',
        })
      );
    });

    it('should return empty array when no commits found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('No commits found');
      });

      const commits = getTicketCommits(testRepoPath, 'APP-9999');

      expect(commits).toEqual([]);
    });
  });

  describe('getTicketBranches', () => {
    it('should find branches containing ticket ID', () => {
      mockExecSync
        .mockReturnValueOnce(Buffer.from(`
origin/master
origin/feature/APP-1234-fix-login
origin/feature/APP-5678-other-feature
origin/test
`.trim()))
        .mockReturnValueOnce(Buffer.from('abc123\ndef456')); // Mock commits

      const branches = getTicketBranches(testRepoPath, 'APP-1234');

      expect(branches).toContain('origin/feature/APP-1234-fix-login');
      expect(branches).not.toContain('origin/master');
      expect(branches).not.toContain('origin/feature/APP-5678-other-feature');
    });

    it('should find branches containing commits for the ticket', () => {
      // First call returns branches without ticket ID in name
      mockExecSync
        .mockReturnValueOnce(Buffer.from(`
origin/master
origin/feature/login-fix
origin/test
`.trim()))
        // Second call returns commits for the ticket
        .mockReturnValueOnce(Buffer.from('abc123'))
        // Third call returns branches containing the commit
        .mockReturnValueOnce(Buffer.from(`
origin/feature/login-fix
origin/test
`.trim()));

      const branches = getTicketBranches(testRepoPath, 'APP-1234');

      expect(branches).toContain('origin/feature/login-fix');
      expect(branches).toContain('origin/test');
      expect(branches).not.toContain('origin/master');
    });
  });

  describe('getTicketCodeDiff', () => {
    it('should generate comprehensive diff for ticket', async () => {
      // Mock git commands for diff generation
      mockExecSync
        .mockReturnValueOnce(Buffer.from('abc123\ndef456')) // Commits
        .mockReturnValueOnce(Buffer.from('Patch content 1')) // First patch
        .mockReturnValueOnce(Buffer.from('Patch content 2')) // Second patch
        .mockReturnValueOnce(Buffer.from(` src/login.ts | 20 +++++++++-----------`)) // Stats for commit 1
        .mockReturnValueOnce(Buffer.from(' 1 file changed, 10 insertions(+), 10 deletions(-)')) // Summary 1
        .mockReturnValueOnce(Buffer.from(` src/validation.ts | 5 +++--`)) // Stats for commit 2
        .mockReturnValueOnce(Buffer.from(' 1 file changed, 3 insertions(+), 2 deletions(-)')) // Summary 2
        .mockReturnValueOnce(Buffer.from('+function validateLogin() {\n-function checkLogin() {')); // Diff sample

      const diff = await getTicketCodeDiff(testRepoPath, 'APP-1234');

      expect(diff).toBeDefined();
      expect(diff?.ticketId).toBe('APP-1234');
      expect(diff?.stats.filesChanged).toBe(2);
      expect(diff?.stats.insertions).toBe(13);
      expect(diff?.stats.deletions).toBe(12);
      expect(diff?.files).toHaveLength(2);
    });

    it('should return null when no commits found', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('No commits');
      });

      const diff = await getTicketCodeDiff(testRepoPath, 'APP-9999');

      expect(diff).toBeNull();
    });
  });

  describe('formatDiffForAI', () => {
    it('should format diff for AI analysis', () => {
      const mockDiff = {
        ticketId: 'APP-1234',
        stats: {
          filesChanged: 3,
          insertions: 50,
          deletions: 20,
        },
        files: [
          {
            path: 'src/login.ts',
            changeType: 'modified' as const,
            additions: 30,
            deletions: 10,
            diff: '+function validateLogin() {\n-function checkLogin() {',
          },
          {
            path: 'src/auth.service.ts',
            changeType: 'added' as const,
            additions: 20,
            deletions: 0,
            diff: '+export class AuthService {',
          },
          {
            path: 'old-file.ts',
            changeType: 'deleted' as const,
            additions: 0,
            deletions: 10,
            diff: '',
          },
        ],
        rawDiff: '',
      };

      const formatted = formatDiffForAI(mockDiff);

      expect(formatted).toContain('Code changes for ticket APP-1234');
      expect(formatted).toContain('Files changed: 3, +50, -20');
      expect(formatted).toContain('NEW FILES:');
      expect(formatted).toContain('+ src/auth.service.ts');
      expect(formatted).toContain('MODIFIED FILES:');
      expect(formatted).toContain('~ src/login.ts (+30, -10)');
      expect(formatted).toContain('DELETED FILES:');
      expect(formatted).toContain('- old-file.ts');
      expect(formatted).toContain('KEY CODE CHANGES:');
    });

    it('should limit diff output to prevent token overflow', () => {
      const longDiff = Array(200).fill('+new line').join('\n');
      const mockDiff = {
        ticketId: 'APP-1234',
        stats: { filesChanged: 1, insertions: 200, deletions: 0 },
        files: [{
          path: 'large-file.ts',
          changeType: 'modified' as const,
          additions: 200,
          deletions: 0,
          diff: longDiff,
        }],
        rawDiff: '',
      };

      const formatted = formatDiffForAI(mockDiff);

      expect(formatted).toContain('... (diff truncated)');
    });
  });
});