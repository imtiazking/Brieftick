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

/** AI Development tenant (`b8f5e3a1-…`) pilot / UAT OPEN rows missing Stage 2 — not the 7 legacy FORGENIQ-org rows. */
const defaultSyntheticIds = [
  '36da0a55-a9b2-42f1-b1eb-5d4a5d13ec2b',
  '63b84f23-9b4f-424a-96c9-f33eb3192779',
  'db123fac-c36c-4c0d-bb9e-54174ac15aa3',
  'fdcf8241-608e-467d-a8f8-12a52c75b852',
  'a0a7e64d-0cb4-406f-9ca4-484c91db348e',
  '68051a63-ea05-45b5-bbef-4fdc94b1ae45',
  '96dd98d9-ad1e-4549-8a74-a82591b94db1',
  '2046ef71-f8b2-42f4-bdc4-3a1ec48b1b8a',
  '7143f1ff-c064-4123-bc2e-38e0102972df',
  '57bcc479-fe9f-42ec-873e-3cdb1552a2cc',
];
const envIds = (process.env.FORGENIQ_REPAIR_SYNTHETIC_IDS || '')
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

const dbUrl = process.env.STAGING_DATABASE_URL?.trim();
let disconnected = [];
if (dbUrl) {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  const { rows } = await client.query(
    `select ro.id, ro.status::text as status, ro.obligation_statement, ro.citation, ro.metadata, ro.updated_at,
            osi.stage2_state
     from regulatory_obligations ro
     join obligation_stage2_integrity osi on osi.obligation_id = ro.id
     where osi.stage2_state = 'DISCONNECTED'
     order by ro.created_at`,
  );
  await client.end();
  disconnected = rows;
} else if (envIds.length) {
  disconnected = envIds.map((id) => ({ id, status: 'OPEN', stage2_state: 'DISCONNECTED', metadata: {} }));
} else {
  disconnected = defaultSyntheticIds.map((id) => ({ id, status: 'OPEN', stage2_state: 'DISCONNECTED', metadata: {} }));
}

const explicitList = !dbUrl;
const synthetic = explicitList ? disconnected : disconnected.filter(isSyntheticRow);
const legacy = explicitList ? [] : disconnected.filter((r) => !isSyntheticRow(r));
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
      if (!ob?.id) {
        entry.skip = `obligation_not_visible_http_${cur.status}`;
        return;
      }
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
    await runAs('C', async ({ page }) => {
      const after = await api(page, 'GET', `/api/ri-lab/obligations/${target.id}`);
      const ob = after.body?.obligation ?? after.body;
      const impact =
        ob?.stage2ImpactAssessment?.id ||
        ob?.impactAssessmentId ||
        (Array.isArray(ob?.impacts) && ob.impacts.length > 0);
      entry.stage2After = impact ? 'LINKED' : 'DISCONNECTED';
      entry.ok = Boolean(impact);
      entry.recoverHttp = entry.recover?.status ?? entry.approve?.status;
    });
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