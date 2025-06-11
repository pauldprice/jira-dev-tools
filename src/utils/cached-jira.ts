import { fetchJiraTicket, JiraCredentials } from './jira-client';
import { CacheManager, CacheOptions } from './cache-manager';
import { logger } from './logger';

export interface CachedJiraOptions {
  cache?: {
    ttl?: number; // Time to live in milliseconds (default: 1 hour)
    enabled?: boolean; // Override global cache setting
    namespace?: string; // Cache namespace
  };
}

class CachedJiraClient {
  private cache: CacheManager;
  private defaultTTL: number;

  constructor(cacheOptions: CacheOptions = {}) {
    this.cache = new CacheManager({
      namespace: 'jira',
      ...cacheOptions
    });
    
    // Default TTL: 1 hour for Jira data
    this.defaultTTL = 60 * 60 * 1000;
  }

  /**
   * Fetch Jira ticket with caching
   */
  async fetchTicket(
    ticketId: string,
    credentials: JiraCredentials,
    options: any = {},
    cacheOptions: CachedJiraOptions['cache'] = {}
  ): Promise<any> {
    // Generate cache key
    const cacheKey = this.generateTicketCacheKey(ticketId, credentials, options);
    
    // Check cache
    if (cacheOptions.enabled !== false) {
      const cached = await this.cache.get(cacheKey, cacheOptions.ttl || this.defaultTTL);
      if (cached) {
        logger.debug(`Jira cache hit: ${ticketId}`);
        return cached;
      }
    }

    // Fetch from Jira
    const result = await fetchJiraTicket(ticketId, credentials, options);

    // Cache result
    if (cacheOptions.enabled !== false && result) {
      await this.cache.set(cacheKey, result, {
        ticketId,
        fetchTime: new Date().toISOString(),
        options
      });
    }

    return result;
  }


  /**
   * Generate cache key for ticket requests
   */
  private generateTicketCacheKey(
    ticketId: string,
    credentials: JiraCredentials,
    options: any
  ): string {
    // Include domain in key but not credentials
    return CacheManager.generateHash(
      'ticket',
      ticketId,
      credentials.JIRA_BASE_URL,
      options
    );
  }

  /**
   * Clear Jira cache
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return this.cache.getStats();
  }
}

// Global cached Jira client
export const cachedJiraClient = new CachedJiraClient();

/**
 * Convenience function for cached Jira ticket fetch
 */
export async function fetchJiraTicketCached(
  ticketId: string,
  credentials: JiraCredentials,
  options: any = {},
  cacheOptions?: CachedJiraOptions['cache']
): Promise<any> {
  return cachedJiraClient.fetchTicket(ticketId, credentials, options, cacheOptions);
}

