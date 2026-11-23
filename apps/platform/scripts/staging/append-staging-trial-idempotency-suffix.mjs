#!/usr/bin/env node
/** @deprecated Use merge-staging-trial-suffixes.mjs */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const suffix = process.argv[2]?.trim();
if (!suffix) {
  console.error(JSON.stringify({ ok: false, code: 'missing_suffix' }));
  process.exit(2);
}
const script = join(dirname(fileURLToPath(import.meta.url)), 'merge-staging-trial-suffixes.mjs');
const r = spawnSync(process.execPath, [script, suffix], { stdio: 'inherit' });
process.exit(r.status ?? 1);