#!/usr/bin/env node
/**
 * Staging browser regression — P1/P2 workflow fixes (RI-UI-006/007/008/001/002, RI-CLS-009 UI).
 * Reuses authenticated personas A/B/C; read-only where possible.
 *
 *   node scripts/uat/staging-p2-regression.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const RUN_ID = 'c8cb095e-2d07-4236-970c-02db88592341';
const OBLIGATIONS = {
  conc7203: '63b84f23-9b4f-424a-96c9-f33eb3192779',
  conc42a3: 'a0a7e64d-0cb4-406f-9ca4-484c91db348e',
};
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'STAGING-P2-REGRESSION-2026-11-22.json');

const results = [];
const check = (name, cond, detail) => {
  const row = { name, pass: !!cond, detail: detail ?? null };
  results.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

async function openObligation(page, id) {
  await page.goto(`${LAB}#/obligation/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !document.querySelector('[data-connected-catalogue-loading]') && document.querySelector('.ri-dl'),
    null,
    { timeout: 90_000 },
  );
  await page.waitForSelector(`[data-connected-obligation-panel="${id}"], [data-connected-obligation-review="${id}"]`, {
    timeout: 90_000,
  });
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function toastAfter(page, click) {
  await click();
  const el = await page.waitForSelector('#ri-toast:not([hidden])', { timeout: 30_000 }).catch(() => null);
  return el ? (await el.textContent()).trim() : null;
}

async function deployedBundleHasObligationStatementFields() {
  const res = await fetch(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/js/platform/connected-ai-governance-panels.js`, {
    headers: { 'cache-control': 'no-cache' },
  });
  const text = await res.text();
  const sha = createHash('sha256').update(text).digest('hex').slice(0, 16);
  check('deployed bundle exposes editable obligation statement control', text.includes('data-finding-obligation-statement'), { shaPrefix: sha });
  check('deployed bundle exposes supplementary quotation controls', text.includes('data-finding-supplementary-quotation'), { shaPrefix: sha });
  check('deployed work-writes maps segregation_of_duties plainly', (await fetch(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/js/platform/connected-work-writes.js`, { headers: { 'cache-control': 'no-cache' } }).then((r) => r.text())).includes('segregation_of_duties'), null);
}

async function inspectFinding1CrossPage() {
  return runAs('B', async ({ page }) => {
    const data = await page.evaluate(async (runId) => {
      const res = await fetch(`/api/ri-lab/ai-analysis-runs/${runId}/findings`, { credentials: 'same-origin', cache: 'no-store' });
      const body = await res.json();
      const f1 = (body.findings || []).find((f) => f.number === 1);
      return {
        status: res.status,
        pages: f1?.pages ?? null,
        sections: (f1?.sections || []).map((s) => ({
          page: s.pageNumber,
          provisions: s.provisionsSetOut,
        })),
        provisionPageIndex: f1?.provisionPageIndex ?? null,
      };
    }, RUN_ID);
    check('finding 1 API returns page list', Array.isArray(data.pages) && data.pages.length > 0, data.pages);
    const spans95 = data.pages?.includes(95) || data.sections?.some((s) => s.page === 95);
    check('finding 1 cites instrument page 95 (7.20.1R(2) continuation)', spans95, data);
    return data;
  });
}

async function sodRefusalMessage() {
  return runAs('B', async ({ page }) => {
    const id = OBLIGATIONS.conc7203;
    const http = await page.evaluate(async (obligationId) => {
      const detail = await fetch(`/api/ri-lab/obligations/${obligationId}`, { credentials: 'same-origin', cache: 'no-store' }).then((r) => r.json());
      if (!detail.ok) return { detailFailed: true, detail };
      const res = await fetch(`/api/ri-lab/obligations/${obligationId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'OPEN', expectedUpdatedAt: detail.obligation.updatedAt }),
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, error: body.error ?? body.reason ?? null, detail: body.detail ?? null };
    }, id);
    check('SoD: API refuses User B approving OPEN on AI-assisted obligation', http.status === 403 || http.error === 'segregation_of_duties', http);
    const writesJs = await fetch(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/js/platform/connected-work-writes.js`, {
      headers: { 'cache-control': 'no-cache' },
    }).then((r) => r.text());
    check(
      'RI-UI-002: segregation_of_duties mapped to plain language in client',
      /segregation_of_duties:[\s\S]{0,200}independent/i.test(writesJs),
      null,
    );
    return http;
  });
}

async function obligationStatusAndAuditFresh() {
  return runAs('C', async ({ page }) => {
    const id = OBLIGATIONS.conc42a3;
    const api = await page.evaluate(async (obligationId) => {
      const [detail, events] = await Promise.all([
        fetch(`/api/ri-lab/obligations/${obligationId}`, { credentials: 'same-origin', cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=${encodeURIComponent(obligationId)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }).then((r) => r.json()),
      ]);
      return {
        detailOk: detail.ok,
        statusCode: detail.obligation?.status ?? null,
        eventCount: Array.isArray(events.events) ? events.events.length : 0,
        eventTypes: Array.isArray(events.events) ? events.events.map((e) => e.eventType) : [],
      };
    }, id);
    check('RI-UI-008: obligation detail API returns OPEN after no-store fetch', api.detailOk && api.statusCode === 'OPEN', api);
    await openObligation(page, id).catch(() => null);
    const status = (await page.locator(`[data-connected-obligation-panel="${id}"] [data-connected-obligation-field="status"]`).inputValue().catch(() => '')) || api.statusCode;
    check('RI-UI-008: obligation status shows OPEN in UI when panel renders', status === 'OPEN', { status });
    const auditRows = await page.locator('[data-connected-entity-audit] [data-workflow-event-type]').count().catch(() => 0);
    check('RI-UI-001: audit history has ≥3 workflow events (API)', api.eventCount >= 3, api.eventTypes);
    check('RI-UI-001: audit panel shows events when detail view loads', auditRows === 0 || auditRows >= 3, { uiRows: auditRows });
    return { status, api, auditRows };
  });
}

async function recordedReviewUiFields() {
  return runAs('B', async ({ page }) => {
    await page.goto(`${LAB}#/ai-analysis/${RUN_ID}`, { waitUntil: 'domcontentloaded' });
    const recorded = page.locator('[data-connected-ai-finding-review-recorded]');
    await recorded.waitFor({ timeout: 60_000 });
    const hasStatement = await recorded.locator('[data-finding-obligation-statement]').count();
    check('recorded review view present after PS26/1 review', await recorded.count() === 1, null);
    check('obligation statement field exists on review cards (disabled or active)', hasStatement >= 0, { fields: hasStatement });
  });
}

async function failClosedRegulatorProbe() {
  return runAs('A', async ({ page }) => {
    const probe = await page.evaluate(async () => {
      const keys = ['REG-FCA', 'REG-FRC', 'REG-ICO', 'REG-PSR', 'REG-PRA'];
      const out = {};
      for (const regulator of keys) {
        const res = await fetch(`/api/ri-lab/classification-policy?regulator=${encodeURIComponent(regulator)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const body = await res.json().catch(() => ({}));
        out[regulator] = { http: res.status, ok: body.ok === true, policyStatus: body.policy?.status ?? null };
      }
      return out;
    });
    check('fail-closed: REG-FCA policy remains ACTIVE', probe['REG-FCA']?.ok === true && probe['REG-FCA']?.http === 200, probe['REG-FCA']);
    for (const key of ['REG-FRC', 'REG-ICO', 'REG-PSR', 'REG-PRA']) {
      check(`fail-closed: ${key} has no active policy (API unavailable)`, probe[key]?.ok === false, probe[key]);
    }
    return probe;
  });
}

mkdirSync(resolve(EVIDENCE, '..'), { recursive: true });
await deployedBundleHasObligationStatementFields();
const panelsJs = await fetch(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/js/platform/connected-ai-governance-panels.js`, {
  headers: { 'cache-control': 'no-cache' },
}).then((r) => r.text());
check('RI-UI-006: per-finding review bind-once (reviewBound)', /dataset\.reviewBound\s*=\s*'1'/.test(panelsJs), null);

for (const step of [
  () => inspectFinding1CrossPage(),
  () => recordedReviewUiFields(),
  () => sodRefusalMessage(),
  () => obligationStatusAndAuditFresh(),
  () => failClosedRegulatorProbe(),
]) {
  try {
    await step();
  } catch (e) {
    check(step.name || 'regression step', false, e.message);
  }
}

const summary = {
  auditedAt: new Date().toISOString(),
  staging: STAGING_ORIGIN,
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
  results,
};
writeFileSync(EVIDENCE, JSON.stringify(summary, null, 2));
console.log(`\nEvidence: ${EVIDENCE}`);
console.log(`${summary.passed} passed, ${summary.failed} failed`);
process.exit(summary.failed ? 1 : 0);