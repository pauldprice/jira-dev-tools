#!/usr/bin/env node
import { Command } from 'commander';
import { CacheManager } from '../utils/cache-manager';
import { logger } from '../utils';
import * as path from 'path';

const program = new Command();

program
  .name('cache')
  .description('Manage toolbox cache')
  .option('-d, --dir <dir>', 'cache directory', '.toolbox_cache')
  .option('-n, --namespace <namespace>', 'cache namespace to manage');

program
  .command('stats')
  .description('Show cache statistics')
  .action(async (_cmdObj, cmd) => {
    const options = cmd.parent.opts();
    
    logger.header('Cache Statistics');
    
    if (options.namespace) {
      // Show stats for specific namespace
      const cache = new CacheManager({
        cacheDir: options.dir,
        namespace: options.namespace
      });
      const stats = await cache.getStats();
      
      logger.info(`Namespace: ${options.namespace}`);
      logger.info(`Total entries: ${stats.count}`);
      logger.info(`Total size: ${formatBytes(stats.size)}`);
      
      if (stats.oldestEntry) {
        logger.info(`Oldest entry: ${stats.oldestEntry.toLocaleString()}`);
      }
      if (stats.newestEntry) {
        logger.info(`Newest entry: ${stats.newestEntry.toLocaleString()}`);
      }
    } else {
      // Calculate total stats across all namespaces
      const namespaces = ['global', 'fetch', 'claude', 'jira', 'bitbucket'];
      let totalCount = 0;
      let totalSize = 0;
      let oldestDate: Date | undefined;
      let newestDate: Date | undefined;
      
      for (const ns of namespaces) {
        const nsCache = new CacheManager({
          cacheDir: options.dir,
          namespace: ns
        });
        const nsStats = await nsCache.getStats();
        totalCount += nsStats.count;
        totalSize += nsStats.size;
        
        if (nsStats.oldestEntry && (!oldestDate || nsStats.oldestEntry < oldestDate)) {
          oldestDate = nsStats.oldestEntry;
        }
        if (nsStats.newestEntry && (!newestDate || nsStats.newestEntry > newestDate)) {
          newestDate = nsStats.newestEntry;
        }
      }
      
      logger.info(`Total entries: ${totalCount}`);
      logger.info(`Total size: ${formatBytes(totalSize)}`);
      
      if (oldestDate) {
        logger.info(`Oldest entry: ${oldestDate.toLocaleString()}`);
      }
      if (newestDate) {
        logger.info(`Newest entry: ${newestDate.toLocaleString()}`);
      }

      // Show namespace-specific stats
      logger.info('\nNamespace breakdown:');
      
      for (const ns of namespaces) {
        const nsCache = new CacheManager({
          cacheDir: options.dir,
          namespace: ns
        });
        const nsStats = await nsCache.getStats();
        if (nsStats.count > 0) {
          logger.info(`  ${ns}: ${nsStats.count} entries (${formatBytes(nsStats.size)})`);
        }
      }
    }
  });

program
  .command('clear')
  .description('Clear cache')
  .option('-y, --yes', 'skip confirmation')
  .action(async (_cmdObj) => {
    const options = program.opts();
    
    if (options.namespace) {
      // Clear specific namespace
      const cache = new CacheManager({
        cacheDir: options.dir,
        namespace: options.namespace
      });

      const stats = await cache.getStats();
      
      if (stats.count === 0) {
        logger.info(`Cache for '${options.namespace}' namespace is already empty`);
        return;
      }

      if (!_cmdObj.yes) {
        logger.warn(`This will delete ${stats.count} cache entries from '${options.namespace}' namespace`);
        logger.warn(`Total size: ${formatBytes(stats.size)}`);
        
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>(resolve => {
          rl.question('Continue? (y/N) ', resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y') {
          logger.info('Cancelled');
          return;
        }
      }

      await cache.clear();
      logger.success(`Cache cleared for '${options.namespace}' namespace`);
    } else {
      // Clear all namespaces
      const namespaces = ['global', 'fetch', 'claude', 'jira', 'bitbucket'];
      let totalCount = 0;
      let totalSize = 0;
      
      // First, get total stats
      for (const ns of namespaces) {
        const nsCache = new CacheManager({
          cacheDir: options.dir,
          namespace: ns
        });
        const nsStats = await nsCache.getStats();
        totalCount += nsStats.count;
        totalSize += nsStats.size;
      }
      
      if (totalCount === 0) {
        logger.info('Cache is already empty');
        return;
      }

      if (!_cmdObj.yes) {
        logger.warn(`This will delete ${totalCount} cache entries from all namespaces`);
        logger.warn(`Total size: ${formatBytes(totalSize)}`);
        
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>(resolve => {
          rl.question('Continue? (y/N) ', resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'y') {
          logger.info('Cancelled');
          return;
        }
      }

      // Clear each namespace
      let clearedCount = 0;
      for (const ns of namespaces) {
        const nsCache = new CacheManager({
          cacheDir: options.dir,
          namespace: ns
        });
        const nsStats = await nsCache.getStats();
        if (nsStats.count > 0) {
          await nsCache.clear();
          clearedCount++;
          logger.info(`Cleared ${ns} namespace (${nsStats.count} entries)`);
        }
      }
      
      logger.success(`Cache cleared - removed ${totalCount} entries from ${clearedCount} namespaces`);
    }
  });

program
  .command('list')
  .description('List cache entries')
  .option('-l, --limit <n>', 'limit number of entries', '20')
  .action(async (_cmdObj) => {
    const options = program.opts();
    const cacheDir = options.namespace 
      ? path.join(options.dir, options.namespace)
      : options.dir;

    try {
      // This is a simplified implementation
      // In production, you'd want to read the cache entries properly
      logger.header('Cache Entries');
      logger.info(`Directory: ${cacheDir}`);
      logger.info('(Detailed listing not implemented yet)');
    } catch (error: any) {
      logger.error(`Failed to list cache: ${error.message}`);
    }
  });

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

program.parse();