#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const idx = process.argv[2];
if (!/^\d{2}$/.test(idx ?? '')) {
  console.error('Usage: read-batch-sql.mjs <00-06>');
  process.exit(1);
}
const __dir = dirname(fileURLToPath(import.meta.url));
const path = join(__dir, '.catalogue-batches', `batch-${idx}.sql`);
process.stdout.write(readFileSync(path, 'utf8'));
