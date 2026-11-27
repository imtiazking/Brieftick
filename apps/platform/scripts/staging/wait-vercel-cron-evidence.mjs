#!/usr/bin/env node
/**
 * Poll staging for VERCEL_CRON scheduler invocations (not manual ticks).
 * Requires SUPABASE service access via execute_sql or STAGING_DATABASE_URL.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenvConfig({ path: join(platformRoot, '.env.local'), override: false });

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const OUT = join(repoRoot, 'docs', 'uat', 'evidence', `vercel-cron-${new Date().toISOString().slice(0, 10)}`);
const deadline = Date.now() + Number(process.env.FORGENIQ_CRON_WAIT_MS || 130 * 60_000);
const intervalMs = Number(process.env.FORGENIQ_CRON_POLL_MS || 120_000);
const since = process.env.FORGENIQ_CRON_CHECK_SINCE || '2026-11-27T00:00:00Z';

const dbUrl =
  process.env.STAGING_DATABASE_URL?.trim() ||
  process.env.SUPABASE_DB_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!dbUrl && !(supabaseUrl && serviceKey)) {
  console.error(
    JSON.stringify({
      ok: false,
      code: 'AUTH_BLOCKED',
      error: 'STAGING_DATABASE_URL or Supabase service role required',
    }),
  );
  process.exit(2);
}

const SQL = `select metadata->>'invocationKind' as kind, count(*)::int as n, max(created_at) as last_at
 from ingestion_operational_events
 where event_type in ('HOSTED_SCHEDULER_INVOCATION','HOSTED_SCHEDULER_COMPLETED')
   and created_at >= $1::timestamptz
 group by 1 order by 1`;

async function snapshotPg() {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const { rows } = await client.query(SQL, [since]);
    return rows;
  } finally {
    await client.end();
  }
}

async function snapshotSupabase() {
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb
    .from('ingestion_operational_events')
    .select('created_at, metadata')
    .in('event_type', ['HOSTED_SCHEDULER_COMPLETED', 'HOSTED_SCHEDULER_INVOCATION'])
    .gte('created_at', since)
    .limit(2000);
  if (error) throw new Error(error.message);
  const buckets = new Map();
  for (const row of data || []) {
    const kind = row.metadata?.invocationKind || 'UNKNOWN';
    const prev = buckets.get(kind) || { kind, n: 0, last_at: null };
    prev.n += 1;
    if (!prev.last_at || row.created_at > prev.last_at) prev.last_at = row.created_at;
    buckets.set(kind, prev);
  }
  return [...buckets.values()].sort((a, b) => String(a.kind).localeCompare(String(b.kind)));
}

async function snapshot() {
  if (dbUrl) return snapshotPg();
  return snapshotSupabase();
}

mkdirSync(OUT, { recursive: true });
const log = [];

while (Date.now() < deadline) {
  const rows = await snapshot();
  const cron = rows.find((r) => r.kind === 'VERCEL_CRON')?.n ?? 0;
  const manual = rows.find((r) => r.kind === 'MANUAL_HOSTED')?.n ?? 0;
  const entry = { at: new Date().toISOString(), cron, manual, rows };
  log.push(entry);
  writeFileSync(join(OUT, 'POLL.jsonl'), `${log.map((l) => JSON.stringify(l)).join('\n')}\n`);
  console.log(JSON.stringify(entry));
  if (cron > 0) {
    writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ ok: true, ...entry, log }, null, 2));
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, intervalMs));
}

writeFileSync(
  join(OUT, 'RESULT.json'),
  JSON.stringify({ ok: false, reason: 'no_vercel_cron_before_deadline', log, since }, null, 2),
);
process.exit(1);