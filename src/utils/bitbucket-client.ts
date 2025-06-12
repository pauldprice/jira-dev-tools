import { config as appConfig } from './config';
import { logger } from './logger';
import { cachedFetch } from './cached-fetch';

export interface BitbucketPullRequest {
  id: number;
  title: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  created_on: string;
  updated_on: string;
  source: {
    branch: {
      name: string;
    };
  };
  destination: {
    branch: {
      name: string;
    };
  };
  links: {
    html: {
      href: string;
    };
  };
  author: {
    display_name: string;
  };
}

export interface BitbucketConfig {
  workspace: string;
  repoSlug: string;
  apiToken?: string;
}

export class BitbucketClient {
  private baseUrl = 'https://api.bitbucket.org/2.0';
  private workspace: string;
  private repoSlug: string;
  private apiToken: string;

  constructor(config: BitbucketConfig) {
    this.workspace = config.workspace;
    this.repoSlug = config.repoSlug;
    // Use Bitbucket-specific token first, fall back to JIRA token
    this.apiToken = config.apiToken || 
                   (appConfig.get('BITBUCKET_ACCESS_TOKEN') as string) || 
                   (appConfig.get('JIRA_API_TOKEN') as string) || '';
    
    if (!this.apiToken) {
      logger.warn('No Bitbucket access token found. PR detection will be disabled.');
      logger.info('Set BITBUCKET_ACCESS_TOKEN in environment or config file');
    } else {
      logger.info(`Bitbucket client initialized for ${this.workspace}/${this.repoSlug}`);
      // Debug: Show which token source was used (but not the token itself)
      if (config.apiToken) {
        logger.info('Using provided API token');
      } else if (appConfig.get('BITBUCKET_ACCESS_TOKEN')) {
        logger.info('Using BITBUCKET_ACCESS_TOKEN from config');
        logger.info(`Token present: ${this.apiToken ? 'yes' : 'no'}, length: ${this.apiToken?.length || 0}`);
      } else {
        logger.info('Using JIRA_API_TOKEN as fallback');
      }
    }
  }

  /**
   * Extract workspace and repo slug from repository URL
   */
  static parseRepoUrl(repoUrl: string): { workspace: string; repoSlug: string } | null {
    // Handle SSH format: git@bitbucket.org:workspace/repo.git
    const sshMatch = repoUrl.match(/git@bitbucket\.org:([^\/]+)\/([^\.]+)/);
    if (sshMatch) {
      return {
        workspace: sshMatch[1],
        repoSlug: sshMatch[2]
      };
    }

    // Handle HTTPS format: https://bitbucket.org/workspace/repo.git
    const httpsMatch = repoUrl.match(/https:\/\/bitbucket\.org\/([^\/]+)\/([^\.]+)/);
    if (httpsMatch) {
      return {
        workspace: httpsMatch[1],
        repoSlug: httpsMatch[2]
      };
    }

    return null;
  }

  /**
   * Search for pull requests by branch name or ticket ID
   */
  async searchPullRequests(query: string): Promise<BitbucketPullRequest[]> {
    if (!this.apiToken) {
      return [];
    }

    try {
      // Search in both source and destination branch names, and title
      const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests?q=source.branch.name~"${query}" OR title~"${query}"&state=OPEN&state=MERGED`;
      logger.info(`Bitbucket API URL: ${url}`);
      
      const response = await cachedFetch.fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json'
        },
        cache: {
          namespace: 'bitbucket',
          ttl: 5 * 60 * 1000 // Cache for 5 minutes
        }
      });

      if (!response.ok) {
        logger.warn(`Bitbucket API returned ${response.status}: ${response.statusText}`);
        if (response.status === 401) {
          logger.warn('Authentication failed. Check BITBUCKET_ACCESS_TOKEN is valid');
          logger.warn('Create a Bitbucket app password at: https://bitbucket.org/account/settings/app-passwords/');
        }
        return [];
      }

      const data = await response.json() as { values?: BitbucketPullRequest[] };
      return data.values || [];
    } catch (error: any) {
      logger.debug(`Failed to search Bitbucket PRs: ${error.message}`);
      return [];
    }
  }

  /**
   * Get pull requests for a specific ticket ID
   */
  async getPullRequestsForTicket(ticketId: string): Promise<BitbucketPullRequest[]> {
    logger.info(`Searching for PRs for ticket ${ticketId}`);
    const prs = await this.searchPullRequests(ticketId);
    logger.info(`Found ${prs.length} total PRs matching query`);
    
    // Filter to only include PRs that actually contain the ticket ID
    const filtered = prs.filter(pr => 
      pr.source.branch.name.toUpperCase().includes(ticketId.toUpperCase()) ||
      pr.title.toUpperCase().includes(ticketId.toUpperCase())
    );
    
    logger.info(`Filtered to ${filtered.length} PRs for ${ticketId}`);
    if (filtered.length > 0) {
      filtered.forEach(pr => {
        logger.info(`  PR #${pr.id}: ${pr.title} (${pr.state}) - ${pr.source.branch.name}`);
      });
    }
    return filtered;
  }

  /**
   * Check if a branch has an associated pull request
   */
  async getBranchPullRequest(branchName: string): Promise<BitbucketPullRequest | null> {
    if (!this.apiToken) {
      return null;
    }

    try {
      const url = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests?q=source.branch.name="${branchName}"`;
      
      const response = await cachedFetch.fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Accept': 'application/json'
        },
        cache: {
          namespace: 'bitbucket',
          ttl: 5 * 60 * 1000 // Cache for 5 minutes
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { values?: BitbucketPullRequest[] };
      const prs = data.values || [];
      
      // Return the most recent PR
      return prs.length > 0 ? prs[0] : null;
    } catch (error: any) {
      logger.debug(`Failed to get branch PR: ${error.message}`);
      return null;
    }
  }
}