import { BitbucketClient } from '../bitbucket-client';
import { cachedFetch } from '../cached-fetch';

// Mock the cached fetch
jest.mock('../cached-fetch', () => ({
  cachedFetch: {
    fetch: jest.fn()
  }
}));

describe('BitbucketClient Integration', () => {
  let client: BitbucketClient;
  let mockFetch: jest.MockedFunction<typeof cachedFetch.fetch>;

  beforeEach(() => {
    // Get the mocked fetch function
    mockFetch = (cachedFetch.fetch as jest.MockedFunction<typeof cachedFetch.fetch>);
    mockFetch.mockClear();

    client = new BitbucketClient({
      workspace: 'test-workspace',
      repoSlug: 'test-repo',
      apiToken: 'test-token',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPullRequestsForTicket', () => {
    it('should fetch and filter pull requests by ticket ID', async () => {
      const mockResponse = {
        values: [
          {
            id: 123,
            title: 'APP-1234 Fix login issue',
            state: 'OPEN',
            links: { html: { href: 'https://bitbucket.org/pr/123' } },
            source: { branch: { name: 'feature/APP-1234' } },
          },
          {
            id: 456,
            title: 'APP-5678 Different ticket',
            state: 'MERGED',
            links: { html: { href: 'https://bitbucket.org/pr/456' } },
            source: { branch: { name: 'feature/APP-5678' } },
          },
        ],
      };

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const prs = await client.getPullRequestsForTicket('APP-1234');

      expect(prs).toHaveLength(1);
      expect(prs[0].id).toBe(123);
      expect(prs[0].title).toContain('APP-1234');
      
      // Verify the API was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('pullrequests?q='),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ values: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const prs = await client.getPullRequestsForTicket('APP-9999');
      
      expect(prs).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue(
        new Response('Unauthorized', {
          status: 401,
          statusText: 'Unauthorized',
        })
      );

      const prs = await client.getPullRequestsForTicket('APP-1234');
      
      expect(prs).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('getPullRequestDetails', () => {
    it('should fetch detailed PR information', async () => {
      const mockPrDetails = {
        id: 123,
        title: 'APP-1234 Fix login issue',
        description: 'This PR fixes the login validation issue',
        author: { display_name: 'John Doe' },
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
      };

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(mockPrDetails), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const details = await client.getPullRequestDetails(123);

      expect(details).toBeDefined();
      expect(details?.description).toBe('This PR fixes the login validation issue');
      expect(details?.participants).toHaveLength(2);
      expect(details?.participants?.[0].approved).toBe(true);
      expect(details?.participants?.[1].approved).toBe(false);
      expect(details?.author.display_name).toBe('John Doe');
      expect(details?.participants).toHaveLength(2);
    });

    it('should handle 404 errors', async () => {
      mockFetch.mockResolvedValue(
        new Response('Not Found', {
          status: 404,
          statusText: 'Not Found',
        })
      );

      const details = await client.getPullRequestDetails(999);
      
      expect(details).toBeNull();
    });
  });

  describe('parseRepoUrl', () => {
    it('should parse SSH URLs correctly', () => {
      const result = BitbucketClient.parseRepoUrl('git@bitbucket.org:workspace/repo.git');
      
      expect(result).toEqual({
        workspace: 'workspace',
        repoSlug: 'repo',
      });
    });

    it('should parse HTTPS URLs correctly', () => {
      const result = BitbucketClient.parseRepoUrl('https://bitbucket.org/workspace/repo.git');
      
      expect(result).toEqual({
        workspace: 'workspace',
        repoSlug: 'repo',
      });
    });

    it('should return null for non-Bitbucket URLs', () => {
      const result = BitbucketClient.parseRepoUrl('https://github.com/user/repo.git');
      
      expect(result).toBeNull();
    });

    it('should handle URLs without .git extension', () => {
      const result = BitbucketClient.parseRepoUrl('https://bitbucket.org/workspace/repo');
      
      expect(result).toEqual({
        workspace: 'workspace',
        repoSlug: 'repo',
      });
    });
  });
});