#!/usr/bin/env node
/**
 * Patches last_success_at / health_status / publications on staging-source-operations.json
 * from a Supabase SQL export (minimal fields). Run after hosted scheduler ticks.
 *
 *   node scripts/staging/patch-staging-source-ops-freshness.mjs --fresh path/to/fresh.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const stagingPath = join(repoRoot, 'docs', 'uat', 'evidence', 'production-readiness', 'raw', 'staging-source-operations.json');
const freshArg = process.argv.indexOf('--fresh');
const freshPath = freshArg >= 0 ? process.argv[freshArg + 1] : null;
if (!freshPath) {
  console.error('usage: patch-staging-source-ops-freshness.mjs --fresh <json-array>');
  process.exit(2);
}

const fresh = JSON.parse(readFileSync(freshPath, 'utf8'));
const byKey = new Map(fresh.map((r) => [r.source_key, r]));
const rows = JSON.parse(readFileSync(stagingPath, 'utf8'));
let patched = 0;
for (const row of rows) {
  const key = row.source_key;
  const f = byKey.get(key);
  if (!f) continue;
  if (f.last_success_at != null) row.last_success_at = f.last_success_at;
  if (f.health_status != null) row.health_status = f.health_status === 'FAILING' ? 'FAILING' : 'HEALTHY';
  if (f.publications != null) row.publications = f.publications;
  if (f.consecutive_failures != null) row.consecutive_failures = f.consecutive_failures;
  patched += 1;
}
writeFileSync(stagingPath, JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ ok: true, patched, total: rows.length, stagingPath }));