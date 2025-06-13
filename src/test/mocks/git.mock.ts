import { SimpleGit } from 'simple-git';

export const mockGitCommits = [
  '123abc|John Doe|2025-01-01T10:00:00Z|APP-1234 Added new feature',
  '456def|Jane Smith|2025-01-02T11:00:00Z|APP-1234 Fixed bug in feature',
  '789ghi|Bob Johnson|2025-01-03T12:00:00Z|APP-5678 Unrelated change',
];

export const mockGitBranches = {
  all: ['origin/master', 'origin/test', 'origin/feature/APP-1234'],
  current: 'feature/APP-1234',
  branches: {
    'origin/master': { current: false, name: 'origin/master' },
    'origin/test': { current: false, name: 'origin/test' },
    'origin/feature/APP-1234': { current: true, name: 'origin/feature/APP-1234' },
  },
};

export const createMockGit = (): Partial<SimpleGit> => ({
  fetch: jest.fn().mockResolvedValue(undefined),
  branch: jest.fn().mockResolvedValue(mockGitBranches),
  log: jest.fn().mockResolvedValue({
    all: mockGitCommits.map(c => {
      const [hash, author, date, message] = c.split('|');
      return { hash, author: { name: author }, date, message };
    }),
    latest: mockGitCommits[0],
    total: mockGitCommits.length,
  }),
  getRemotes: jest.fn().mockResolvedValue([
    {
      name: 'origin',
      refs: {
        fetch: 'https://bitbucket.org/workspace/repo.git',
        push: 'https://bitbucket.org/workspace/repo.git',
      },
    },
  ]),
});

jest.mock('simple-git', () => ({
  simpleGit: jest.fn().mockImplementation(() => createMockGit()),
}));