#!/usr/bin/env node
/**
 * Priority 3 — read-only FCA validation: PS22 binding + evidential obligations on staging.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const BINDING_OBL = '2046ef71-f8b2-42f4-bdc4-3a1ec48b1b8a';
const EVIDENTIAL_OBL = '7143f1ff-c064-4123-bc2e-38e0102972df';
const WRONG_LINK = '68051a63-ea05-45b5-bbef-4fdc94b1ae45';
const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS22-9-FCA-FINAL-VALIDATION-2026-11-22.json');

async function fetchObligation(page, id) {
  return page.evaluate(async (obligationId) => {
    const res = await fetch(`/api/ri-lab/obligations/${obligationId}`, { credentials: 'same-origin', cache: 'no-store' });
    return { status: res.status, ...(await res.json()) };
  }, id);
}

async function fetchEvents(page, id) {
  return page.evaluate(async (obligationId) => {
    const res = await fetch(
      `/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=${encodeURIComponent(obligationId)}`,
      { credentials: 'same-origin', cache: 'no-store' },
    );
    return { status: res.status, ...(await res.json()) };
  }, id);
}

const report = { capturedAt: new Date().toISOString(), checks: [] };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail ? JSON.stringify(detail) : '');
};

mkdirSync(join(OUT, '..'), { recursive: true });

await runAs('C', async ({ page }) => {
  await page.goto(`${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`, {
    waitUntil: 'domcontentloaded',
  });

  const binding = await fetchObligation(page, BINDING_OBL);
  const evidential = await fetchObligation(page, EVIDENTIAL_OBL);
  const wrong = await fetchObligation(page, WRONG_LINK);

  const bObl = binding.obligation ?? binding;
  const eObl = evidential.obligation ?? evidential;
  const wObl = wrong.obligation ?? wrong;

  check('binding obligation HTTP 200', binding.status === 200);
  check('evidential obligation HTTP 200', evidential.status === 200);
  check('binding register status OPEN', bObl?.status === 'OPEN', { status: bObl?.status });
  check('evidential register status OPEN', eObl?.status === 'OPEN', { status: eObl?.status });
  check('prior 2A.4.13R obligation OPEN', wObl?.status === 'OPEN', { status: wObl?.status });

  const eMeta = eObl?.metadata || {};
  const legalStatus = eMeta.legalStatus ?? eMeta.classification?.legalStatus ?? eObl?.legalStatus;
  check('evidential classified evidential', legalStatus === 'evidential' || legalStatus === 'EVIDENTIAL', { legalStatus });
  const supports =
    eObl?.supportsObligationId ?? eMeta.supportsObligationId ?? eMeta.evidentialLink?.supportsObligationId;
  check('evidential supports binding 2046ef71', supports === BINDING_OBL, { supports });
  check('evidential does not support 68051a63', supports !== WRONG_LINK, { supports });

  const bEvents = await fetchEvents(page, BINDING_OBL);
  const eEvents = await fetchEvents(page, EVIDENTIAL_OBL);
  check('binding audit history present', (bEvents.events?.length ?? 0) >= 1, { count: bEvents.events?.length });
  check('evidential audit history present', (eEvents.events?.length ?? 0) >= 1, { count: eEvents.events?.length });

  report.obligations = {
    binding: { id: BINDING_OBL, status: bObl?.status, provisionReference: bObl?.provisionReference ?? bObl?.metadata?.provisionReference },
    evidential: {
      id: EVIDENTIAL_OBL,
      status: eObl?.status,
      legalStatus,
      supportsObligationId: supports,
    },
    unrelatedOpen: { id: WRONG_LINK, status: wObl?.status },
  };
});

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('Wrote', OUT);
const failed = report.checks.filter((c) => !c.ok).length;
process.exit(failed ? 1 : 0);