#!/usr/bin/env node
/**
 * Applies or restores the live-AI pilot configuration on the staging Vercel project (production scope of
 * forgeniq-platform-staging). Values are written in place with `vercel env update`; nothing is removed.
 *
 *   node scripts/staging/pilot-env.mjs activate [--dry-run]
 *   node scripts/staging/pilot-env.mjs restore  [--dry-run]
 *   node scripts/staging/pilot-env.mjs plan     (prints both value sets, no changes)
 *
 * Changes only take effect on the next deployment. The script never prints a secret. The pilot values contain no
 * credentials (flags, limits, a model id and a run reference), so they are printed.
 */
import { spawnSync } from 'node:child_process';

const SCOPE = 'imis-projects-8e15dca0';
const PROJECT = 'forgeniq-platform-staging';
/** Override with FORGENIQ_PILOT_RUN_REFERENCE / FORGENIQ_PILOT_CLOSED_RUN_REFERENCE for a specific authorised window. */
export const PILOT_RUN_REFERENCE =
  process.env.FORGENIQ_PILOT_RUN_REFERENCE?.trim() || 'pilot-fca-eval-002-conc-7-20-1r';
const CLOSED_RUN_REFERENCE =
  process.env.FORGENIQ_PILOT_CLOSED_RUN_REFERENCE?.trim() || `closed-${PILOT_RUN_REFERENCE}-consumed`;

export const ACTIVATE = {
  RI_AI_EXECUTION_ENABLED: 'true',
  // RI_AI_PROVIDER_MODE is a Config variable already set to ANTHROPIC on staging; it is verified, not rewritten.
  RI_ANTHROPIC_MODEL: 'claude-sonnet-5-5',
  FORGENIQ_STAGE2_AI: 'ANTHROPIC',
  FORGENIQ_STAGE3_AI: 'ANTHROPIC',
  FORGENIQ_STAGE4_AI: 'ANTHROPIC',
  FORGENIQ_STAGE5_AI: 'ANTHROPIC',
  RI_LAB_ANTHROPIC_MAX_USD: '0.75',
  RI_LAB_ANTHROPIC_MAX_REQUESTS: '8',
  RI_LAB_SPEND_SCOPE: 'forgeniq-lab-anthropic',
  RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES: PILOT_RUN_REFERENCE,
  RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX: PILOT_RUN_REFERENCE,
};

/** Paid execution off, stages on fixtures, and no run reference left authorised. Budget limits stay at the pilot values. */
export const RESTORE = {
  RI_AI_EXECUTION_ENABLED: 'false',
  FORGENIQ_STAGE2_AI: 'FIXTURE',
  FORGENIQ_STAGE3_AI: 'FIXTURE',
  FORGENIQ_STAGE4_AI: 'FIXTURE',
  FORGENIQ_STAGE5_AI: 'FIXTURE',
  RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES: CLOSED_RUN_REFERENCE,
  RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX: CLOSED_RUN_REFERENCE,
};

function vercel(args) {
  return spawnSync('vercel', args, { encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true });
}

function exists(name) {
  const out = vercel(['env', 'ls', 'production', `--scope=${SCOPE}`, `--project=${PROJECT}`]);
  return new RegExp(`^\\s*${name}\\s`, 'm').test(out.stdout || '');
}

function apply(values, dryRun) {
  const results = [];
  for (const [name, value] of Object.entries(values)) {
    if (dryRun) {
      results.push({ name, value, action: exists(name) ? 'would_update' : 'would_add' });
      continue;
    }
    const present = exists(name);
    const args = present
      ? ['env', 'update', name, '--environment', 'production', '--value', value, '--yes', '--sensitive', `--scope=${SCOPE}`, `--project=${PROJECT}`]
      : ['env', 'add', name, 'production', '--value', value, '--yes', '--sensitive', `--scope=${SCOPE}`, `--project=${PROJECT}`];
    const out = vercel(args);
    const ok = out.status === 0;
    results.push({ name, value, action: present ? 'update' : 'add', ok, detail: ok ? undefined : String(out.stderr || out.stdout).replace(/\s+/g, ' ').slice(0, 240) });
    if (!ok) break;
  }
  return results;
}

const mode = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (mode === 'plan') {
  console.log(JSON.stringify({ activate: ACTIVATE, restore: RESTORE }, null, 2));
} else if (mode === 'activate' || mode === 'restore') {
  const results = apply(mode === 'activate' ? ACTIVATE : RESTORE, dryRun);
  console.log(JSON.stringify({ mode, dryRun, results }, null, 2));
  process.exit(results.every((r) => r.ok !== false) ? 0 : 1);
} else {
  console.error('usage: pilot-env.mjs activate|restore|plan [--dry-run]');
  process.exit(2);
}
