#!/usr/bin/env node
/**
 * Poll staging scheduler operational events after 2026-11-28T04:00:00Z VERCEL_CRON window.
 * Read-only: dry-run + hosted DB queries when STAGING_DATABASE_URL set.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const outPath = join(
  repoRoot,
  'docs',
  'uat',
  'evidence',
  'regulatory-knowledge-foundation-2026-11-27',
  'open-001-vercel-cron-2026-11-28.json',
);

const targetAfter = new Date(process.env.OPEN001_CRON_AFTER || '2026-11-28T03:55:00.000Z');
const now = new Date();
const waitMs = Math.max(0, targetAfter.getTime() - now.getTime());
if (waitMs > 0) {
  console.log(`waiting ${Math.round(waitMs / 1000)}s until ${targetAfter.toISOString()}`);
  await new Promise((r) => setTimeout(r, waitMs));
}

const evidence = {
  capturedAt: new Date().toISOString(),
  targetCronUtc: '2026-11-28T04:00:00Z',
  stagingGit: 'fe027e8',
  deploymentId: 'dpl_7q6UCoGHTmncvgUw7TgL96Yh6kG5',
};

const url = process.env.STAGING_DATABASE_URL?.trim();
if (url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const due = await client.query(`
      select count(*)::int as due_now from regulatory_source_operations o
      join regulatory_sources s on s.id = o.source_id
      where o.enabled = true and s.ingestion_mode = 'ENABLED' and o.ingestion_mode = 'ENABLED'
        and (o.next_run_at is null or o.next_run_at <= now())`);
    evidence.dueCountAtCapture = due.rows[0]?.due_now ?? null;

    const runs = await client.query(`
      select ir.id, ir.status, ir.trigger_type, ir.queued_at, ir.completed_at, rs.external_key
      from ingestion_runs ir
      join regulatory_sources rs on rs.id = ir.source_id
      where ir.trigger_type = 'SCHEDULED' and ir.queued_at >= $1
      order by ir.queued_at desc limit 20`, [targetAfter.toISOString()]);
    evidence.scheduledIngestionRuns = runs.rows;

    const ecfr = await client.query(`
      select rs.external_key, o.last_success_at,
        (select count(*)::int from regulatory_publications p where p.source_id = rs.id) as pubs
      from regulatory_sources rs
      left join regulatory_source_operations o on o.source_id = rs.id
      where rs.external_key = 'SRC-ECFR-TITLE-12'`);
    evidence.ecfr = ecfr.rows[0] || null;
  } finally {
    await client.end();
  }
} else {
  evidence.note = 'STAGING_DATABASE_URL not set; skipped DB evidence';
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ ok: true, path: outPath, evidence }, null, 2));