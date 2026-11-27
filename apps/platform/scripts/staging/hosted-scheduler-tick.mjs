#!/usr/bin/env node
/**
 * Hosted scheduler POST tick. Requires CRON_SECRET (or .vercel/.cron-secret-session).
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
  console.error(JSON.stringify({ ok: false, error: 'CRON_SECRET missing' }));
  process.exit(2);
}

const dryRun = process.argv.includes('--dry-run');
const url = `${base}/api/internal/ri-ingestion/scheduler-tick${dryRun ? '?dryRun=1' : ''}`;
const res = await fetch(url, {
  method: dryRun ? 'GET' : 'POST',
  headers: { Authorization: `Bearer ${secret}` },
});
const body = await res.json().catch(() => ({}));
console.log(JSON.stringify({ ok: res.ok && body.ok !== false, status: res.status, base: new URL(base).hostname, ...body }, null, 2));
if (!res.ok || body.ok === false) process.exit(1);