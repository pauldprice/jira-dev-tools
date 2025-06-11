/**
 * Utility for processing items in parallel with rate limiting
 */

export interface ParallelProcessorOptions {
  maxConcurrency?: number;
  delayBetweenBatches?: number;
  onProgress?: (completed: number, total: number) => void;
}

export class ParallelProcessor {
  private maxConcurrency: number;
  private delayBetweenBatches: number;
  private onProgress?: (completed: number, total: number) => void;
  
  constructor(options: ParallelProcessorOptions = {}) {
    this.maxConcurrency = options.maxConcurrency || 3;
    this.delayBetweenBatches = options.delayBetweenBatches || 100;
    this.onProgress = options.onProgress;
  }
  
  /**
   * Process items in parallel batches
   */
  async processInBatches<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>
  ): Promise<(R | Error)[]> {
    const results: (R | Error)[] = [];
    let completed = 0;
    
    // Process items in batches
    for (let i = 0; i < items.length; i += this.maxConcurrency) {
      const batch = items.slice(i, i + this.maxConcurrency);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(item => processor(item))
      );
      
      // Collect results
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(new Error(result.reason?.message || 'Processing failed'));
        }
        completed++;
        
        if (this.onProgress) {
          this.onProgress(completed, items.length);
        }
      });
      
      // Delay between batches to avoid rate limiting
      if (i + this.maxConcurrency < items.length && this.delayBetweenBatches > 0) {
        await this.delay(this.delayBetweenBatches);
      }
    }
    
    return results;
  }
  
  /**
   * Process items with a sliding window approach for better throughput
   */
  async processWithSlidingWindow<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>
  ): Promise<Map<number, R | Error>> {
    const results = new Map<number, R | Error>();
    const inProgress = new Map<number, Promise<void>>();
    let nextIndex = 0;
    let completed = 0;
    
    // Process items with sliding window
    while (nextIndex < items.length || inProgress.size > 0) {
      // Start new tasks up to max concurrency
      while (inProgress.size < this.maxConcurrency && nextIndex < items.length) {
        const currentIndex = nextIndex;
        const item = items[currentIndex];
        nextIndex++;
        
        const task = processor(item, currentIndex)
          .then(result => {
            results.set(currentIndex, result);
          })
          .catch(error => {
            results.set(currentIndex, error);
          })
          .finally(() => {
            inProgress.delete(currentIndex);
            completed++;
            
            if (this.onProgress) {
              this.onProgress(completed, items.length);
            }
          });
        
        inProgress.set(currentIndex, task);
      }
      
      // Wait for at least one task to complete
      if (inProgress.size > 0) {
        await Promise.race(inProgress.values());
      }
    }
    
    return results;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}