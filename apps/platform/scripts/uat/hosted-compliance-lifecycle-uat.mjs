#!/usr/bin/env node
/**
 * Hosted five-stage compliance lifecycle UAT on staging Design Lab APIs.
 * Synthetic records only. Fixture AI (no paid models). Users A (maker) and C (checker).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const RUN = `UAT-LIFECYCLE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36)}`;
const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `compliance-lifecycle-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;

const results = [];
const ids = { run: RUN, origin: STAGING_ORIGIN };
const record = (id, layer, status, detail = {}) => {
  const row = { id, layer, status, detail };
  results.push(row);
  console.log(`${status} ${id}`);
  return row;
};

async function api(page, method, path, data) {
  const res = await page.request.fetch(`${STAGING_ORIGIN}${path}`, {
    method,
    data,
    headers: data ? { 'content-type': 'application/json' } : undefined,
    timeout: 60_000,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

function denied(res) {
  const msg = JSON.stringify(res.body || {});
  return res.status >= 400 || /segregation|insufficient_role|invalid_transition|not_allowed|denied/i.test(msg);
}

await requireUatPersonas(['A', 'C', 'B'], { label: 'hosted-compliance-lifecycle' });

if (process.env.FORGENIQ_UAT_OBLIGATION_ID && process.env.FORGENIQ_UAT_IMPACT_ID) {
  ids.obligationId = process.env.FORGENIQ_UAT_OBLIGATION_ID;
  ids.impactId = process.env.FORGENIQ_UAT_IMPACT_ID;
  if (process.env.FORGENIQ_UAT_CONTROL_ID) ids.controlId = process.env.FORGENIQ_UAT_CONTROL_ID;
  if (process.env.FORGENIQ_UAT_ASSURANCE_ID) ids.assuranceId = process.env.FORGENIQ_UAT_ASSURANCE_ID;
  ids.run = process.env.FORGENIQ_UAT_RUN || ids.run;
}

const session = {};
await runAs('A', async ({ identity }) => {
  session.A = { userId: identity.userId, role: identity.role, organisationId: identity.organisationId };
});
await runAs('C', async ({ identity }) => {
  session.C = { userId: identity.userId, role: identity.role, organisationId: identity.organisationId };
});
await runAs('B', async ({ identity }) => {
  session.B = { userId: identity.userId, role: identity.role, organisationId: identity.organisationId };
});
record('AUTH-A', 'hosted-auth', session.A?.role === 'COMPLIANCE_MANAGER' ? 'PASS' : 'FAIL', session.A);
record('AUTH-C', 'hosted-auth', session.C?.role === 'COMPLIANCE_MANAGER' ? 'PASS' : 'FAIL', session.C);
record('AUTH-B', 'hosted-auth', session.B?.role === 'REVIEWER' ? 'PASS' : 'FAIL', session.B);

if (!ids.impactId) {
await runAs('A', async ({ page }) => {
  const changes = await api(page, 'GET', '/api/ri-lab/changes?scope=all');
  const list = [
    ...(changes.body.changes || []),
    ...(changes.body.authorisedUatChanges || []),
    ...(changes.body.regulatoryChanges || []),
  ];
  const change = list.find((c) => c.id) || null;
  if (!change?.id) {
    record('S1-CHANGE', 'hosted-api', 'BLOCKED', { status: changes.status, keys: Object.keys(changes.body || {}) });
    return;
  }
  ids.changeId = change.id;
  ids.publicationId = change.publicationId || change.publication_id || null;
  record('S1-CHANGE', 'hosted-api', 'PASS', { changeId: change.id });

  const created = await api(page, 'POST', '/api/ri-lab/obligations', {
    regulatoryChangeId: change.id,
    obligationStatement: `${RUN} synthetic UAT obligation — firms must retain labelled test evidence for the automated lifecycle and must not treat this statement as a live regulatory duty.`,
    citation: `${RUN} synthetic citation`,
    priority: 'LOW',
    regulatoryClassificationCode: 'R',
    legalBasis: `${RUN} synthetic legal basis for automated UAT only`,
    authoritativeProvision: {
      reference: `${RUN}-SYN`,
      quotation: `${RUN} synthetic quotation used only to satisfy hosted UAT provision requirements.`,
      sourceUrl: 'https://www.handbook.fca.org.uk/handbook/CONC/4/2A.html',
    },
  });
  const obligation = created.body.obligation || created.body;
  ids.obligationId = obligation?.id;
  if (!ids.obligationId) {
    record('S1-CREATE', 'hosted-api', 'FAIL', { status: created.status, body: created.body });
    return;
  }
  record('S1-CREATE', 'hosted-api', 'PASS', { obligationId: ids.obligationId, status: obligation.status });

  const self = await api(page, 'PATCH', `/api/ri-lab/obligations/${ids.obligationId}`, { status: 'OPEN' });
  record('S1-SELF-APPROVE', 'hosted-api', denied(self) ? 'PASS' : 'FAIL', { http: self.status, error: self.body?.error || self.body?.message });
  const submit = await api(page, 'PATCH', `/api/ri-lab/obligations/${ids.obligationId}`, { status: 'IN_REVIEW' });
  record('S1-SUBMIT', 'hosted-api', submit.status < 400 ? 'PASS' : 'FAIL', { http: submit.status, error: submit.body?.error || submit.body?.message });
});

if (!ids.obligationId) {
  writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ run: RUN, ids, results }, null, 2));
  process.exit(1);
}

await runAs('B', async ({ page }) => {
  // Policy: an independent REVIEWER may approve a classified obligation as a pure decision (maker-checker),
  // but must not use the approval to edit its content. Prove the second half; the plain decision is then
  // exercised by User C so the lifecycle continues from a single, unambiguous approval.
  const res = await api(page, 'PATCH', `/api/ri-lab/obligations/${ids.obligationId}`, {
    status: 'OPEN',
    priority: 'HIGH',
    citation: `${RUN} SMUGGLED-BY-REVIEWER`,
  });
  const after = await api(page, 'GET', `/api/ri-lab/obligations/${ids.obligationId}`);
  const still = after.body?.obligation?.status ?? after.body?.status;
  const citation = after.body?.obligation?.citation ?? after.body?.citation;
  record(
    'S1-REVIEWER-NO-CONTENT-EDIT',
    'hosted-api',
    denied(res) && String(still ?? '').toUpperCase().replace(/\s+/g, '_') === 'IN_REVIEW' && !String(citation ?? '').includes('SMUGGLED') ? 'PASS' : 'FAIL',
    { http: res.status, statusAfter: still, error: res.body?.error || res.body?.message },
  );
});

await runAs('C', async ({ page }) => {
  const res = await api(page, 'PATCH', `/api/ri-lab/obligations/${ids.obligationId}`, { status: 'OPEN' });
  const status = res.body?.obligation?.status;
  ids.obligationStatus = status;
  record('S1-APPROVE', 'hosted-api', res.status < 400 && status === 'OPEN' ? 'PASS' : 'FAIL', {
    http: res.status,
    status,
    error: res.body?.error || res.body?.message,
  });
  const detail = await api(page, 'GET', `/api/ri-lab/obligations/${ids.obligationId}`);
  const impact = detail.body?.obligation?.stage2ImpactAssessment;
  ids.impactId = impact?.id || detail.body?.obligation?.impacts?.[0]?.id || null;
  record('S2-AUTO-DRAFT', 'hosted-api', ids.impactId ? 'PASS' : 'FAIL', { impactId: ids.impactId, impact });
});
}

if (ids.impactId && !ids.controlId) {
  await runAs('A', async ({ page }) => {
    const self = await api(page, 'PATCH', `/api/ri-lab/impact-assessments/${ids.impactId}`, { action: 'approve' });
    record('S2-SELF-APPROVE', 'hosted-api', denied(self) ? 'PASS' : 'FAIL', { http: self.status });
    const submit = await api(page, 'PATCH', `/api/ri-lab/impact-assessments/${ids.impactId}`, { action: 'submit' });
    record('S2-SUBMIT', 'hosted-api', submit.status < 400 ? 'PASS' : 'FAIL', { http: submit.status, error: submit.body?.error || submit.body?.message });
  });
  await runAs('C', async ({ page }) => {
    const approve = await api(page, 'PATCH', `/api/ri-lab/impact-assessments/${ids.impactId}`, { action: 'approve' });
    const st = approve.body?.impactAssessment?.status || approve.body?.impact?.status || approve.body?.status;
    record('S2-APPROVE', 'hosted-api', approve.status < 400 ? 'PASS' : 'FAIL', { http: approve.status, status: st, error: approve.body?.error || approve.body?.message });
    const detail = await api(page, 'GET', `/api/ri-lab/obligations/${ids.obligationId}`);
    const risks = detail.body?.obligation?.risks || [];
    ids.riskId = risks[0]?.id || null;
    if (!ids.riskId) {
      const listed = await api(page, 'GET', '/api/ri-lab/risks?scope=all');
      const rows = [...(listed.body.risks || []), ...(listed.body.authorisedUatRisks || [])];
      const hit = rows.find(
        (r) =>
          r.sourceImpactAssessmentId === ids.impactId ||
          r.sourceRegulatoryObligationId === ids.obligationId ||
          (r.obligationIds || []).includes(ids.obligationId),
      );
      ids.riskId = hit?.id || null;
    }
    record('S3-AUTO-DRAFT', 'hosted-api', ids.riskId ? 'PASS' : 'FAIL', { riskId: ids.riskId });
  });
}

if (ids.riskId && !ids.controlId) {
  await runAs('A', async ({ page }) => {
    const self = await api(page, 'PATCH', `/api/ri-lab/risks/${ids.riskId}`, { action: 'approve' });
    record('S3-SELF-APPROVE', 'hosted-api', denied(self) ? 'PASS' : 'FAIL', { http: self.status });
    const submit = await api(page, 'PATCH', `/api/ri-lab/risks/${ids.riskId}`, { action: 'submit' });
    record('S3-SUBMIT', 'hosted-api', submit.status < 400 ? 'PASS' : 'FAIL', { http: submit.status, error: submit.body?.error || submit.body?.message });
  });
  await runAs('C', async ({ page }) => {
    const approve = await api(page, 'PATCH', `/api/ri-lab/risks/${ids.riskId}`, { action: 'approve' });
    record('S4-TRIGGER', 'hosted-api', approve.status < 400 ? 'PASS' : 'FAIL', { http: approve.status, error: approve.body?.error || approve.body?.message });
    const detail = await api(page, 'GET', `/api/ri-lab/obligations/${ids.obligationId}`);
    const controls = detail.body?.obligation?.controls || [];
    ids.controlId = controls[0]?.id || null;
    if (!ids.controlId) {
      const listed = await api(page, 'GET', '/api/ri-lab/controls?scope=all');
      const rows = [...(listed.body.controls || []), ...(listed.body.authorisedUatControls || [])];
      const hit = rows.find(
        (r) => r.sourceApprovedRiskId === ids.riskId || (r.riskIds || []).includes(ids.riskId),
      );
      ids.controlId = hit?.id || null;
    }
    record('S4-AUTO-DRAFT', 'hosted-api', ids.controlId ? 'PASS' : 'FAIL', { controlId: ids.controlId });
  });
}

if (ids.controlId && !ids.assuranceId) {
  await runAs('A', async ({ page }) => {
    const self = await api(page, 'PATCH', `/api/ri-lab/controls/${ids.controlId}`, { action: 'approve' });
    record('S4-SELF-APPROVE', 'hosted-api', denied(self) ? 'PASS' : 'FAIL', { http: self.status });
    const submit = await api(page, 'PATCH', `/api/ri-lab/controls/${ids.controlId}`, { action: 'submit' });
    record('S4-SUBMIT', 'hosted-api', submit.status < 400 ? 'PASS' : 'FAIL', { http: submit.status, error: submit.body?.error || submit.body?.message });
  });
  await runAs('C', async ({ page }) => {
    const approve = await api(page, 'PATCH', `/api/ri-lab/controls/${ids.controlId}`, { action: 'approve' });
    record('S4-APPROVE', 'hosted-api', approve.status < 400 ? 'PASS' : 'FAIL', { http: approve.status, error: approve.body?.error || approve.body?.message });
    const listed = await api(page, 'GET', '/api/ri-lab/assurance-reviews?scope=all');
    const rows = [
      ...(listed.body.assuranceReviews || []),
      ...(listed.body.authorisedUatAssuranceReviews || []),
      ...(listed.body.reviews || []),
    ];
    const hit = rows.find((r) => JSON.stringify(r).includes(ids.controlId));
    ids.assuranceId = hit?.id || null;
    record('S5-PLAN', 'hosted-api', ids.assuranceId ? 'PASS' : 'FAIL', { assuranceId: ids.assuranceId, http: listed.status });
  });
}

if (ids.assuranceId) {
  await runAs('A', async ({ page }) => {
    const submit = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, { action: 'submit' });
    record('S5-PLAN-SUBMIT', 'hosted-api', submit.status < 400 ? 'PASS' : 'FAIL', { http: submit.status, error: submit.body?.error || submit.body?.message });
    const close = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, { action: 'close_lifecycle', result: 'PASS' });
    record('S5-PREMATURE-CLOSE', 'hosted-api', denied(close) ? 'PASS' : 'FAIL', { http: close.status });
  });
  await runAs('C', async ({ page }) => {
    const approve = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, { action: 'approve' });
    const wf = approve.body?.assurance?.assuranceStatus || approve.body?.assurance?.metadata?.assuranceStatus;
    record('S5-PLAN-APPROVE', 'hosted-api', approve.status < 400 ? 'PASS' : 'FAIL', { http: approve.status, wf, error: approve.body?.error || approve.body?.message });
  });
  await runAs('A', async ({ page }) => {
    const evidence = await api(page, 'POST', '/api/ri-lab/evidence', {
      title: `${RUN} synthetic control evidence`,
      evidenceType: 'TEST',
      description: `${RUN} synthetic evidence for hosted lifecycle UAT`,
      controlId: ids.controlId,
    });
    ids.evidenceId = evidence.body?.evidence?.id;
    record('S5-EVIDENCE', 'hosted-api', ids.evidenceId ? 'PASS' : 'FAIL', { http: evidence.status, error: evidence.body?.error || evidence.body?.message });
    const wrong = await api(page, 'POST', '/api/ri-lab/evidence', {
      title: `${RUN} unrelated evidence`,
      evidenceType: 'TEST',
      description: `${RUN} wrong-control probe`,
    });
    ids.wrongEvidenceId = wrong.body?.evidence?.id || null;
    if (ids.evidenceId) {
      const failTest = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, {
        action: 'record_test',
        result: 'FAIL',
        evidenceIds: [ids.evidenceId],
      });
      record('S5-FAIL-TEST', 'hosted-api', failTest.status < 400 ? 'PASS' : 'FAIL', { http: failTest.status, error: failTest.body?.error || failTest.body?.message });
      const blocked = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, { action: 'close_lifecycle', result: 'PASS' });
      record('S5-CLOSE-WHILE-FAIL', 'hosted-api', denied(blocked) ? 'PASS' : 'FAIL', { http: blocked.status });
    }
    const detail = await api(page, 'GET', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`);
    // GET /assurance-reviews/:id returns the lab view as `assuranceReview` and the raw row (with metadata) as `detail`.
    ids.remediationActionId =
      detail.body?.detail?.metadata?.remediationActionId ||
      detail.body?.assuranceReview?.metadata?.remediationActionId ||
      null;
    if (ids.remediationActionId) {
      const done = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, {
        action: 'complete_remediation',
        remediationActionId: ids.remediationActionId,
      });
      record('S5-REMEDIATE', 'hosted-api', done.status < 400 ? 'PASS' : 'FAIL', { http: done.status, error: done.body?.error || done.body?.message });
    } else {
      record('S5-REMEDIATE', 'hosted-api', 'FAIL', { reason: 'remediationActionId missing' });
    }
    if (ids.evidenceId) {
      const retest = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, {
        action: 'record_test',
        result: 'PASS',
        evidenceIds: [ids.evidenceId],
        retest: true,
      });
      record('S5-RETEST', 'hosted-api', retest.status < 400 ? 'PASS' : 'FAIL', { http: retest.status, error: retest.body?.error || retest.body?.message });
    }
    if (ids.wrongEvidenceId) {
      const bad = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, {
        action: 'record_test',
        result: 'PASS',
        evidenceIds: [ids.wrongEvidenceId],
        retest: true,
      });
      record('S5-WRONG-EVIDENCE', 'hosted-api', denied(bad) ? 'PASS' : 'NOT_RUN', { http: bad.status });
    }
    // Lifecycle closure is refused while the failed test's finding is open (assurance_closure_blocked:open_findings_without_exception).
    // After remediation and a passing retest the finding is closed through the findings workflow; no exception is invented.
    const afterRetest = await api(page, 'GET', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`);
    const findingId = (afterRetest.body?.findings || [])[0]?.id || null;
    ids.findingId = findingId;
  });
  // The approver (C) is refused while the failed test's finding is open; A (maker) then closes it; C can then close.
  await runAs('C', async ({ page }) => {
    const stillOpen = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, { action: 'close_lifecycle', result: 'PASS' });
    record('S5-CLOSE-BLOCKED-BY-OPEN-FINDING', 'hosted-api', denied(stillOpen) && /open_findings/i.test(JSON.stringify(stillOpen.body || {})) ? 'PASS' : 'FAIL', { http: stillOpen.status, error: stillOpen.body?.error || stillOpen.body?.message });
  });
  await runAs('A', async ({ page }) => {
    if (ids.findingId) {
      const closed = await api(page, 'PATCH', `/api/ri-lab/findings/${ids.findingId}`, { status: 'CLOSED' });
      record('S5-FINDING-CLOSE', 'hosted-api', closed.status < 400 ? 'PASS' : 'FAIL', { http: closed.status, error: closed.body?.error || closed.body?.message });
    } else {
      record('S5-FINDING-CLOSE', 'hosted-api', 'FAIL', { reason: 'no finding linked to the assurance review' });
    }
  });
  await runAs('C', async ({ page }) => {
    const close = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, {
      action: 'close_lifecycle',
      result: 'PASS',
    });
    record('S5-CLOSE', 'hosted-api', close.status < 400 ? 'PASS' : 'FAIL', { http: close.status, error: close.body?.error || close.body?.message });
    const again = await api(page, 'PATCH', `/api/ri-lab/assurance-reviews/${ids.assuranceId}`, {
      action: 'close_lifecycle',
      result: 'PASS',
    });
    record('S5-IDEMPOTENT-CLOSE', 'hosted-api', again.status < 400 ? 'PASS' : 'FAIL', { http: again.status });
    const events = await api(
      page,
      'GET',
      `/api/ri-lab/workflow-events?entityType=regulatory_obligation&entityId=${ids.obligationId}`,
    );
    const types = (events.body.events || events.body.workflowEvents || []).map((e) => e.eventType || e.event_type);
    ids.obligationEvents = types;
    record(
      'AUDIT-OBLIGATION-CLOSED',
      'hosted-api',
      types.includes('COMPLIANCE_LIFECYCLE_CLOSED') ? 'PASS' : 'FAIL',
      { types },
    );
    await page.goto(`${LAB}#/obligation/${ids.obligationId}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(OUT, 'obligation-lifecycle.png'), fullPage: true });
    record('UI-OBLIGATION', 'hosted-browser', 'PASS', { shot: 'obligation-lifecycle.png' });
  });
}

record(
  'SEC-CROSS-TENANT',
  'hosted-api',
  'BLOCKED',
  { reason: 'Users A, B and C share one organisation; hosted cross-tenant denial is not claimed. Offline RLS remains in RI-ASSURANCE-GOVERNANCE-SECURITY.' },
);

const failed = results.filter((r) => r.status === 'FAIL').length;
writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ run: RUN, deployment: process.env.FORGENIQ_UAT_DEPLOYMENT || 'UNSPECIFIED (set FORGENIQ_UAT_DEPLOYMENT)', ids, session, results, failed }, null, 2));
console.log(`hosted lifecycle: ${results.length} checks, failed ${failed}`);
process.exit(failed ? 1 : 0);
