#!/usr/bin/env node
/**
 * UC-RI-005 run finalisation when the requester's Supabase JWT expires during the provider call
 * (staging run 9ba58a3e: Anthropic call ~105 s, Clerk session token ~60 s → "JWT expired", run left RUNNING).
 * Real requestPublicationAnalysis / submitAnalysisReview / finaliser / provenance on Node type stripping,
 * fixture provider, in-memory Supabase stand-in with separate user (expiring) and service-role clients.
 * Also checks the Anthropic provider returns response metadata (no text) on success and failure.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfStub = `
export async function buildPdfGroundedAnalysisContext() {
  return { ok: true, sourceSections: [{ sourceSectionId: 'p1', citation: 'PDF p.1', text: 'Firms must assess payment fraud risk.' }], allowedSectionIds: ['p1'], grounding: {} };
}`;
const adminStub = `export function createSupabaseAdminClient() { return globalThis.__adminClient ?? null; }`;
const hook = `
const pdfStub = ${JSON.stringify(pdfStub)};
const adminStub = ${JSON.stringify(adminStub)};
const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.endsWith('build-pdf-grounded-analysis-context.mjs')) {
    return { url: 'data:text/javascript,' + encodeURIComponent(pdfStub), shortCircuit: true };
  }
  if (specifier === '@/lib/supabase/admin') {
    return { url: 'data:text/javascript,' + encodeURIComponent(adminStub), shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

process.env.RI_AI_EXECUTION_ENABLED = 'true';
process.env.RI_AI_PROVIDER_MODE = 'FIXTURE';
process.env.RI_LAB_ANTHROPIC_MAX_USD = '1.00';
// The provider refuses live execution without a shared spend ledger; use the in-process ledger (mocked HTTP, nothing billed).
process.env.RI_LAB_SPEND_GUARD_MODE = 'memory';

const logs = [];
for (const level of ['info', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    if (line.startsWith('[ri-ai]')) logs.push(line);
    else orig(...args);
  };
}

const { requestPublicationAnalysis, submitAnalysisReview } = await import('../lib/ri/services/ai-analysis.ts');
const { createAiRunFinaliser } = await import('../lib/ri/services/ai-run-finaliser.ts');
const { classifyAiAnalysisRunForLab } = await import('../lib/ri/lab-api/ai-run-lab-provenance.ts');
const { createAnthropicProvider } = await import('../lib/ri/ai/anthropic-provider-core.mjs');

const ORG = 'b8f5e3a1-00ad-4000-8000-000000000001';
const OTHER_ORG = 'c0000000-0000-4000-8000-000000000002';
const PUB = 'ec168f48-1717-4631-8e4a-a3e95df4d5ce';
const VER = 'af28173b-f446-450b-a390-e645a554e524';
const CHANGE = '0ffaad3f-9b83-4728-b991-9bfb5d50e632';
const GMAIL = 'user_gmail';
const YAHOO = 'user_yahoo';

let tables;
let idSeq = 0;
function resetTables() {
  tables = {
    regulatory_changes: [{ id: CHANGE, organisation_id: ORG, publication_id: PUB }],
    applicability_assessments: [
      { id: 'app-1', organisation_id: ORG, publication_id: PUB, status: 'APPROVED', recommendation: 'APPLICABLE', created_at: '2026-11-20T21:21:04Z', updated_at: '2026-11-21T00:37:31Z' },
    ],
    regulatory_publication_versions: [{ id: VER, publication_id: PUB, version_number: 1, retrieved_at: '2026-11-01T00:00:00Z' }],
    regulatory_publications: [{ id: PUB, title: 'FG24/6' }],
    ai_analysis_runs: [],
    ai_analysis_citations: [],
    workflow_events: [],
    notification_events: [],
  };
}

const JWT_EXPIRED = { code: 'PGRST301', message: 'JWT expired' };

/** who: 'user' (session JWT, expires once the overlap check has run) or 'service' (never expires). */
function makeClient(who, session) {
  const query = (table) => {
    tables[table] ??= [];
    const filters = [];
    let op = 'select';
    let payload = null;
    let limitN = null;
    let isOverlapCheck = false;
    const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
    const run = async () => {
      await new Promise((r) => setImmediate(r));
      if (who === 'user' && session.expired) return { data: null, error: JWT_EXPIRED };
      session.calls.push(`${who}:${op}:${table}`);
      let out;
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        out = [];
        for (const body of list) {
          const row = { id: `${table}-${++idSeq}`, created_at: new Date().toISOString(), ...body };
          if (table === 'ai_analysis_runs') {
            const dup = tables.ai_analysis_runs.some(
              (r) => r.organisation_id === row.organisation_id && (r.idempotency_key === row.idempotency_key || (r.execution_status === 'RUNNING' && row.execution_status === 'RUNNING')),
            );
            if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          tables[table].push(row);
          out.push(row);
        }
      } else if (op === 'update') {
        out = rows();
        for (const r of out) Object.assign(r, payload);
      } else {
        const hit = rows();
        out = limitN == null ? hit : hit.slice(0, limitN);
      }
      if (who === 'user' && isOverlapCheck && session.expireAfterOverlapCheck) session.expired = true;
      return { data: out, error: null };
    };
    const builder = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return (res, rej) => run().then(res, rej);
          if (prop === 'insert' || prop === 'upsert') return (b) => ((op = 'insert'), (payload = b), builder);
          if (prop === 'update') return (b) => ((op = 'update'), (payload = b), builder);
          if (prop === 'eq') return (c, v) => (filters.push((r) => r[c] === v), builder);
          if (prop === 'neq')
            return (c, v) => ((isOverlapCheck = table === 'ai_analysis_runs'), filters.push((r) => r[c] !== v), builder);
          if (prop === 'in') return (c, vs) => (filters.push((r) => vs.includes(r[c])), builder);
          if (prop === 'is') return (c, v) => (filters.push((r) => (r[c] ?? null) === v), builder);
          if (prop === 'limit') return (n) => ((limitN = n), builder);
          if (prop === 'single')
            return async () => {
              const { data, error } = await run();
              if (error) return { data: null, error };
              const list = Array.isArray(data) ? data : [];
              return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { message: 'no_single_row' } };
            };
          if (prop === 'maybeSingle')
            return async () => {
              const { data, error } = await run();
              if (error) return { data: null, error };
              return { data: (Array.isArray(data) ? data[0] : null) ?? null, error: null };
            };
          return () => builder;
        },
      },
    );
    return builder;
  };
  return { from: (t) => query(t) };
}

const failures = [];
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};
const check = (cond, m, detail) => (cond ? pass(m) : fail(`${m}${detail ? ` — ${detail}` : ''}`));

function scenario({ serviceRole, suffix }) {
  resetTables();
  logs.length = 0;
  process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX = suffix;
  const session = { expired: false, expireAfterOverlapCheck: true, calls: [] };
  const user = makeClient('user', session);
  globalThis.__adminClient = serviceRole ? makeClient('service', session) : null;
  const request = (extra = {}) =>
    requestPublicationAnalysis(user, {
      organisationId: ORG,
      userId: GMAIL,
      role: 'COMPLIANCE_MANAGER',
      publicationId: PUB,
      publicationVersionId: VER,
      useCaseId: 'UC-RI-005',
      targetEntityId: CHANGE,
      idempotencyKeySuffix: suffix,
      ...extra,
    });
  return { session, user, request };
}
const runEvents = (runId) => tables.workflow_events.filter((e) => e.entity_id === runId).map((e) => e.event_type);

// 1. JWT expires during the provider call; service role finalises the run.
{
  const { session, request } = scenario({ serviceRole: true, suffix: 'fin-1' });
  let out;
  try {
    out = await request();
  } catch (e) {
    out = { thrown: e.message };
  }
  const run = tables.ai_analysis_runs[0];
  check(session.expired, 'user JWT expired between the overlap check and the end of the provider call');
  check(out?.ok === true && !out.thrown, 'request succeeds although the user JWT expired', JSON.stringify(out));
  check(run?.execution_status === 'COMPLETED' && run.latency_ms != null && run.completed_at, 'run finalised COMPLETED with latency and completion time', run?.execution_status);
  check(tables.ai_analysis_citations.length > 0 && tables.ai_analysis_citations.every((c) => c.analysis_run_id === run.id && c.organisation_id === ORG), `citations persisted for this run and organisation (${tables.ai_analysis_citations.length})`);
  check(JSON.stringify(runEvents(run.id)) === JSON.stringify(['AI_ANALYSIS_REQUESTED', 'AI_ANALYSIS_COMPLETED']), 'audit trail REQUESTED → COMPLETED', JSON.stringify(runEvents(run.id)));
  const completedEvent = tables.workflow_events.find((e) => e.event_type === 'AI_ANALYSIS_COMPLETED');
  check(completedEvent?.actor_user_id === GMAIL, 'completion event still attributed to the requester (Gmail)');
  check(session.calls.filter((c) => c.startsWith('service:')).every((c) => /ai_analysis_runs|ai_analysis_citations|workflow_events|notification_events/.test(c)), 'service role only touched the run, its citations and events');
  check(logs.some((l) => l.startsWith('[ri-ai] provider_returned') && l.includes(run.id)), 'provider outcome logged with the run ID before any write');
}

// 2. No service role available: failure is loud, logged with the provider outcome, and never re-runs.
{
  const { session, request } = scenario({ serviceRole: false, suffix: 'fin-2' });
  let thrown = null;
  try {
    await request();
  } catch (e) {
    thrown = e.message;
  }
  const run = tables.ai_analysis_runs[0];
  check(thrown?.startsWith('ai_run_finalisation_failed:run_update:JWT expired'), 'write failure is raised, not silently ignored', thrown);
  const line = logs.find((l) => l.startsWith('[ri-ai] run_finalisation_failed'));
  check(line && line.includes(run.id) && line.includes('"usesServiceRole":false') && line.includes('JWT expired'), 'run_finalisation_failed logged with run ID, provider outcome and error');
  check(line && !line.includes('Firms must assess'), 'logged outcome contains no document or model text');
  check(run?.execution_status === 'RUNNING', 'run row retained (left RUNNING for operator resolution, not deleted)');
  const before = tables.ai_analysis_runs.length;
  // The user retries later with a fresh session token.
  session.expired = false;
  session.expireAfterOverlapCheck = false;
  const again = await scenarioReuse(request);
  check(again?.reused === true && again.runId === run.id && tables.ai_analysis_runs.length === before, 'same reference afterwards → existing run returned, no new provider call', JSON.stringify(again));
}
async function scenarioReuse(request) {
  try {
    return await request();
  } catch (e) {
    return { thrown: e.message };
  }
}

// 3. Provider failure path is finalised FAILED with its audit event.
{
  const { request } = scenario({ serviceRole: true, suffix: 'fin-3' });
  const out = await request({ fixtureScenario: 'provider-unavailable' });
  const run = tables.ai_analysis_runs[0];
  check(out.ok === false && run.execution_status === 'FAILED' && run.error_code && run.latency_ms != null, `provider failure → run FAILED (${run.error_code})`);
  check(runEvents(run.id).includes('AI_ANALYSIS_FAILED'), 'AI_ANALYSIS_FAILED event recorded');
}

// 4. Malformed output → VALIDATION_FAILED, rejected output retained for audit.
{
  const { request } = scenario({ serviceRole: true, suffix: 'fin-4' });
  const out = await request({ fixtureScenario: 'malformed-output' });
  const run = tables.ai_analysis_runs[0];
  check(out.ok === false, 'malformed output is not accepted');
  check(['VALIDATION_FAILED', 'FAILED'].includes(run.execution_status) && run.completed_at, `malformed output → run ${run.execution_status}, not left RUNNING`);
  check(runEvents(run.id).includes('AI_ANALYSIS_FAILED'), 'failure event recorded for malformed output');
}

// 5. Finaliser is pinned to its organisation and only writes RUNNING runs.
{
  resetTables();
  const session = { expired: false, calls: [] };
  globalThis.__adminClient = makeClient('service', session);
  tables.ai_analysis_runs.push(
    { id: 'run-done', organisation_id: ORG, execution_status: 'COMPLETED' },
    { id: 'run-other', organisation_id: OTHER_ORG, execution_status: 'RUNNING' },
  );
  const user = makeClient('user', session);
  for (const [runId, organisationId, label] of [
    ['run-done', ORG, 'a COMPLETED run'],
    ['run-other', ORG, 'another organisation’s run'],
  ]) {
    const f = createAiRunFinaliser(user, { organisationId, runId, actorUserId: GMAIL });
    let thrown = null;
    try {
      await f.finishRun({ execution_status: 'FAILED', error_code: 'X' });
    } catch (e) {
      thrown = e.message;
    }
    check(thrown === 'ai_run_finalisation_failed:run_update:run_not_running', `finaliser refuses to overwrite ${label}`, thrown);
  }
  check(tables.ai_analysis_runs[0].execution_status === 'COMPLETED' && tables.ai_analysis_runs[1].execution_status === 'RUNNING', 'neither row changed');
  const f = createAiRunFinaliser(user, { organisationId: ORG, runId: 'run-done', actorUserId: GMAIL });
  await f.finishRun({ execution_status: 'COMPLETED', organisation_id: OTHER_ORG, requested_by: 'x' }).catch(() => {});
  check(tables.ai_analysis_runs[0].organisation_id === ORG, 'finaliser ignores fields outside the run outcome');
}

// 6. A run that did not complete cannot be reviewed.
{
  resetTables();
  globalThis.__adminClient = null;
  tables.ai_analysis_runs.push({
    id: 'run-stuck', organisation_id: ORG, use_case_id: 'UC-RI-005', publication_id: PUB, execution_status: 'RUNNING',
    review_status: 'AI_DRAFT', freshness: 'CURRENT', requested_by: GMAIL, target_entity_id: CHANGE,
  });
  const user = makeClient('user', { expired: false, calls: [] });
  let thrown = null;
  try {
    await submitAnalysisReview(user, { organisationId: ORG, userId: YAHOO, role: 'REVIEWER', runId: 'run-stuck', decision: 'ACCEPTED', acceptedClaimIndexes: [0], rejectedClaimIndexes: [] });
  } catch (e) {
    thrown = e.message;
  }
  check(thrown === 'analysis_not_completed', 'review of a RUNNING run refused (analysis_not_completed)', thrown);
  check(!(tables.ai_analysis_reviews || []).length, 'no review row written');

  // Accepting a completed UC-RI-005 run is suspended until per-finding materialisation is fixed.
  tables.ai_analysis_runs[0].execution_status = 'COMPLETED';
  tables.ai_analysis_runs[0].review_status = 'HUMAN_REVIEW_REQUIRED';
  for (const decision of ['ACCEPTED', 'PARTIALLY_ACCEPTED']) {
    let err = null;
    try {
      await submitAnalysisReview(user, { organisationId: ORG, userId: YAHOO, role: 'REVIEWER', runId: 'run-stuck', decision, acceptedClaimIndexes: [1], rejectedClaimIndexes: [] });
    } catch (e) {
      err = e.message;
    }
    check(err === 'uc_ri_005_acceptance_suspended', `${decision} of a completed UC-RI-005 run refused`, err);
  }
  check(!(tables.ai_analysis_reviews || []).length && !(tables.regulatory_obligations || []).length, 'no review or obligation written for refused acceptance');
  const { materialiseReviewedClaims } = await import('../lib/ri/services/ai-materialisation.ts');
  let matErr = null;
  try {
    await materialiseReviewedClaims(user, { organisationId: ORG, userId: YAHOO, role: 'REVIEWER', runId: 'run-stuck', reviewId: 'rev-x', decision: 'ACCEPTED', acceptedClaimIndexes: [] });
  } catch (e) {
    matErr = e.message;
  }
  check(matErr === 'AI_AUTONOMOUS_ACTION_BLOCKED' && !(tables.regulatory_obligations || []).length, 'direct materialisation refused by the autonomous-action guard; no obligation written', matErr);
}

// 7. History: attempted live UC-RI runs are listed; fixtures and unkeyed runs are not.
{
  const base = { provider: 'AIPROV-ANTHROPIC-001', latency_ms: null, structured_output: null, idempotency_key: `UC-RI-005:${VER}:${ORG}:uat-fg24-6-001` };
  for (const status of ['RUNNING', 'FAILED', 'VALIDATION_FAILED']) {
    check(classifyAiAnalysisRunForLab({ ...base, execution_status: status }) === 'uat_authorised', `live UC-RI-005 ${status} run shown in the authorised UAT history`);
  }
  check(classifyAiAnalysisRunForLab({ ...base, provider: 'AIPROV-FIXTURE-001', execution_status: 'FAILED' }) !== 'uat_authorised', 'fixture FAILED run not shown as authorised UAT');
  check(classifyAiAnalysisRunForLab({ ...base, idempotency_key: 'adhoc', execution_status: 'FAILED' }) === 'unclassified', 'live run without a UC-RI key stays unclassified');
}

// 8. Anthropic provider returns response metadata (never text) on success and failure.
{
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-0000000000000000000000';
  process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX = 'meta';
  const text = JSON.stringify({ candidates: [] });
  const okFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'msg_test_1', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 12000, output_tokens: 3000 } }),
    text: async () => JSON.stringify({ id: 'msg_test_1', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 12000, output_tokens: 3000 } }),
  });
  const errFetch = async () => ({
    ok: false,
    status: 529,
    json: async () => ({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' }, request_id: 'req_test_2' }),
    text: async () => JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' }, request_id: 'req_test_2' }),
  });
  const req = (n) => ({
    useCaseId: 'UC-RI-005',
    analysisType: 'Obligation Extraction',
    budgetContext: { organisationId: ORG, idempotencyKey: `UC-RI-005:${VER}:${ORG}:meta-${n}` },
    context: { sourceSections: [{ sourceSectionId: 'p1', citation: 'PDF p.1', text: 'Firms must assess payment fraud risk.' }] },
  });
  const okOut = await createAnthropicProvider({ fetchFn: okFetch }).execute(req(1));
  const m = okOut.providerMeta;
  check(m?.requestId === 'msg_test_1' && m.stopReason === 'end_turn' && m.inputTokens === 12000 && m.outputTokens === 3000, 'success returns request ID, stop reason and token usage', JSON.stringify(m));
  check(m && !JSON.stringify(m).includes('candidates') && m.textLength === text.length, 'metadata carries text length only, not the text');
  check(okOut.spendAudit?.inputTokens === 12000 && okOut.spendAudit?.outputTokens === 3000, 'spend audit settled with actual tokens');
  const errOut = await createAnthropicProvider({ fetchFn: errFetch }).execute(req(2));
  check(errOut.ok === false && errOut.providerMeta?.httpStatus === 529 && errOut.providerMeta?.requestId === 'req_test_2' && errOut.providerMeta?.responseReceived === true, 'provider error returns HTTP status and request ID', JSON.stringify(errOut.providerMeta));
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll run-finalisation checks passed.');
process.exit(failures.length ? 1 : 0);
