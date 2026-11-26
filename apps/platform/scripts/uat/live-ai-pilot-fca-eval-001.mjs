#!/usr/bin/env node
/**
 * FCA-EVAL-001 (CONC 7.20.1R) live five-stage AI pilot runner. ONE authorised paid pilot, staging only.
 *
 *   node scripts/uat/live-ai-pilot-fca-eval-001.mjs <phase>
 *
 * Phases (each writes evidence under docs/uat/evidence/live-ai-pilot-2026-11-26/ and updates state.json):
 *   posture   read-only: confirm the running deployment's live-AI posture through the authenticated readiness API
 *   stage1    create a labelled UAT change and run ONE UC-RI-005 extraction (paid). Refuses to run twice.
 *   (later phases are added as each stage is reached)
 *
 * Safety: every paid trigger first writes a `wx` marker file, so a second invocation can never repeat it. There are
 * no retries. Sessions are the saved synthetic UAT personas A/B/C; nothing here reads or prints session material.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';
import { assertExtractionOutputBudget, estimateStructuredOutputTokens } from '../../lib/ri/ai/extraction-output-preflight.mjs';

export const PUBLICATION_ID = '829c5472-953a-40ff-9628-947afbfe4e7a';
export const RUN_REFERENCE = 'pilot-fca-eval-001-2026-11-26';
export const TARGET_CORES = ['7.20.1R'];
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
export const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'uat', 'evidence', 'live-ai-pilot-2026-11-26');
const STATE_PATH = join(EVIDENCE_DIR, 'state.json');
const MARKER_DIR = join(process.env.LOCALAPPDATA || '.', 'forgeniq-uat-sessions');
mkdirSync(EVIDENCE_DIR, { recursive: true });

export function loadState() {
  return existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : { runReference: RUN_REFERENCE, publicationId: PUBLICATION_ID, ids: {}, phases: {} };
}
export function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}
export function writeEvidence(name, payload) {
  writeFileSync(join(EVIDENCE_DIR, `${name}.json`), JSON.stringify(payload, null, 2));
}

/** Writes a once-only marker. Throws if it already exists, so a paid trigger can never be repeated by re-running a phase. */
export function claimPaidTrigger(name, detail = '') {
  mkdirSync(MARKER_DIR, { recursive: true });
  const path = join(MARKER_DIR, `${RUN_REFERENCE}.${name}.started`);
  if (existsSync(path)) throw new Error(`no_retry: paid trigger "${name}" was already started (${path})`);
  writeFileSync(path, `${new Date().toISOString()} ${detail}\n`, { flag: 'wx' });
  return path;
}

export async function api(page, method, path, body) {
  const res = await page.request.fetch(`${STAGING_ORIGIN}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    data: body === undefined ? undefined : JSON.stringify(body),
    timeout: 330_000,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status(), body: json, raw: json ? undefined : text.slice(0, 300) };
}

/** Expected pilot posture on the running deployment. */
export function evaluatePosture(posture) {
  const p = posture || {};
  const checks = {
    executionEnabled: p.executionEnabled === true,
    providerModeAnthropic: p.providerMode === 'ANTHROPIC',
    stage2to5Live: ['stage2', 'stage3', 'stage4', 'stage5'].every((s) => p.stageModes?.[s] === 'live'),
    anthropicKeyPresent: p.anthropicKeyPresent === true,
    modelIsSonnet55: p.model === 'claude-sonnet-5-5' && p.modelPriced === true,
    budgetIs075: p.budgetUsd === 0.75,
    maxRequestsIs8: p.maxRequests === 8,
    scopeIsPilotLedger: p.spendScope === 'forgeniq-lab-anthropic',
    ledgerRouteConfigured: ['postgres', 'supabase_rpc'].includes(p.ledgerRoute),
    exactlyOneRunReference: p.authorisedRunReferences === 1,
    timeoutAtLeast120s: Number(p.timeoutMs) >= 120_000,
  };
  return { checks, pass: Object.values(checks).every(Boolean) };
}

export async function readPosture(page) {
  const res = await api(page, 'GET', '/api/ri-lab/readiness');
  const ai = res.body?.operationalReadiness?.components?.find((c) => c.id === 'ai_runtime');
  return { http: res.status, state: ai?.state ?? null, summary: ai?.summary ?? null, posture: ai?.diagnostics?.livePosture ?? null, diagnostics: ai?.diagnostics ? { ...ai.diagnostics, livePosture: undefined } : null };
}

const phase = process.argv[2];

async function phasePosture() {
  await requireUatPersonas(['A'], { label: 'pilot-posture' });
  return runAs('A', async ({ page, identity }) => {
    const read = await readPosture(page);
    const evaluated = evaluatePosture(read.posture);
    const out = { phase: 'posture', at: new Date().toISOString(), origin: STAGING_ORIGIN, role: identity.role, http: read.http, aiRuntimeState: read.state, posture: read.posture, ...evaluated };
    writeEvidence(`posture-${new Date().toISOString().replace(/[:.]/g, '-')}`, out);
    console.log(JSON.stringify({ pass: out.pass, checks: out.checks, posture: out.posture }, null, 2));
    return out;
  });
}

async function phaseStage1() {
  const state = loadState();
  await requireUatPersonas(['A'], { label: 'pilot-stage1' });
  return runAs('A', async ({ page, identity, act }) => {
    const read = await readPosture(page);
    const evaluated = evaluatePosture(read.posture);
    if (!evaluated.pass) {
      writeEvidence('stage1-aborted-posture', { at: new Date().toISOString(), posture: read.posture, ...evaluated });
      throw new Error(`posture_check_failed: ${JSON.stringify(evaluated.checks)}`);
    }
    const preflight = assertExtractionOutputBudget({
      estimateTokens: estimateStructuredOutputTokens({ provisionCount: TARGET_CORES.length, sectionCount: 6 }),
      maxOutputTokens: 8192,
    });
    if (!preflight.ok) throw new Error(`output_budget_preflight_failed: ${preflight.code}`);

    if (!state.ids.changeId) {
      const created = await act('create labelled UAT change', () =>
        api(page, 'POST', '/api/ri-lab/changes', {
          publicationId: PUBLICATION_ID,
          title: 'FCA-EVAL-001 live AI pilot — CONC 7.20.1R (synthetic UAT, 2026-11-26)',
          description: 'Synthetic UAT change created for the FORGENIQ live five-stage AI pilot. Not a customer compliance decision.',
          changeType: 'Policy update',
          creationMode: 'uat_authorised',
        }),
      );
      if (created.status !== 201 || !created.body?.change?.id) {
        throw new Error(`change_create_failed: ${created.status} ${JSON.stringify(created.body ?? created.raw).slice(0, 300)}`);
      }
      state.ids.changeId = created.body.change.id;
      state.changeCreated = { at: new Date().toISOString(), by: identity.userId, body: created.body.change };
      saveState(state);
    }

    // ---- the single paid UC-RI-005 request ----
    claimPaidTrigger('stage1', `change=${state.ids.changeId}`);
    const started = Date.now();
    const trigger = await act('trigger live UC-RI-005 extraction', () =>
      api(page, 'POST', '/api/ri-lab/ai-analysis-runs', {
        publicationId: PUBLICATION_ID,
        useCaseId: 'UC-RI-005',
        targetEntityId: state.ids.changeId,
        idempotencyKeySuffix: RUN_REFERENCE,
        extractionBatchIndex: 0,
        maxSectionsPerBatch: 6,
        targetProvisionCores: TARGET_CORES,
      }),
    );
    state.phases.stage1 = { triggeredAt: new Date(started).toISOString(), http: trigger.status, trigger: trigger.body ?? trigger.raw };
    saveState(state);
    if (!trigger.body?.runId) throw new Error(`trigger_failed: ${trigger.status} ${JSON.stringify(trigger.body ?? trigger.raw).slice(0, 400)}`);
    if (trigger.body.reused) throw new Error('unexpected_reuse: the run reference was already used; no paid call was made by this trigger');
    state.ids.stage1RunId = trigger.body.runId;
    saveState(state);

    let detail = null;
    const deadline = Date.now() + 340_000;
    while (Date.now() < deadline) {
      const polled = await api(page, 'GET', `/api/ri-lab/ai-analysis-runs/${trigger.body.runId}`);
      detail = polled.body;
      const status = String(detail?.aiAnalysisRun?.executionStatus || detail?.detail?.execution_status || '').toUpperCase();
      if (['COMPLETED', 'FAILED', 'VALIDATION_FAILED'].includes(status)) break;
      await new Promise((r) => setTimeout(r, 4000));
    }
    const status = String(detail?.aiAnalysisRun?.executionStatus || detail?.detail?.execution_status || '').toUpperCase();
    const elapsedMs = Date.now() - started;
    const out = { phase: 'stage1', at: new Date().toISOString(), runId: trigger.body.runId, status, elapsedMs, trigger: trigger.body, run: detail };
    writeEvidence('stage1-run-raw', out);
    state.phases.stage1 = { ...state.phases.stage1, completedAt: out.at, status, elapsedMs, runId: trigger.body.runId };
    saveState(state);
    console.log(JSON.stringify({ runId: trigger.body.runId, status, elapsedMs }, null, 2));
    if (status !== 'COMPLETED') process.exitCode = 3;
    return out;
  });
}

// Verbatim from PS26/1 Annex F (FCA 2026/2) PDF p.95, verified against the independent PDF text before submission.
const REVIEW1_QUOTATION =
  '(2) As soon as possible after a missed payment has occurred the firm must: (a) notify the borrower: (i) that the missed payment has occurred; and (ii) about any sums which have become payable under the regulated deferred payment credit agreement but remain unpaid';
const REVIEW1_PAGE = 95;

/** Synthetic UAT human review of the stage 1 findings (persona B). Not a regulatory expert judgement. */
async function phaseReview1() {
  const state = loadState();
  if (!state.ids.stage1RunId) throw new Error('stage1 has not produced a run');
  if (state.ids.reviewId) throw new Error('review1 already submitted');
  const { quotationFoundOnPages, loadPdfPages } = await import('./pilot-source-text.mjs');
  const source = await loadPdfPages();
  await requireUatPersonas(['B'], { label: 'pilot-review1' });
  return runAs('B', async ({ page, identity, act }) => {
    const runId = state.ids.stage1RunId;
    const view = await api(page, 'GET', `/api/ri-lab/ai-analysis-runs/${runId}/findings`);
    writeEvidence('stage1-findings-view', { at: new Date().toISOString(), reviewer: identity.userId, status: view.status, body: view.body });
    const findings = view.body?.findings || [];
    if (findings.length !== 1) throw new Error(`expected exactly 1 finding, got ${findings.length}`);
    const f = findings[0];
    const aiQuote = f.suggestion?.sourceQuotation || '';
    const aiQuoteCheck = await quotationFoundOnPages(aiQuote.replace(/^7\.20\.1\s*R\s*/i, ''), [94, 95]);
    const reviewQuoteCheck = await quotationFoundOnPages(REVIEW1_QUOTATION, [REVIEW1_PAGE]);
    const checks = { sourceHashMatchesStaged: source.hashMatchesStaged, aiQuotationVerifiedInFcaSource: aiQuoteCheck.found, reviewQuotationVerifiedOnP95: reviewQuoteCheck.found };
    writeEvidence('stage1-quotation-verification', { at: new Date().toISOString(), aiQuote, aiQuoteCheck, reviewQuotation: REVIEW1_QUOTATION, reviewQuoteCheck, checks });
    if (!checks.sourceHashMatchesStaged || !reviewQuoteCheck.found) throw new Error(`quotation_not_verified: ${JSON.stringify(checks)}`);
    const decision = {
      findingId: f.findingId,
      claimTextSha256: f.claimTextSha256,
      decision: 'ACCEPTED',
      regulatoryClassificationCode: 'R',
      provisionFunction: 'OPERATIVE_REQUIREMENT',
      disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
      provisionReference: 'CONC 7.20.1R',
      legalBasis:
        'FCA Handbook CONC 7.20.1R, inserted by the Consumer Credit (Deferred Payment Credit) Instrument 2026 (FCA 2026/2), PS26/1 Annex F',
      reclassificationEvidence: 'Quoted text is CONC 7.20.1R(2), a rule (R) set out as new text in the legal instrument on PDF p.95.',
      quotation: REVIEW1_QUOTATION,
      quotationPage: REVIEW1_PAGE,
      obligationStatement: REVIEW1_QUOTATION,
      comment:
        'SYNTHETIC UAT DECISION (automated persona B, not a professional judgement). The AI quotation covered only the 7.20.1R(1) applicability limb; the operative duty text was replaced by a verbatim p.95 quotation verified against the independent FCA PDF text. Draft only; PENDING_HUMAN_REVIEW for regulatory accuracy.',
    };
    const posted = await act('submit stage 1 synthetic review', () =>
      api(page, 'POST', `/api/ri-lab/ai-analysis-runs/${runId}/findings`, { notes: 'FCA-EVAL-001 live pilot — synthetic UAT review (persona B)', decisions: [decision] }),
    );
    writeEvidence('stage1-review-response', { at: new Date().toISOString(), status: posted.status, body: posted.body ?? posted.raw, decision });
    console.log(JSON.stringify({ status: posted.status, body: posted.body ?? posted.raw }, null, 2));
    if (posted.status !== 200 || posted.body?.ok !== true) {
      process.exitCode = 4;
      return posted;
    }
    state.ids.reviewId = posted.body.reviewId ?? null;
    state.ids.obligationId = (posted.body.materialised || []).map((m) => m.obligationId).filter(Boolean)[0] ?? null;
    state.phases.review1 = { at: new Date().toISOString(), reviewer: identity.userId, reviewId: state.ids.reviewId, obligationId: state.ids.obligationId };
    saveState(state);
    return posted;
  });
}

const normStatus = (s) => String(s ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');

/** Stage 2: maker A submits the synthetic obligation; independent checker C approves to OPEN, which runs ONE live UC-RI-004. */
async function phaseStage2() {
  const state = loadState();
  const obligationId = state.ids.obligationId;
  if (!obligationId) throw new Error('no obligation from review1');
  if (state.phases.stage2?.submittedBy) {
    /* resume: submission already done */
  } else {
    await requireUatPersonas(['A'], { label: 'pilot-stage2-submit' });
    await runAs('A', async ({ page, identity, act }) => {
      const cur = await api(page, 'GET', `/api/ri-lab/obligations/${obligationId}`);
      const ob = cur.body?.obligation;
      if (normStatus(ob?.status) !== 'DRAFT') throw new Error(`obligation not DRAFT: ${ob?.status}`);
      const res = await act('submit obligation IN_REVIEW', () =>
        api(page, 'PATCH', `/api/ri-lab/obligations/${obligationId}`, { status: 'IN_REVIEW', expectedUpdatedAt: ob.updatedAt }),
      );
      writeEvidence('stage2-submit-response', { at: new Date().toISOString(), actor: identity.userId, status: res.status, body: res.body ?? res.raw });
      if (res.status !== 200 || normStatus(res.body?.obligation?.status) !== 'IN_REVIEW') throw new Error(`submit_failed: ${res.status} ${JSON.stringify(res.body ?? res.raw).slice(0, 300)}`);
      state.phases.stage2 = { submittedBy: identity.userId, submittedAt: new Date().toISOString() };
      saveState(state);
    });
  }
  await requireUatPersonas(['C'], { label: 'pilot-stage2-approve' });
  return runAs('C', async ({ page, identity, act }) => {
    const read = await readPosture(page);
    const evaluated = evaluatePosture(read.posture);
    if (!evaluated.pass) throw new Error(`posture_check_failed: ${JSON.stringify(evaluated.checks)}`);
    const cur = await api(page, 'GET', `/api/ri-lab/obligations/${obligationId}`);
    const ob = cur.body?.obligation;
    if (normStatus(ob?.status) !== 'IN_REVIEW') throw new Error(`obligation not IN_REVIEW: ${ob?.status}`);
    claimPaidTrigger('stage2', `obligation=${obligationId}`);
    const started = Date.now();
    const res = await act('approve obligation to OPEN (live UC-RI-004)', () =>
      api(page, 'PATCH', `/api/ri-lab/obligations/${obligationId}`, { status: 'OPEN', expectedUpdatedAt: ob.updatedAt }),
    );
    const elapsedMs = Date.now() - started;
    const after = await api(page, 'GET', `/api/ri-lab/obligations/${obligationId}`);
    writeEvidence('stage2-approve-response', { at: new Date().toISOString(), actor: identity.userId, elapsedMs, status: res.status, body: res.body ?? res.raw, after: after.body });
    state.phases.stage2 = { ...state.phases.stage2, approvedBy: identity.userId, approvedAt: new Date().toISOString(), http: res.status, elapsedMs };
    const impact = after.body?.obligation?.stage2ImpactAssessment ?? after.body?.obligation?.impacts?.[0] ?? null;
    state.ids.impactId = impact?.id ?? null;
    saveState(state);
    console.log(JSON.stringify({ http: res.status, obligationStatus: after.body?.obligation?.status, impactId: state.ids.impactId, elapsedMs, impactKeys: impact ? Object.keys(impact) : null }, null, 2));
    return res;
  });
}

function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return undefined;
  if (key in obj && obj[key] !== undefined) return obj[key];
  for (const v of Object.values(obj)) {
    const found = findKey(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Generic lifecycle stage: A submits the parent draft, C approves it, which runs ONE live next-stage call. */
function lifecycleStage({ n, label, useCase, path, parentId, childKey, childIdName }) {
  return async function phase() {
    const state = loadState();
    const id = state.ids[parentId];
    if (!id) throw new Error(`missing ${parentId}`);
    const key = `stage${n}`;
    const url = `${path}/${id}`;
    if (!state.phases[key]?.submittedBy) {
      await requireUatPersonas(['A'], { label: `pilot-${key}-submit` });
      await runAs('A', async ({ page, identity, act }) => {
        const cur = await api(page, 'GET', url);
        const status = normStatus(findKey(cur.body, 'status'));
        if (status !== 'DRAFT') throw new Error(`${label} not DRAFT: ${status}`);
        const res = await act(`submit ${label}`, () => api(page, 'PATCH', url, { action: 'submit', expectedUpdatedAt: findKey(cur.body, 'updatedAt') }));
        writeEvidence(`${key}-submit-response`, { at: new Date().toISOString(), actor: identity.userId, status: res.status, body: res.body ?? res.raw });
        const after = normStatus(findKey(res.body, 'status'));
        if (res.status !== 200 || !['IN_REVIEW', 'SUBMITTED', 'PENDING_APPROVAL'].includes(after)) throw new Error(`submit_failed: ${res.status} status=${after} ${JSON.stringify(res.body ?? res.raw).slice(0, 300)}`);
        state.phases[key] = { ...(state.phases[key] || {}), submittedBy: identity.userId, submittedAt: new Date().toISOString(), statusAfterSubmit: after };
        saveState(state);
      });
    }
    await requireUatPersonas(['C'], { label: `pilot-${key}-approve` });
    return runAs('C', async ({ page, identity, act }) => {
      const read = await readPosture(page);
      const evaluated = evaluatePosture(read.posture);
      if (!evaluated.pass) throw new Error(`posture_check_failed: ${JSON.stringify(evaluated.checks)}`);
      const cur = await api(page, 'GET', url);
      claimPaidTrigger(key, `${parentId}=${id}`);
      const started = Date.now();
      const res = await act(`approve ${label} (live ${useCase})`, () => api(page, 'PATCH', url, { action: 'approve', expectedUpdatedAt: findKey(cur.body, 'updatedAt') }));
      const elapsedMs = Date.now() - started;
      const after = await api(page, 'GET', url);
      writeEvidence(`${key}-approve-response`, { at: new Date().toISOString(), actor: identity.userId, elapsedMs, status: res.status, body: res.body ?? res.raw, after: after.body });
      const childIds = findKey(after.body, childKey) || [];
      state.ids[childIdName] = Array.isArray(childIds) ? childIds[0] ?? null : null;
      state.phases[key] = { ...state.phases[key], approvedBy: identity.userId, approvedAt: new Date().toISOString(), http: res.status, elapsedMs, parentStatus: normStatus(findKey(after.body, 'status')), childIds };
      saveState(state);
      console.log(JSON.stringify({ http: res.status, parentStatus: state.phases[key].parentStatus, [childIdName]: state.ids[childIdName], childIds, elapsedMs }, null, 2));
      return res;
    });
  };
}

/** Assurance plan governance only (NO AI call): A submits, C approves to TESTING_READY. No tests recorded, no closure. */
async function phaseAssurance() {
  const state = loadState();
  const id = state.ids.assuranceId;
  if (!id) throw new Error('missing assuranceId');
  const url = `/api/ri-lab/assurance-reviews/${id}`;
  const steps = {};
  await requireUatPersonas(['A'], { label: 'pilot-assurance-submit' });
  await runAs('A', async ({ page, identity, act }) => {
    const cur = await api(page, 'GET', url);
    const res = await act('submit assurance plan', () =>
      api(page, 'PATCH', url, { action: 'submit', expectedUpdatedAt: cur.body?.detail?.updated_at ?? null }),
    );
    steps.submit = { actor: identity.userId, status: res.status, body: res.body ?? res.raw };
  });
  writeEvidence('assurance-submit-response', steps.submit);
  if (steps.submit.status !== 200) throw new Error(`submit_failed: ${JSON.stringify(steps.submit).slice(0, 400)}`);
  await requireUatPersonas(['C'], { label: 'pilot-assurance-approve' });
  await runAs('C', async ({ page, identity, act }) => {
    const cur = await api(page, 'GET', url);
    const res = await act('approve assurance plan to TESTING_READY', () =>
      api(page, 'PATCH', url, { action: 'approve', expectedUpdatedAt: cur.body?.detail?.updated_at ?? null }),
    );
    steps.approve = { actor: identity.userId, status: res.status, body: res.body ?? res.raw };
    const after = await api(page, 'GET', url);
    steps.after = { status: after.status, body: after.body };
  });
  writeEvidence('assurance-approve-response', steps);
  state.phases.assurance = { at: new Date().toISOString(), submitStatus: steps.submit.status, approveStatus: steps.approve.status, submittedBy: steps.submit.actor, approvedBy: steps.approve.actor };
  saveState(state);
  console.log(JSON.stringify({ submit: steps.submit.status, approve: steps.approve.status, assuranceStatus: steps.after?.body?.detail?.metadata?.assuranceStatus, result: steps.after?.body?.detail?.result }, null, 2));
}

const phases = {
  assurance: phaseAssurance,
  posture: phasePosture,
  stage1: phaseStage1,
  review1: phaseReview1,
  stage2: phaseStage2,
  stage3: lifecycleStage({ n: 3, label: 'impact assessment', useCase: 'UC-RI-006', path: '/api/ri-lab/impact-assessments', parentId: 'impactId', childKey: 'riskIds', childIdName: 'riskId' }),
  stage4: lifecycleStage({ n: 4, label: 'risk', useCase: 'UC-RI-007', path: '/api/ri-lab/risks', parentId: 'riskId', childKey: 'controlIds', childIdName: 'controlId' }),
  stage5: lifecycleStage({ n: 5, label: 'control', useCase: 'UC-RI-008', path: '/api/ri-lab/controls', parentId: 'controlId', childKey: 'assuranceReviewIds', childIdName: 'assuranceId' }),
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!phases[phase]) {
    console.error(`usage: live-ai-pilot-fca-eval-001.mjs <${Object.keys(phases).join('|')}>`);
    process.exit(2);
  }
  await phases[phase]();
}
