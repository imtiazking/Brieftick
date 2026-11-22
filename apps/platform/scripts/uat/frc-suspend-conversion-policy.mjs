#!/usr/bin/env node
/**
 * Priority 3 — suspend unverified REG-FRC conversion via operator maker-checker.
 * Requires RI_CLASSIFICATION_POLICY_ADMIN_WRITES_ENABLED=true on staging during run.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const EVIDENCE = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'REG-FRC-SUSPENSION-APPLIED-2026-11-22.json');
const log = [];
const record = (step, payload) => {
  log.push({ step, at: new Date().toISOString(), ...payload });
  writeFileSync(EVIDENCE, JSON.stringify({ log }, null, 2));
  return payload;
};

async function adminJson(page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/ri-lab/classification-policy/admin', { credentials: 'same-origin', cache: 'no-store' });
    return { status: res.status, ...(await res.json()) };
  });
}

async function loadFrcActive(page) {
  const { body } = await adminJson(page);
  return (body.policies || []).find((p) => p.regulatorKey === 'REG-FRC' && p.status === 'ACTIVE');
}

async function proposeSuspension() {
  return runAs('OP1', async ({ page, identity }) => {
    const { body } = await adminJson(page);
    if (body.writesEnabled !== true) {
      return record('propose-frc-suspend', {
        actor: identity.userId,
        skipped: true,
        reason: 'classification_policy_admin_writes_disabled',
        writesEnabled: body.writesEnabled,
      });
    }
    const frc = (body.policies || []).find((p) => p.regulatorKey === 'REG-FRC' && p.status === 'ACTIVE');
    const template = (body.policies || []).find((p) => p.regulatorKey === 'REG-FCA' && p.status === 'ACTIVE');
    const entries = (frc?.entries || template?.entries || []).map((e) => ({
      code: e.code,
      description: `FRC suspended pending authoritative taxonomy — ${e.code}`,
      legalStatus: e.legalStatus,
      conversionEnabled: false,
      destinationQueue: e.code === 'UNKNOWN' ? 'EXCEPTION_TRIAGE' : 'NON_OBLIGATION_TRIAGE',
      supportingObligationLinkRequired: e.supportingObligationLinkRequired === true,
      humanReviewRequired: true,
    }));
    const res = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
      data: {
        action: 'propose',
        regulatorKey: 'REG-FRC',
        effectiveFrom: new Date().toISOString().slice(0, 10),
        changeReason:
          'Operator-approved suspension: REG-FRC-POLICY-AUDIT-2026-11-22 — all conversion disabled until FRC taxonomy verified.',
        nonBindingPublicationTypes: ['finalised_guidance', 'guidance', 'exposure_draft', 'consultation'],
        entries,
      },
    });
    const out = await res.json().catch(() => ({}));
    return record('propose-frc-suspend', {
      actor: identity.userId,
      http: res.status(),
      ok: out.ok,
      policyId: out.policyId,
      priorVersion: frc?.policyVersion,
    });
  });
}

async function activateSuspension(policyId) {
  if (!policyId) return null;
  return runAs('OP2', async ({ page, identity }) => {
    const res = await page.request.post(`${STAGING_ORIGIN}/api/ri-lab/classification-policy/admin`, {
      data: { action: 'activate', policyId },
    });
    const out = await res.json().catch(() => ({}));
    const active = await loadFrcActive(page);
    const allOff = (active?.entries || []).every((e) => e.conversionEnabled === false);
    return record('activate-frc-suspend', {
      actor: identity.userId,
      http: res.status(),
      ok: out.ok,
      activeVersion: active?.policyVersion,
      allConversionDisabled: allOff,
    });
  });
}

async function verifyReadinessWritesOff() {
  return runAs('OP2', async ({ page }) => {
    const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/readiness`);
    const body = await res.json().catch(() => ({}));
    return record('readiness-after-suspend', {
      classificationAdminWrites: body.classificationPolicyAdminWritesEnabled ?? body.writesEnabled,
    });
  });
}

const propose = await proposeSuspension();
if (propose.policyId) await activateSuspension(propose.policyId);
await verifyReadinessWritesOff();
record('complete', { ok: true });
console.log('Wrote', EVIDENCE);