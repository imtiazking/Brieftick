#!/usr/bin/env node
/**
 * Split generated catalogue SQL into batches for MCP / Management API apply.
 * Idempotent upserts from sync-reference-catalogue.mjs output.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..', '..');
const seedPath = join(platformRoot, 'supabase', 'seed', 'reference-catalogue.generated.sql');
const outDir = join(__dir, '.catalogue-batches');
const batchSize = Number(process.env.CATALOGUE_BATCH_SIZE || 11);

if (!existsSync(seedPath)) {
  console.error('Run npm run sync:reference-catalogue first.');
  process.exit(1);
}

const seed = readFileSync(seedPath, 'utf8');
let inner = seed.replace(/^--[^\n]*\n/gm, '');
inner = inner.replace(/^begin;\s*/i, '').replace(/\s*commit;\s*$/i, '').trim();
const statements = inner
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

mkdirSync(outDir, { recursive: true });
for (let i = 0; i < statements.length; i += batchSize) {
  const chunk = statements.slice(i, i + batchSize).map((s) => (s.endsWith(';') ? s : `${s};`)).join('\n');
  const name = `batch-${String(Math.floor(i / batchSize)).padStart(2, '0')}.sql`;
  writeFileSync(join(outDir, name), chunk);
}

console.log(`Wrote ${Math.ceil(statements.length / batchSize)} batches (${statements.length} statements) to ${outDir}`);
