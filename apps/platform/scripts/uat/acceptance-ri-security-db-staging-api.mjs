#!/usr/bin/env node
/**
 * SEC-DB-001/002 via hosted staging Lab API (RLS through application paths).
 * SEC-DB-003 remains DB-trigger scoped; delete is not exposed on the public API (documented).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'SEC-DB-STAGING-API-VALIDATION-2026-11-23.json');
const tag = `SEC-DB-API-${Date.now()}`;

let pass = 0;
let fail = 0;
const results = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass += 1;
    results.push({ step: name, pass: true });
    console.log(`PASS: ${name}`);
  } else {
    fail += 1;
    results.push({ step: name, pass: false, detail });
    console.log(`FAIL: ${name}`, detail ? JSON.stringify(detail) : '');
  }
};

const created = await runAs('A', async ({ page }) => {
  const res = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/findings`, {
    data: { title: tag, severity: 'MEDIUM', status: 'OPEN', description: 'SEC-DB staging API validation' },
  });
  const body = await res.json().catch(() => ({}));
  return { http: res.status(), body };
});
check('SEC-DB-002 create finding as User A', created.http === 201 && created.body?.ok, {
  http: created.http,
  ok: created.body?.ok,
});
const findingId = created.body?.finding?.id;
check('finding id returned', Boolean(findingId));

const bClose = await runAs('B', async ({ page }) => {
  const res = await page.request.patch(`${STAGING_ORIGIN}/api/ri-lab/findings/${findingId}`, {
    data: { status: 'CLOSED' },
  });
  const body = await res.json().catch(() => ({}));
  return { http: res.status(), body };
});
check(
  'SEC-DB-001 User B (reviewer) cannot close finding',
  bClose.http === 403 || bClose.body?.error === 'forbidden' || /finding_close/.test(JSON.stringify(bClose.body)),
  { http: bClose.http, error: bClose.body?.error },
);

const cClose = await runAs('C', async ({ page }) => {
  const res = await page.request.patch(`${STAGING_ORIGIN}/api/ri-lab/findings/${findingId}`, {
    data: { status: 'CLOSED' },
  });
  const body = await res.json().catch(() => ({}));
  return { http: res.status(), body };
});
check('SEC-DB-001 User C (compliance manager) may close', cClose.http === 200 && cClose.body?.ok, {
  http: cClose.http,
  status: cClose.body?.finding?.status,
});

const crossRead = await runAs('B', async ({ page }) => {
  const list = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/findings`);
  const body = await list.json().catch(() => ({}));
  const hit = (body.findings || []).some((f) => f.id === findingId);
  return { http: list.status(), hit, total: body.total, tenantScope: body.tenantScope };
});
check(
  'pilot org RLS: User B sees org-scoped findings (Users A/B/C share staging UAT org)',
  crossRead.http === 200 && crossRead.hit && crossRead.tenantScope === true,
  { total: crossRead.total },
);

const getDetail = await runAs('A', async ({ page }) => {
  const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/findings/${findingId}`);
  return { http: res.status(), body: await res.json().catch(() => ({})) };
});
check(
  'SEC-DB-002 creator bound via API create',
  getDetail.body?.detail?.created_by_user_id?.includes('user_'),
  { creator: getDetail.body?.detail?.created_by_user_id },
);

results.push({
  step: 'SEC-DB-003 audit immutability (API)',
  pass: null,
  skipped: true,
  detail:
    'workflow_events DELETE not exposed on ri-lab API; validate via STAGING_DATABASE_URL harness or trigger inventory when DB URL available.',
});
console.log('SKIP: SEC-DB-003 (no public delete route — use DB harness when STAGING_DATABASE_URL set)');

const payload = {
  generatedAt: new Date().toISOString(),
  stagingOrigin: STAGING_ORIGIN,
  findingId,
  pass,
  fail,
  results,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`\nacceptance-ri-security-db-staging-api: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);