import { CacheManager, CacheOptions } from './cache-manager';

export interface CachedFetchOptions extends RequestInit {
  cache?: {
    ttl?: number; // Time to live in milliseconds
    key?: string; // Custom cache key
    namespace?: string; // Cache namespace
    enabled?: boolean; // Override global cache setting
    includeHeaders?: string[]; // Headers to include in cache key
    excludeHeaders?: string[]; // Headers to exclude from cache key
  };
}

export class CachedFetch {
  private cache: CacheManager;

  constructor(options: CacheOptions = {}) {
    this.cache = new CacheManager({
      namespace: 'fetch',
      ...options
    });
  }

  /**
   * Fetch with caching support
   */
  async fetch(url: string, options: CachedFetchOptions = {}): Promise<Response> {
    const { cache: cacheOptions = {}, ...fetchOptions } = options;
    
    // Generate cache key
    const cacheKey = cacheOptions.key || this.generateCacheKey(url, fetchOptions, cacheOptions);
    
    // Check cache if enabled
    if (cacheOptions.enabled !== false) {
      const cached = await this.cache.get<CachedResponse>(cacheKey, cacheOptions.ttl);
      if (cached) {
        return this.createResponse(cached);
      }
    }

    // Make actual fetch request
    const response = await fetch(url, fetchOptions);
    
    // Cache successful responses
    if (cacheOptions.enabled !== false && response.ok) {
      const cachedData = await this.serializeResponse(response.clone());
      await this.cache.set(cacheKey, cachedData, {
        url,
        status: response.status,
        method: fetchOptions.method || 'GET'
      });
    }

    return response;
  }

  /**
   * Generate a cache key from URL and options
   */
  private generateCacheKey(
    url: string, 
    options: RequestInit, 
    cacheOptions: CachedFetchOptions['cache'] = {}
  ): string {
    const keyParts: any[] = [url];

    // Add method
    keyParts.push(options.method || 'GET');

    // Add body if present
    if (options.body) {
      if (typeof options.body === 'string') {
        keyParts.push(options.body);
      } else if (options.body instanceof FormData) {
        // FormData can't be easily serialized, use a placeholder
        keyParts.push('FormData');
      } else {
        keyParts.push(JSON.stringify(options.body));
      }
    }

    // Add relevant headers
    if (options.headers) {
      const headers = this.normalizeHeaders(options.headers);
      const relevantHeaders: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(headers)) {
        const lowerKey = key.toLowerCase();
        
        // Skip excluded headers
        if (cacheOptions.excludeHeaders?.includes(lowerKey)) continue;
        
        // Include only specified headers if includeHeaders is set
        if (cacheOptions.includeHeaders && !cacheOptions.includeHeaders.includes(lowerKey)) continue;
        
        // Always include content-type and authorization by default
        if (!cacheOptions.includeHeaders && 
            !['content-type', 'authorization', 'x-api-key'].includes(lowerKey)) continue;
        
        relevantHeaders[key] = value;
      }
      
      if (Object.keys(relevantHeaders).length > 0) {
        keyParts.push(relevantHeaders);
      }
    }

    return CacheManager.generateHash(...keyParts);
  }

  /**
   * Normalize headers to a plain object
   */
  private normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
    const normalized: Record<string, string> = {};
    
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        normalized[key] = value;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => {
        normalized[key] = value;
      });
    } else {
      Object.assign(normalized, headers);
    }
    
    return normalized;
  }

  /**
   * Serialize response for caching
   */
  private async serializeResponse(response: Response): Promise<CachedResponse> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      body: await response.text(),
      status: response.status,
      statusText: response.statusText,
      headers
    };
  }

  /**
   * Create Response object from cached data
   */
  private createResponse(cached: CachedResponse): Response {
    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: cached.headers
    });
  }

  /**
   * Clear fetch cache
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

interface CachedResponse {
  body: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/**
 * Global cached fetch instance
 */
export const cachedFetch = new CachedFetch();

/**
 * Convenience function for cached fetch
 */
export async function fetchWithCache(url: string, options?: CachedFetchOptions): Promise<Response> {
  return cachedFetch.fetch(url, options);
}