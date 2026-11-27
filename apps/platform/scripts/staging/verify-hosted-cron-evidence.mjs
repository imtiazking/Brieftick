#!/usr/bin/env node
/**
 * Read-only check: VERCEL_CRON vs MANUAL_HOSTED scheduler invocations (staging DB URL required).
 */
import pg from 'pg';

const url = process.env.STAGING_DATABASE_URL?.trim();
if (!url) {
  console.log(JSON.stringify({ ok: false, code: 'AUTH_BLOCKED', error: 'STAGING_DATABASE_URL missing' }));
  process.exit(2);
}
const since = process.env.FORGENIQ_CRON_CHECK_SINCE || '2026-11-27T00:00:00Z';
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query(
    `select metadata->>'invocationKind' as kind, count(*)::int as n, max(created_at) as last_at
     from ingestion_operational_events
     where event_type = 'HOSTED_SCHEDULER_INVOCATION' and created_at >= $1::timestamptz
     group by 1 order by 1`,
    [since],
  );
  const cron = rows.find((r) => r.kind === 'VERCEL_CRON')?.n ?? 0;
  const manual = rows.find((r) => r.kind === 'MANUAL_HOSTED')?.n ?? 0;
  console.log(JSON.stringify({ ok: true, since, cron, manual, rows }, null, 2));
  if (cron === 0) process.exit(2);
} finally {
  await client.end();
}