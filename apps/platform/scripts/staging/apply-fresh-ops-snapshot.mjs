#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(scriptDir, '..', '..');
const repoRoot = join(platformRoot, '..', '..');
const agentTools =
  process.argv[2] ||
  'C:/Users/imtia/.cursor/projects/c-Users-imtia-OneDrive-Desktop-Brieftick/agent-tools/5b794b22-cd70-4167-85b0-997cf9dca5c2.txt';
const raw = readFileSync(agentTools, 'utf8');
let payload = raw;
try {
  payload = JSON.parse(raw).result ?? raw;
} catch {
  /* plain text export */
}
const start = payload.indexOf('[{');
const end = payload.lastIndexOf('}]');
if (start < 0 || end < start) {
  console.error(JSON.stringify({ ok: false, error: 'snapshot_parse_failed' }));
  process.exit(1);
}
const fresh = JSON.parse(payload.slice(start, end + 2));
const freshPath = join(repoRoot, 'docs', 'uat', 'evidence', 'production-readiness', 'raw', 'staging-ops-fresh-2026-11-27.json');
writeFileSync(freshPath, JSON.stringify(fresh, null, 2));
const patch = spawnSync(
  process.execPath,
  ['./scripts/staging/patch-staging-source-ops-freshness.mjs', '--fresh', freshPath],
  { cwd: platformRoot, encoding: 'utf8' },
);
const build = spawnSync(
  process.execPath,
  ['./scripts/production-readiness/build-connector-status.mjs', '--now', new Date().toISOString()],
  { cwd: platformRoot, encoding: 'utf8' },
);
console.log(patch.stdout, patch.stderr);
console.log(build.stdout?.split('\n').slice(-15).join('\n'));
process.exit((patch.status ?? 1) || (build.status ?? 1));