import { BitbucketClient } from '../../utils/bitbucket-client';

export const mockPullRequest = {
  id: 123,
  title: 'APP-1234 Test pull request',
  state: 'OPEN',
  links: {
    html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/123' },
  },
  source: {
    branch: { name: 'feature/APP-1234' },
  },
  author: {
    display_name: 'John Doe',
  },
  participants: [
    {
      user: { display_name: 'Jane Smith' },
      role: 'REVIEWER',
      approved: true,
    },
    {
      user: { display_name: 'Bob Johnson' },
      role: 'REVIEWER',
      approved: false,
    },
  ],
  description: 'This PR implements the new feature for APP-1234',
};

export const mockPullRequestDetails = {
  ...mockPullRequest,
  reviewers: mockPullRequest.participants.filter(p => p.role === 'REVIEWER'),
};

export const createMockBitbucketClient = () => {
  const mockClient = {
    getPullRequestsForTicket: jest.fn().mockResolvedValue([mockPullRequest]),
    getPullRequestDetails: jest.fn().mockResolvedValue(mockPullRequestDetails),
  } as unknown as BitbucketClient;
  
  return mockClient;
};

// Mock the parseRepoUrl static method
BitbucketClient.parseRepoUrl = jest.fn().mockReturnValue({
  workspace: 'test-workspace',
  repoSlug: 'test-repo',
});

jest.mock('../../utils/bitbucket-client', () => ({
  BitbucketClient: jest.fn().mockImplementation(() => createMockBitbucketClient()),
}));