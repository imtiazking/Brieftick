#!/usr/bin/env node
/**
 * Hosted corpus snapshot + html_article_v2 extraction tick (staging).
 * Auth: CRON_SECRET or apps/platform/.vercel/.cron-secret-session
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { OFFICIAL_STAGING_ORIGIN } from './staging-release-hosts.mjs';

const base = (process.env.FORGENIQ_CORPUS_BASE || OFFICIAL_STAGING_ORIGIN).replace(/\/$/, '');
const secretFile = join(process.cwd(), '.vercel', '.cron-secret-session');
const secret =
  process.env.CRON_SECRET?.trim() ||
  (existsSync(secretFile) ? readFileSync(secretFile, 'utf8').trim() : '');
if (!secret) {
  console.error(JSON.stringify({ ok: false, error: 'CRON_SECRET missing' }));
  process.exit(2);
}

const dryRun = process.argv.includes('--dry-run');
const url = `${base}/api/internal/ri-ingestion/corpus-snapshot-tick${dryRun ? '?dryRun=1' : ''}`;
const res = await fetch(url, {
  method: dryRun ? 'GET' : 'POST',
  headers: { Authorization: `Bearer ${secret}` },
});
const body = await res.json().catch(() => ({}));
console.log(JSON.stringify({ ok: res.ok && body.ok !== false, status: res.status, base: new URL(base).hostname, ...body }, null, 2));
if (!res.ok || body.ok === false) process.exit(1);