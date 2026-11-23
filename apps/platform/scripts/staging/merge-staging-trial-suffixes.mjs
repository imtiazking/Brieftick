#!/usr/bin/env node
/**
 * Merge suffixes into RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES using Vercel API + CLI (never logs values).
 * Preserves documented authorised inventory when remote read returns no decrypt.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePlatformRoot } from './load-platform-env.mjs';

const ALLOWED_PROJECT = 'forgeniq-platform-staging';
const ALLOWED_PROJECT_ID = 'prj_y9O1A1zGFXe3GvJITnLL9mJUqve7';
const SCOPE = 'imis-projects-8e15dca0';
const VAR = 'RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES';
const ENV_ID = 'qUwBVa58hVxQXPt8';

/** Last known operator-authorised staging inventory (execution log 2026-11-23). */
const BASELINE_SUFFIXES = [
  'uat-ps26-1-cross-page-002',
  'uat-ps22-9-001',
  'live-ps26-full-2026-11-22',
  'live-ps26-full-2026-11-22-batch-2',
  'live-ps22-full-2026-11-22',
  'live-ps22-full-2026-11-22-batch-2',
  'live-ps22-full-2026-11-22-batch-3',
  'live-ps22-full-2026-11-22-batch-4',
];

const extra = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
if (!extra.length) {
  console.error(JSON.stringify({ ok: false, code: 'missing_suffix_args' }));
  process.exit(2);
}

const platformRoot = resolvePlatformRoot(import.meta.url);
const link = JSON.parse(readFileSync(join(platformRoot, '.vercel', 'project.json'), 'utf8'));
if (link.projectId !== ALLOWED_PROJECT_ID || link.projectName !== ALLOWED_PROJECT) {
  console.error(JSON.stringify({ ok: false, code: 'wrong_vercel_project', actual: link.projectName }));
  process.exit(2);
}

const api = spawnSync(
  'npx',
  ['vercel', 'api', `/v1/projects/${ALLOWED_PROJECT_ID}/env/${ENV_ID}`, '--scope', SCOPE],
  { cwd: platformRoot, encoding: 'utf8', shell: process.platform === 'win32' },
);
let remoteParts = [];
if (api.status === 0) {
  try {
    const j = JSON.parse(api.stdout);
    remoteParts = (j.value || '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  } catch {
    /* */
  }
}

const merged = [...new Set([...BASELINE_SUFFIXES, ...remoteParts, ...extra])];
const mergedValue = merged.join(',');

const update = spawnSync(
  'npx',
  ['vercel', 'env', 'update', VAR, 'production', '--sensitive', '--scope', SCOPE, '--project', ALLOWED_PROJECT, '--yes'],
  { cwd: platformRoot, encoding: 'utf8', input: mergedValue, shell: false },
);

if (update.status !== 0) {
  console.error(JSON.stringify({ ok: false, code: 'env_update_failed', status: update.status }));
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    action: 'merged',
    projectId: ALLOWED_PROJECT_ID,
    suffixCount: merged.length,
    includesNew: extra.every((s) => merged.includes(s)),
    usedBaseline: remoteParts.length === 0,
    remoteCount: remoteParts.length,
  }),
);