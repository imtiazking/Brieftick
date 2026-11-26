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

const phases = { posture: phasePosture, stage1: phaseStage1 };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!phases[phase]) {
    console.error(`usage: live-ai-pilot-fca-eval-001.mjs <${Object.keys(phases).join('|')}>`);
    process.exit(2);
  }
  await phases[phase]();
}
