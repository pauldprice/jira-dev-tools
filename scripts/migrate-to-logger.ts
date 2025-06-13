#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const LOGGER_IMPORT = "import { logger } from './utils/enhanced-logger';";

const replacements = [
  { from: /console\.log\(/g, to: 'logger.info(' },
  { from: /console\.error\(/g, to: 'logger.error(' },
  { from: /console\.warn\(/g, to: 'logger.warn(' },
  { from: /console\.info\(/g, to: 'logger.info(' },
  { from: /console\.debug\(/g, to: 'logger.debug(' },
];

async function migrateFile(filePath: string): Promise<boolean> {
  const content = fs.readFileSync(filePath, 'utf-8');
  let modified = content;
  let hasConsoleUsage = false;

  // Check if file uses console
  replacements.forEach(({ from }) => {
    if (from.test(content)) {
      hasConsoleUsage = true;
    }
  });

  if (!hasConsoleUsage) {
    return false;
  }

  // Apply replacements
  replacements.forEach(({ from, to }) => {
    modified = modified.replace(from, to);
  });

  // Add logger import if not present
  if (!modified.includes("from './utils/enhanced-logger'") && 
      !modified.includes('from "../utils/enhanced-logger"') &&
      !modified.includes('from "../../utils/enhanced-logger"')) {
    
    // Find the right relative path
    const fileDir = path.dirname(filePath);
    const utilsPath = path.join(__dirname, '../src/utils');
    const relativePath = path.relative(fileDir, utilsPath).replace(/\\/g, '/');
    const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
    const loggerImport = `import { logger } from '${importPath}/enhanced-logger';`;
    
    // Add import after other imports
    const importMatch = modified.match(/^(import[\s\S]*?)\n\n/m);
    if (importMatch) {
      modified = modified.replace(importMatch[0], importMatch[1] + '\n' + loggerImport + '\n\n');
    } else {
      modified = loggerImport + '\n\n' + modified;
    }
  }

  fs.writeFileSync(filePath, modified);
  return true;
}

async function main() {
  console.log('🔄 Migrating console.* calls to logger...\n');

  // Find all TypeScript files
  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/enhanced-logger.ts',
      '**/logger.ts',
    ],
  });

  let migratedCount = 0;

  for (const file of files) {
    const migrated = await migrateFile(file);
    if (migrated) {
      console.log(`✅ Migrated: ${file}`);
      migratedCount++;
    }
  }

  console.log(`\n✨ Migration complete! Modified ${migratedCount} files.`);
  
  if (migratedCount > 0) {
    console.log('\n📝 Next steps:');
    console.log('1. Review the changes');
    console.log('2. Update test files to use LoggerTestUtils');
    console.log('3. Add ESLint rule to ban direct console usage');
  }
}

main().catch(console.error);