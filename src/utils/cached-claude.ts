import { CacheManager, CacheOptions } from './cache-manager';
import { ClaudeClient, TicketAnalysis } from './claude-client';
import { logger } from './logger';
import { config } from './config';
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
   * Override analyze method with caching
   */
  async analyze(
    prompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
      system?: string;
    } & CachedClaudeOptions = {}
  ): Promise<string> {
    const cacheOpts = { ...this.cacheOptions, ...options.cache };
    
    // Generate cache key from prompt and options
    const cacheKey = this.generateCacheKey('analyze', {
      prompt,
      model: this.model,
      temperature: options.temperature || 0.3,
      maxTokens: options.maxTokens || 2000,
      system: options.system
    });

    // Check cache
    if (cacheOpts.enabled !== false) {
      const cached = await this.cache.get<string>(cacheKey, cacheOpts.ttl);
      if (cached) {
        if (this.debug) {
          logger.info(`Claude cache hit: analyze`);
          logger.info(`Cache key: ${cacheKey.substring(0, 16)}...`);
        }
        return cached;
      }
    }

    // Make actual API call
    const result = await super.analyze(prompt, options);

    // Cache result
    if (cacheOpts.enabled !== false) {
      await this.cache.set(cacheKey, result, {
        method: 'analyze',
        model: this.model,
        timestamp: new Date().toISOString()
      });
    }

    return result;
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
    
    // Build the actual prompt that will be sent to Claude
    // This ensures cache key changes when prompt template or data changes
    const prompt = this.buildAnalysisPrompt(diff, jiraData);
    
    // Generate cache key from actual prompt content
    const cacheKey = this.generateCacheKey('analyzeCode', {
      prompt,
      model: this.model,
      temperature: 0.3, // Include API parameters that affect output
      max_tokens: 1500
    });

    // Check cache
    if (cacheOpts.enabled !== false) {
      const cached = await this.cache.get<TicketAnalysis>(cacheKey, cacheOpts.ttl);
      if (cached) {
        if (this.debug) {
          logger.info(`Claude cache hit: analyzeCodeChanges for ${diff.ticketId}`);
          logger.info(`Cache key: ${cacheKey.substring(0, 16)}...`);
        }
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
        ticketId: diff.ticketId,
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
    
    // Build the actual prompt that will be sent to Claude
    const prompt = this.buildTicketSummaryPrompt(ticketId, jiraData, codeAnalysis);
    
    // Generate cache key from actual prompt content
    const cacheKey = this.generateCacheKey('ticketSummary', {
      prompt,
      model: this.model,
      temperature: 0.3,
      max_tokens: 500
    });

    // Check cache
    if (cacheOpts.enabled !== false) {
      const cached = await this.cache.get<string>(cacheKey, cacheOpts.ttl);
      if (cached) {
        if (this.debug) logger.info(`Claude cache hit: generateTicketSummary for ${ticketId}`);
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
   * Build the ticket summary prompt
   */
  private buildTicketSummaryPrompt(
    ticketId: string,
    jiraData: any,
    codeAnalysis: TicketAnalysis
  ): string {
    return `Based on the following information, write a clear and concise summary for a release notes document:

JIRA TICKET: ${ticketId}
Title: ${jiraData.title}
Status: ${jiraData.status}
Original Description: ${jiraData.description}

CODE ANALYSIS:
${codeAnalysis.summary}

Technical Changes:
${codeAnalysis.technicalChanges.map(c => `- ${c}`).join('\n')}

Please write a 2-3 sentence summary that:
1. Clearly explains what was done (not just what the problem was)
2. Mentions the key technical approach taken
3. Is suitable for a release notes document

Do not include testing notes or risks in this summary.`;
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

  /**
   * Override generateReleasePrimaryFocus with caching
   */
  async generateReleasePrimaryFocus(
    ticketSummaries: Array<{ id: string; title: string; description?: string; category: string }>,
    options: CachedClaudeOptions = {}
  ): Promise<string> {
    const cacheOpts = { ...this.cacheOptions, ...options.cache };
    
    // Generate cache key from ticket summaries
    const cacheKey = this.generateCacheKey('releasePrimaryFocus', {
      ticketSummaries,
      model: this.model,
      temperature: 0.3,
      max_tokens: 50
    });

    // Check cache
    if (cacheOpts.enabled !== false) {
      const cached = await this.cache.get<string>(cacheKey, cacheOpts.ttl);
      if (cached) {
        if (this.debug) logger.info(`Claude cache hit: generateReleasePrimaryFocus`);
        return cached;
      }
    }

    // Make actual API call
    const result = await super.generateReleasePrimaryFocus(ticketSummaries);

    // Cache result
    if (cacheOpts.enabled !== false) {
      await this.cache.set(cacheKey, result, {
        method: 'generateReleasePrimaryFocus',
        model: this.model,
        timestamp: new Date().toISOString()
      });
    }

    return result;
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
  // Try to get API key from: 1) parameter, 2) config system (includes env vars and config files)
  const key = apiKey || config.get('ANTHROPIC_API_KEY');
  
  if (!key) {
    return null;
  }
  
  // Log where the key was loaded from (without exposing the key)
  if (apiKey) {
    logger.info('Using provided Anthropic API key');
  } else if (process.env.ANTHROPIC_API_KEY) {
    logger.info('Using Anthropic API key from environment variable');
  } else {
    logger.info('Using Anthropic API key from config file');
  }
  
  return new CachedClaudeClient(key, defaultModel, cacheOptions);
}