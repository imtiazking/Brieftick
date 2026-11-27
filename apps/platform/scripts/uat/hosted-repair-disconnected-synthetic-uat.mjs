#!/usr/bin/env node
/**
 * Repair synthetic UAT OPEN obligations stuck DISCONNECTED (maker-checker via hosted API).
 * Leaves legacy non-synthetic DISCONNECTED rows untouched (7 legacy obligations).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const SYNTHETIC_TEXT = /\bUAT-83H\b|\bUAT-83F\b|\b83F2 synthetic\b|\bsynthetic UAT\b|\bsynthetic fixture\b|_uat_label/i;

function isSyntheticRow(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta._uat_label != null) return true;
  const text = [row.obligation_statement, row.citation, meta.label].filter(Boolean).join(' ');
  return SYNTHETIC_TEXT.test(text);
}

async function api(page, method, path, data) {
  const res = await page.request.fetch(`${STAGING_ORIGIN}${path}`, {
    method,
    data,
    headers: data ? { 'content-type': 'application/json' } : undefined,
    timeout: 90_000,
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

const dbUrl = process.env.STAGING_DATABASE_URL?.trim();
if (!dbUrl) {
  console.error('STAGING_DATABASE_URL missing');
  process.exit(2);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
const { rows: disconnected } = await client.query(
  `select ro.id, ro.status::text as status, ro.obligation_statement, ro.citation, ro.metadata, ro.updated_at,
          osi.stage2_state
   from regulatory_obligations ro
   join obligation_stage2_integrity osi on osi.obligation_id = ro.id
   where osi.stage2_state = 'DISCONNECTED'
   order by ro.created_at`,
);
await client.end();

const synthetic = disconnected.filter(isSyntheticRow);
const legacy = disconnected.filter((r) => !isSyntheticRow(r));
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `repair-disconnected-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const log = [];

console.log(`disconnected total=${disconnected.length} synthetic=${synthetic.length} legacy_skipped=${legacy.length}`);

await requireUatPersonas(['A', 'C'], { label: 'repair-disconnected-synthetic' });

const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');

for (const target of synthetic) {
  const entry = { id: target.id, statusBefore: target.status, stage2Before: target.stage2_state };
  try {
    if (norm(target.status) === 'DRAFT') {
      await runAs('A', async ({ page, act }) => {
        const cur = await api(page, 'GET', `/api/ri-lab/obligations/${target.id}`);
        const ob = cur.body?.obligation ?? cur.body;
        const res = await act('submit IN_REVIEW', () =>
          api(page, 'PATCH', `/api/ri-lab/obligations/${target.id}`, {
            status: 'IN_REVIEW',
            expectedUpdatedAt: ob?.updatedAt ?? target.updated_at,
          }),
        );
        entry.submit = { status: res.status, obligationStatus: res.body?.obligation?.status };
      });
    }
    await runAs('C', async ({ page, act }) => {
      const cur = await api(page, 'GET', `/api/ri-lab/obligations/${target.id}`);
      const ob = cur.body?.obligation ?? cur.body;
      const st = norm(ob?.status);
      if (st === 'IN_REVIEW') {
        const res = await act('checker approve OPEN', () =>
          api(page, 'PATCH', `/api/ri-lab/obligations/${target.id}`, {
            status: 'OPEN',
            expectedUpdatedAt: ob?.updatedAt,
          }),
        );
        entry.approve = { status: res.status, obligationStatus: res.body?.obligation?.status };
      } else if (st === 'OPEN') {
        const res = await act('checker recover Stage 2 on OPEN', () =>
          api(page, 'PATCH', `/api/ri-lab/obligations/${target.id}`, {
            status: 'OPEN',
            expectedUpdatedAt: ob?.updatedAt,
          }),
        );
        entry.recover = { status: res.status, obligationStatus: res.body?.obligation?.status };
      } else {
        entry.skip = `unexpected_status_${st}`;
      }
    });
    const verify = new pg.Client({ connectionString: dbUrl });
    await verify.connect();
    const [row] = (
      await verify.query(`select stage2_state from obligation_stage2_integrity where obligation_id = $1`, [target.id])
    ).rows;
    await verify.end();
    entry.stage2After = row?.stage2_state ?? null;
    entry.ok = entry.stage2After === 'LINKED';
    log.push(entry);
    console.log(entry.ok ? 'PASS' : 'FAIL', target.id.slice(0, 8), entry.stage2After, entry.skip || '');
  } catch (err) {
    entry.ok = false;
    entry.error = String(err?.message || err).slice(0, 300);
    log.push(entry);
    console.error('FAIL', target.id, entry.error);
  }
}

const failed = log.filter((r) => !r.ok).length;
writeFileSync(
  join(OUT, 'RESULT.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      syntheticAttempted: synthetic.length,
      legacySkipped: legacy.map((r) => r.id),
      failed,
      results: log,
    },
    null,
    2,
  ),
);
if (failed) {
  console.error(`repair-disconnected: FAIL ${failed}/${synthetic.length}`);
  process.exit(1);
}
console.log(`repair-disconnected: PASS ${synthetic.length}; legacy untouched ${legacy.length}`);