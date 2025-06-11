import { CacheManager, CacheOptions } from './cache-manager';
import { ClaudeClient, TicketAnalysis } from './claude-client';
import { logger } from './logger';
import type { CodeDiff } from './git-diff';
import type { LLMFriendlyOutput } from './jira-client';

export interface CachedClaudeOptions {
  cache?: {
    ttl?: number; // Time to live in milliseconds
    enabled?: boolean; // Override global cache setting
    namespace?: string; // Cache namespace
  };
}

export type { TicketAnalysis as ClaudeAnalysis };

export class CachedClaudeClient extends ClaudeClient {
  private cache: CacheManager;
  private cacheOptions: CachedClaudeOptions['cache'];
  private debug: boolean;

  constructor(apiKey?: string, defaultModel?: string, cacheOptions: CacheOptions = {}) {
    super(apiKey || '', defaultModel);
    
    this.cache = new CacheManager({
      namespace: 'claude',
      ...cacheOptions
    });
    
    this.cacheOptions = {};
    this.debug = cacheOptions.debug || false;
  }

  /**
   * Set default cache options
   */
  setCacheOptions(options: CachedClaudeOptions['cache']) {
    this.cacheOptions = options;
  }

  /**
   * Override analyzeCodeChanges with caching
   */
  async analyzeCodeChanges(
    diff: CodeDiff, 
    jiraData?: LLMFriendlyOutput,
    options: CachedClaudeOptions = {}
  ): Promise<TicketAnalysis> {
    const cacheOpts = { ...this.cacheOptions, ...options.cache };
    
    // Generate cache key including model
    const cacheKey = this.generateCacheKey('analyzeCode', {
      diff,
      jiraData,
      model: this.model
    });

    // Check cache
    if (cacheOpts.enabled !== false) {
      const cached = await this.cache.get<TicketAnalysis>(cacheKey, cacheOpts.ttl);
      if (cached) {
        if (this.debug) logger.info('Claude cache hit: analyzeCodeChanges');
        return cached;
      }
    }

    // Make actual API call
    const result = await super.analyzeCodeChanges(diff, jiraData);

    // Cache result
    if (cacheOpts.enabled !== false) {
      await this.cache.set(cacheKey, result, {
        method: 'analyzeCodeChanges',
        model: this.model,
        timestamp: new Date().toISOString()
      });
    }

    return result;
  }

  /**
   * Override generateTicketSummary with caching
   */
  async generateTicketSummary(
    ticketId: string,
    jiraData: any,
    codeAnalysis: TicketAnalysis,
    options: CachedClaudeOptions = {}
  ): Promise<string> {
    const cacheOpts = { ...this.cacheOptions, ...options.cache };
    
    // Generate cache key
    const cacheKey = this.generateCacheKey('ticketSummary', {
      ticketId,
      jiraData,
      codeAnalysis,
      model: this.model
    });

    // Check cache
    if (cacheOpts.enabled !== false) {
      const cached = await this.cache.get<string>(cacheKey, cacheOpts.ttl);
      if (cached) {
        if (this.debug) logger.info('Claude cache hit: generateTicketSummary');
        return cached;
      }
    }

    // Make actual API call
    const result = await super.generateTicketSummary(ticketId, jiraData, codeAnalysis);

    // Cache result
    if (cacheOpts.enabled !== false) {
      await this.cache.set(cacheKey, result, {
        method: 'generateTicketSummary',
        model: this.model,
        ticketId,
        timestamp: new Date().toISOString()
      });
    }

    return result;
  }

  /**
   * Generic method for cached API calls
   */
  async cachedCall<T>(
    method: string,
    params: any[],
    actualCall: () => Promise<T>,
    options: CachedClaudeOptions = {}
  ): Promise<T> {
    const cacheOpts = { ...this.cacheOptions, ...options.cache };
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(method, {
      params,
      model: this.model
    });

    // Check cache
    if (cacheOpts.enabled !== false) {
      const cached = await this.cache.get<T>(cacheKey, cacheOpts.ttl);
      if (cached) {
        if (this.debug) logger.info(`Claude cache hit: ${method}`);
        return cached;
      }
    }

    // Make actual API call
    const result = await actualCall();

    // Cache result
    if (cacheOpts.enabled !== false) {
      await this.cache.set(cacheKey, result, {
        method,
        model: this.model,
        timestamp: new Date().toISOString()
      });
    }

    return result;
  }

  /**
   * Generate cache key for Claude API calls
   */
  private generateCacheKey(method: string, params: any): string {
    return CacheManager.generateHash(
      'claude',
      method,
      this.model,
      params
    );
  }

  /**
   * Clear Claude cache
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

/**
 * Factory function to create cached Claude client
 */
export function createCachedClaudeClient(
  apiKey?: string, 
  defaultModel?: string,
  cacheOptions?: CacheOptions
): CachedClaudeClient | null {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return null;
  }
  
  return new CachedClaudeClient(key, defaultModel, cacheOptions);
}