#!/usr/bin/env node
/**
 * RI-CLS-003 staging UAT: two platform operators (OP1/OP2) + non-operator tenant (B).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'CLASSIFICATION-POLICY-ADMIN-STAGING.json');
const log = [];
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  writeFileSync(EVIDENCE, JSON.stringify({ log }, null, 2));
  return payload;
};

async function openAdmin(page) {
  await page.goto(`${LAB}#/admin/classification-policy`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('[data-connected-classification-policy-admin]'),
    null,
    { timeout: 90_000 },
  );
}

async function adminJson(page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/ri-lab/classification-policy/admin', { credentials: 'same-origin', cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  });
}

async function operatorFlags() {
  const op1 = await runAs('OP1', async ({ page, identity }) => {
    const { status, body } = await adminJson(page);
    return record('operator-op1-api', {
      actor: identity.userId,
      http: status,
      operator: body.operator,
      writesEnabled: body.writesEnabled,
    });
  });
  const op2 = await runAs('OP2', async ({ page, identity }) => {
    const { status, body } = await adminJson(page);
    return record('operator-op2-api', {
      actor: identity.userId,
      http: status,
      operator: body.operator,
    });
  });
  return { op1, op2 };
}

async function tenantNonOperator() {
  const b = await runAs('B', async ({ page, identity }) => {
    await openAdmin(page);
    const root = page.locator('[data-connected-classification-policy-admin]');
    const operator = await root.getAttribute('data-cp-operator');
    const readOnly = await root.locator('[data-cp-read-only]').count();
    const propose = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
      data: {
        action: 'propose',
        regulatorKey: 'REG-FCA',
        effectiveFrom: new Date().toISOString().slice(0, 10),
        changeReason: 'Tenant must not propose',
        entries: [],
      },
    });
    const activate = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
      data: { action: 'activate', policyId: '00000000-0000-0000-0000-000000000001' },
    });
    return record('tenant-b-non-operator', {
      actor: identity.userId,
      operatorFlag: operator,
      readOnlyBanner: readOnly > 0,
      proposeStatus: propose.status(),
      activateStatus: activate.status(),
    });
  });
  return b;
}

async function loadFcaEntries(page) {
  const { body } = await adminJson(page);
  const active = (body.policies || []).find((p) => p.regulatorKey === 'REG-FCA' && p.status === 'ACTIVE');
  if (!active?.entries?.length) throw new Error('missing active FCA policy');
  return active.entries.map((e) => ({
    code: e.code,
    description: e.description,
    legalStatus: e.legalStatus,
    conversionEnabled: e.conversionEnabled,
    destinationQueue: e.destinationQueue,
    supportingObligationLinkRequired: e.supportingObligationLinkRequired,
    humanReviewRequired: e.humanReviewRequired,
  }));
}

async function proposeFcaDraft() {
  return runAs('OP1', async ({ page, identity, act }) => {
    await openAdmin(page);
    const root = page.locator('[data-connected-classification-policy-admin]');
    const operatorUi = await root.getAttribute('data-cp-operator');
    await root.locator('[data-cp-select-regulator="REG-FCA"]').click().catch(() => root.locator('button:has-text("FCA")').first().click());
    await page.waitForTimeout(400);
    await root.locator('[data-cp-new-draft]').click();
    await page.waitForTimeout(400);
    const editorOpen = (await root.locator('[data-cp-editor]').count()) > 0;
    record('policy-editor-ui', { actor: identity.userId, operatorUi, editorOpen });
    const entries = await loadFcaEntries(page);
    const edited = entries.map((e) =>
      e.code === 'UNKNOWN'
        ? {
            ...e,
            description: 'Staging RI-CLS-003 UAT — UNKNOWN routes to exception triage (edited).',
          }
        : e,
    );
    const res = await act('propose FCA draft', async () =>
      page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
        data: {
          action: 'propose',
          regulatorKey: 'REG-FCA',
          effectiveFrom: new Date().toISOString().slice(0, 10),
          changeReason: 'Staging RI-CLS-003 UAT: amend UNKNOWN description; operator maker-checker with OP2.',
          nonBindingPublicationTypes: ['finalised_guidance', 'guidance'],
          entries: edited,
        },
      }),
    );
    const out = await res.json().catch(() => ({}));
    const { body } = await adminJson(page);
    const drafts = (body.policies || []).filter((p) => p.regulatorKey === 'REG-FCA' && p.status === 'DRAFT');
    const newest = drafts.sort((a, b) => b.policyVersion - a.policyVersion)[0];
    const draftPolicyId = out.policyId || newest?.id;
    const selfActivate = draftPolicyId
      ? await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
          data: { action: 'activate', policyId: draftPolicyId },
        })
      : null;
    const selfBody = selfActivate ? await selfActivate.json().catch(() => ({})) : {};
    return record('propose-fca', {
      actor: identity.userId,
      proposeHttp: res.status(),
      proposeOk: out.ok,
      draftPolicyId,
      draftVersion: newest?.policyVersion,
      createdBy: newest?.createdBy,
      selfActivateStatus: selfActivate?.status(),
      selfActivateError: selfBody.reason || selfBody.error || selfBody.detail,
      editorOpen,
    });
  });
}

async function activateFcaDraft(draftPolicyId) {
  return runAs('OP2', async ({ page, identity, act }) => {
    await openAdmin(page);
    const root = page.locator('[data-connected-classification-policy-admin]');
    if ((await root.getAttribute('data-cp-operator')) !== 'true') throw new Error('OP2 not operator');
    await root.locator('[data-cp-select-regulator="REG-FCA"]').click().catch(() => root.locator('button:has-text("FCA")').first().click());
    await page.waitForTimeout(400);
    const versionBtn = root.locator(`[data-cp-select-version="${draftPolicyId}"]`);
    if (await versionBtn.count()) await versionBtn.click();
    await page.waitForTimeout(400);
    const activate = root.locator(`[data-cp-activate="${draftPolicyId}"]`);
    const activateControlVisible = (await activate.count()) > 0;
    record('activate-fca-ui', { actor: identity.userId, activateControlVisible });
    const res = await act('activate FCA draft', async () =>
      page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
        data: { action: 'activate', policyId: draftPolicyId },
      }),
    );
    const body = await res.json().catch(() => ({}));
    const { body: adminBody } = await adminJson(page);
    const active = (adminBody.policies || []).find((p) => p.id === draftPolicyId && p.status === 'ACTIVE');
    const events = (adminBody.events || []).filter((e) => e.policyId === draftPolicyId);
    return record('activate-fca', {
      actor: identity.userId,
      policyId: draftPolicyId,
      http: res.status(),
      ok: body.ok,
      activeVersion: active?.policyVersion,
      approvedBy: active?.approvedBy,
      auditEventCount: events.length,
      activateControlVisible,
    });
  });
}

async function proposeFrcIfNeeded() {
  return runAs('OP1', async ({ page, identity }) => {
    const { body } = await adminJson(page);
    const frcActive = (body.policies || []).find((p) => p.regulatorKey === 'REG-FRC' && p.status === 'ACTIVE');
    if (frcActive) {
      return record('propose-frc', {
        actor: identity.userId,
        skipped: true,
        reason: 'REG-FRC already active from prior UAT',
        activeVersion: frcActive.policyVersion,
        approvedBy: frcActive.approvedBy,
      });
    }
    const entries = await loadFcaEntries(page);
    const frcEntries = entries.map((e) => ({
      ...e,
      conversionEnabled: false,
      destinationQueue: e.code === 'UNKNOWN' ? 'EXCEPTION_TRIAGE' : 'NON_OBLIGATION_TRIAGE',
      description: `FRC staging UAT ${e.code}`,
    }));
    const res = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
      data: {
        action: 'propose',
        regulatorKey: 'REG-FRC',
        effectiveFrom: new Date().toISOString().slice(0, 10),
        changeReason: 'First FRC classification policy — staging RI-CLS-003 UAT.',
        nonBindingPublicationTypes: ['finalised_guidance'],
        entries: frcEntries,
      },
    });
    const proposeBody = await res.json().catch(() => ({}));
    return record('propose-frc', {
      actor: identity.userId,
      status: res.status(),
      policyId: proposeBody.policyId,
      ok: proposeBody.ok,
    });
  });
}

async function activateFrcDraft(policyId) {
  if (!policyId) return null;
  return runAs('OP2', async ({ page, identity }) => {
    const res = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
      data: { action: 'activate', policyId },
    });
    const body = await res.json().catch(() => ({}));
    return record('activate-frc', { actor: identity.userId, status: res.status(), ok: body.ok, policyId });
  });
}

async function auditHistory() {
  return runAs('OP2', async ({ page, identity }) => {
    const { body } = await adminJson(page);
    const fca = (body.policies || []).filter((p) => p.regulatorKey === 'REG-FCA');
    const active = fca.find((p) => p.status === 'ACTIVE');
    const events = (body.events || []).length ? body.events : active?.auditEvents || [];
    const eventTypes = events.map((e) => e.eventType || e.event_type).filter(Boolean);
    return record('audit-history', {
      actor: identity.userId,
      fcaVersions: fca.length,
      activeVersion: active?.policyVersion,
      globalAuditEvents: events.length,
      eventTypesSample: [...new Set(eventTypes)].slice(0, 12),
    });
  });
}

async function failClosedEnforcement() {
  return runAs('B', async ({ page, identity }) => {
    const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/regulators/REG-ICO/classification-policy`);
    const body = await res.json().catch(() => ({}));
    return record('fail-closed-ico', {
      actor: identity.userId,
      status: res.status(),
      ok: body.ok,
      policyStatus: body.policy?.status,
    });
  });
}

async function withdrawStaleDraft() {
  return runAs('OP1', async ({ page, identity, act }) => {
    const { body } = await adminJson(page);
    const stale = (body.policies || []).find((p) => p.regulatorKey === 'REG-FCA' && p.status === 'DRAFT');
    if (!stale) return record('withdraw-skipped', { actor: identity.userId, reason: 'no FCA draft to withdraw' });
    const res = await act('withdraw stale draft', async () =>
      page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
        data: {
          action: 'withdraw',
          policyId: stale.id,
          reason: 'Staging UAT: withdraw superseded draft after v2 activation.',
        },
      }),
    );
    const out = await res.json().catch(() => ({}));
    return record('withdraw-draft', { actor: identity.userId, policyId: stale.id, http: res.status(), ok: out.ok });
  });
}

async function runAll() {
  await operatorFlags();
  await tenantNonOperator();
  const propose = await proposeFcaDraft();
  if (!propose.draftPolicyId) throw new Error('FCA draft not created');
  if (propose.selfActivateStatus !== 403) throw new Error(`expected self-activate 403, got ${propose.selfActivateStatus}`);
  await activateFcaDraft(propose.draftPolicyId);
  const frc = await proposeFrcIfNeeded();
  if (frc?.policyId) await activateFrcDraft(frc.policyId);
  await auditHistory();
  await withdrawStaleDraft();
  await failClosedEnforcement();
  return record('complete', { ok: true, secondOperator: 'user_3LBBtwYR4mmFisfpzMj3n7DVtVh' });
}

runAll().then(
  (r) => console.log(JSON.stringify(r, null, 2)),
  (e) => {
    console.error(e);
    record('failed', { message: String(e?.message || e) });
    process.exit(1);
  },
);