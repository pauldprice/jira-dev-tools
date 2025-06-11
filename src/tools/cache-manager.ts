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
    const cache = new CacheManager({
      cacheDir: options.dir,
      namespace: options.namespace
    });

    const stats = await cache.getStats();
    
    logger.header('Cache Statistics');
    logger.info(`Total entries: ${stats.count}`);
    logger.info(`Total size: ${formatBytes(stats.size)}`);
    
    if (stats.oldestEntry) {
      logger.info(`Oldest entry: ${stats.oldestEntry.toLocaleString()}`);
    }
    if (stats.newestEntry) {
      logger.info(`Newest entry: ${stats.newestEntry.toLocaleString()}`);
    }

    // Show namespace-specific stats
    if (!options.namespace) {
      logger.info('\nNamespace breakdown:');
      const namespaces = ['global', 'fetch', 'claude', 'jira'];
      
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
    const cache = new CacheManager({
      cacheDir: options.dir,
      namespace: options.namespace
    });

    const stats = await cache.getStats();
    
    if (stats.count === 0) {
      logger.info('Cache is already empty');
      return;
    }

    if (!_cmdObj.yes) {
      const namespace = options.namespace ? `'${options.namespace}' namespace` : 'all namespaces';
      logger.warn(`This will delete ${stats.count} cache entries from ${namespace}`);
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
    logger.success('Cache cleared');
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