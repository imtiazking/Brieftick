#!/usr/bin/env node
/**
 * Hosted scheduler dry-run (GET ?dryRun=1). Requires CRON_SECRET in env (e.g. vercel env run).
 * Does not print secrets. Optional FORGENIQ_SCHEDULER_BASE (default official staging origin).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { OFFICIAL_STAGING_ORIGIN } from './staging-release-hosts.mjs';

const base = (process.env.FORGENIQ_SCHEDULER_BASE || OFFICIAL_STAGING_ORIGIN).replace(/\/$/, '');
const secretFile = join(process.cwd(), '.vercel', '.cron-secret-session');
const secret =
  process.env.CRON_SECRET?.trim() ||
  (existsSync(secretFile) ? readFileSync(secretFile, 'utf8').trim() : '');
if (!secret) {
  console.error(JSON.stringify({ ok: false, error: 'CRON_SECRET missing from environment' }));
  process.exit(2);
}

const url = `${base}/api/internal/ri-ingestion/scheduler-tick?dryRun=1`;
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
});
const body = await res.json().catch(() => ({}));
const summary = {
  ok: res.ok && body.ok !== false,
  status: res.status,
  base: new URL(base).hostname,
  schedulerEnabled: body.schedulerEnabled,
  dueCount: Array.isArray(body.due) ? body.due.length : null,
  wouldRun: Array.isArray(body.due) ? body.due.filter((d) => d.wouldRun).length : null,
  staleRunningRuns: body.staleRunningRuns,
  error: body.error,
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);