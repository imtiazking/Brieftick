#!/usr/bin/env node
/**
 * PS22/9 obligation 68051a63 — inspect, A submit IN_REVIEW, B SoD refuse, C approve OPEN.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const OBLIGATION_ID = '68051a63-ea05-45b5-bbef-4fdc94b1ae45';
const RUN_ID = '728338c4-3ab9-438a-b0af-75f011955971';
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS22-9-OBLIGATION-APPROVAL.json');
const EVIDENCE_DIR = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'ps22-9-uat');
mkdirSync(EVIDENCE_DIR, { recursive: true });

const log = [];
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  writeFileSync(EVIDENCE, JSON.stringify({ obligationId: OBLIGATION_ID, runId: RUN_ID, log }, null, 2));
  return payload;
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

async function inspect() {
  return runAs('B', async ({ page, identity }) => {
    const detail = await page.evaluate(async (id) => {
      const res = await fetch(`/api/ri-lab/obligations/${id}`, { credentials: 'same-origin', cache: 'no-store' });
      return { status: res.status, ...(await res.json()) };
    }, OBLIGATION_ID);
    const events = await page.evaluate(async (id) => {
      const res = await fetch(
        `/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=${encodeURIComponent(id)}`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      return { status: res.status, ...(await res.json()) };
    }, OBLIGATION_ID);
    await openObligation(page, OBLIGATION_ID).catch(() => null);
    await page.screenshot({ path: join(EVIDENCE_DIR, 'obligation-draft-inspect.png'), fullPage: false }).catch(() => null);
    return record('inspect', {
      actor: identity.userId,
      status: detail.obligation?.status ?? detail.status,
      metadata: detail.obligation?.metadata ?? detail.metadata,
      workflowEventCount: events.events?.length ?? 0,
    });
  });
}

async function submitForReview() {
  return runAs('A', async ({ page, identity, act }) => {
    await openObligation(page, OBLIGATION_ID);
    const panel = page.locator(`[data-connected-obligation-panel="${OBLIGATION_ID}"]`);
    await panel.locator('[data-connected-obligation-field="status"]').fill('IN_REVIEW');
    await act('submit IN_REVIEW', () => panel.locator('[data-connected-obligation-save]').click());
    await page.waitForTimeout(1500);
    return record('submit-in-review', { actor: identity.userId });
  });
}

async function refuseApproverB() {
  return runAs('B', async ({ page, identity, act }) => {
    await openObligation(page, OBLIGATION_ID);
    const btn = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${OBLIGATION_ID}"]`);
    if (!(await btn.count())) return record('sod-skip', { actor: identity.userId, note: 'approve control not offered to B' });
    const result = await act('B attempts approve', async () => {
        const r = await page.request.patch(`${STAGING_ORIGIN}/api/ri-lab/obligations/${OBLIGATION_ID}`, {
          data: { status: 'OPEN' },
        });
      return { status: r.status(), body: await r.json().catch(() => ({})) };
    });
    return record('sod-refuse-b', { actor: identity.userId, result });
  });
}

async function approveOpen() {
  return runAs('C', async ({ page, identity, act }) => {
    await openObligation(page, OBLIGATION_ID);
    const btn = page.locator(`[data-connected-obligation-decision="OPEN"][data-obligation-id="${OBLIGATION_ID}"]`);
    await btn.waitFor({ timeout: 60_000 });
    await act('C approves OPEN', () => btn.click());
    await page.waitForTimeout(2000);
    const detail = await page.evaluate(async (id) => {
      const res = await fetch(`/api/ri-lab/obligations/${id}`, { credentials: 'same-origin', cache: 'no-store' });
      return res.json();
    }, OBLIGATION_ID);
    const events = await page.evaluate(async (id) => {
      const res = await fetch(
        `/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=${encodeURIComponent(id)}`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      return res.json();
    }, OBLIGATION_ID);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(EVIDENCE_DIR, 'obligation-open-register.png'), fullPage: false });
    return record('approve-open', {
      actor: identity.userId,
      status: detail.obligation?.status,
      eventTypes: (events.events || []).map((e) => e.event_type || e.eventType),
    });
  });
}

async function verifyRunIntact() {
  return runAs('B', async ({ page }) => {
    const run = await page.evaluate(async (id) => {
      const res = await fetch(`/api/ri-lab/ai-analysis-runs/${id}`, { credentials: 'same-origin', cache: 'no-store' });
      return { status: res.status, ...(await res.json()) };
    }, RUN_ID);
    const review = await page.evaluate(async (id) => {
      const res = await fetch(`/api/ri-lab/ai-analysis-runs/${id}/findings`, { credentials: 'same-origin', cache: 'no-store' });
      return { status: res.status, reviewStatus: (await res.json()).reviewStatus };
    }, RUN_ID);
    return record('run-preserved', { runHttp: run.status, reviewStatus: review.reviewStatus });
  });
}

async function runAll() {
  await inspect();
  await submitForReview();
  await refuseApproverB();
  await approveOpen();
  await verifyRunIntact();
  return record('complete', { obligationId: OBLIGATION_ID });
}

const cmd = process.argv[2] || 'run-all';
const commands = { 'run-all': runAll, inspect, 'submit-for-review': submitForReview, 'approve-open': approveOpen };
if (!commands[cmd]) {
  console.error(`usage: ${Object.keys(commands).join(' | ')}`);
  process.exit(2);
}
commands[cmd]().then(
  (r) => console.log(JSON.stringify(r, null, 2)),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);