#!/usr/bin/env node
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const REPORT = resolve(process.cwd(), '..', '..', 'docs', 'uat', 'HOSTED-DESIGN-LAB-E2E-WORKFLOW-2026-11-24.json');

const out = await runAs('A', async ({ page, identity }) => {
  page.setDefaultTimeout(120_000);
  let actionId = null;
  let evidenceId = null;

  await page.goto(`${LAB}#/actions`, { waitUntil: 'domcontentloaded' });
  const actionRes = await page.evaluate(
    async (payload) => {
      const res = await fetch('/api/ri-lab/actions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    {
      title: 'UAT-E2E-MHZ8K9L remediation',
      description: 'Isolated staging E2E remediation linked to CONC 7.20.3R obligation.',
      priority: 'High',
      creation_mode: 'uat_authorised',
      owner_user_id: identity.userId,
      obligation_id: '57bcc479-fe9f-42ec-873e-3cdb1552a2cc',
      risk_id: '89b7d5c3-de66-45fe-9cd7-8e2eebf151a2',
      control_id: '005e92f7-6276-4233-b6a5-70cfbc463914',
      idempotency_key: `uat-e2e-action-${Date.now()}`,
    },
  );
  actionId = actionRes.body?.action?.id || null;

  await page.goto(`${LAB}#/evidence`, { waitUntil: 'domcontentloaded' });
  const evRes = await page.evaluate(
    async (payload) => {
      const res = await fetch('/api/ri-lab/evidence', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    {
      title: 'UAT-E2E-MHZ8K9L evidence',
      evidence_type: 'test_result',
      creation_mode: 'uat_authorised',
      idempotency_key: `uat-e2e-evidence-${Date.now()}`,
    },
  );
  const evBody = evRes.body;
  evidenceId = evBody?.evidence?.id || evBody?.item?.id || null;
  if (evidenceId) {
    await page.goto(`${LAB}#/evidence/${evidenceId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-connected-evidence-file]').setInputFiles({
      name: 'e2e-uat.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Permitted UAT test evidence file for E2E workflow.'),
    });
    const up = page.waitForResponse((r) => r.url().includes('/upload') && r.request().method() === 'POST');
    await page.locator('[data-connected-evidence-upload]').click();
    const upRes = await up;
    return {
      action: { status: actionRes.status, id: actionId, body: actionRes.body },
      evidence: { status: evRes.status, id: evidenceId, upload: upRes.status() },
      user: identity.userId,
    };
  }
  return {
    action: { status: actionRes.status, id: actionId, body: actionRes.body },
    evidence: { status: evRes.status, id: evidenceId },
    user: identity.userId,
  };
});

console.log(JSON.stringify(out, null, 2));

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
report.ids.actionId = out.action.id;
report.ids.evidenceId = out.evidence.id;
for (const s of report.stages) {
  if (s.stage === 12) {
    s.result = out.action.id ? 'PASS' : 'FAIL';
    s.recordId = out.action.id;
    s.verification = `POST ${out.action.status}`;
  }
  if (s.stage === 13) {
    s.result = out.evidence.id ? 'PASS' : 'FAIL';
    s.recordId = out.evidence.id;
    s.verification = `upload ${out.evidence.upload ?? 'n/a'}`;
  }
}
report.summary = {
  pass: report.stages.filter((s) => s.result === 'PASS').length,
  fail: report.stages.filter((s) => s.result === 'FAIL').length,
  blocked: report.stages.filter((s) => s.result === 'BLOCKED').length,
  overall: report.stages.some((s) => s.result === 'FAIL') ? 'FAIL' : 'PASS',
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log('summary', report.summary);