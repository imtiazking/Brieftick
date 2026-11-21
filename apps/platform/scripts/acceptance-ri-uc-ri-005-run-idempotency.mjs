#!/usr/bin/env node
/**
 * UC-RI-005 run idempotency on the real requestPublicationAnalysis (Node type stripping, fixture provider,
 * live-execution code path) with an in-memory Supabase stand-in that enforces the staging unique indexes
 * ai_analysis_runs_idempotency and ai_analysis_runs_uc_ri_005_one_running and refuses deletes.
 * A provider call only follows a newly inserted run, so inserted runs = provider calls.
 * Database behaviour itself is covered by acceptance-ri-ai-run-retention-local-db.mjs.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
// Offline PDF grounding (no storage access); counts builds so reuse can be shown to skip the PDF load.
const pdfStub = `
export async function buildPdfGroundedAnalysisContext() {
  globalThis.__pdfContextBuilds = (globalThis.__pdfContextBuilds || 0) + 1;
  return { ok: true, sourceSections: [{ sourceSectionId: 'p1', citation: 'PDF p.1', text: 'Firms must assess payment fraud risk.' }], allowedSectionIds: ['p1'], grounding: {} };
}`;
const hook = `
const pdfStub = ${JSON.stringify(pdfStub)};
const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.endsWith('build-pdf-grounded-analysis-context.mjs')) {
    return { url: 'data:text/javascript,' + encodeURIComponent(pdfStub), shortCircuit: true };
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
process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX = 'uat-fg24-6-001';

const { requestPublicationAnalysis } = await import('../lib/ri/services/ai-analysis.ts');

const ORG = 'b8f5e3a1-00ad-4000-8000-000000000001';
const PUB = 'ec168f48-1717-4631-8e4a-a3e95df4d5ce';
const VER = 'af28173b-f446-450b-a390-e645a554e524';
const CHANGE = '0ffaad3f-9b83-4728-b991-9bfb5d50e632';
const A = 'user_gmail';

const tables = {
  regulatory_changes: [{ id: CHANGE, organisation_id: ORG, publication_id: PUB }],
  applicability_assessments: [
    { id: 'app-1', organisation_id: ORG, publication_id: PUB, status: 'APPROVED', recommendation: 'APPLICABLE', created_at: '2026-11-20T21:21:04Z', updated_at: '2026-11-21T00:37:31Z' },
  ],
  regulatory_publication_versions: [{ id: VER, publication_id: PUB, version_number: 1, retrieved_at: '2026-11-01T00:00:00Z' }],
  regulatory_publications: [{ id: PUB, title: 'FG24/6' }],
  ai_analysis_runs: [],
  workflow_events: [],
};
let idSeq = 0;
const runInsertAttempts = [];

function uniqueViolation(row) {
  const runs = tables.ai_analysis_runs;
  if (runs.some((r) => r.organisation_id === row.organisation_id && r.idempotency_key === row.idempotency_key)) {
    return { code: '23505', message: 'duplicate key value violates unique constraint "ai_analysis_runs_idempotency"' };
  }
  if (
    row.use_case_id === 'UC-RI-005' &&
    row.execution_status === 'RUNNING' &&
    runs.some((r) => r.organisation_id === row.organisation_id && r.use_case_id === 'UC-RI-005' && r.execution_status === 'RUNNING')
  ) {
    return { code: '23505', message: 'duplicate key value violates unique constraint "ai_analysis_runs_uc_ri_005_one_running"' };
  }
  return null;
}

function query(table) {
  tables[table] ??= [];
  const filters = [];
  let op = 'select';
  let payload = null;
  let limitN = null;
  const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
  const run = async () => {
    // Yield so concurrent requests interleave the way separate serverless instances would.
    await new Promise((r) => setImmediate(r));
    if (op === 'delete') {
      if (table === 'ai_analysis_runs') return { data: null, error: { message: 'ai_analysis_runs are retained for audit and cannot be deleted' } };
      tables[table] = tables[table].filter((r) => !filters.every((f) => f(r)));
      return { data: null, error: null };
    }
    if (op === 'insert') {
      const list = Array.isArray(payload) ? payload : [payload];
      const out = [];
      for (const body of list) {
        const row = { id: `run-${++idSeq}`, created_at: new Date().toISOString(), ...body };
        if (table === 'ai_analysis_runs') {
          runInsertAttempts.push(row.idempotency_key);
          const err = uniqueViolation(row);
          if (err) return { data: null, error: err };
        }
        tables[table].push(row);
        out.push(row);
      }
      return { data: out, error: null };
    }
    if (op === 'update') {
      const hit = rows();
      for (const r of hit) Object.assign(r, payload);
      return { data: hit, error: null };
    }
    const hit = rows();
    return { data: limitN == null ? hit : hit.slice(0, limitN), error: null };
  };
  const builder = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (res, rej) => run().then(res, rej);
        if (prop === 'insert' || prop === 'upsert') return (b) => ((op = 'insert'), (payload = b), builder);
        if (prop === 'update') return (b) => ((op = 'update'), (payload = b), builder);
        if (prop === 'delete') return () => ((op = 'delete'), builder);
        if (prop === 'eq') return (c, v) => (filters.push((r) => r[c] === v), builder);
        if (prop === 'neq') return (c, v) => (filters.push((r) => r[c] !== v), builder);
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
}
const supabase = { from: (t) => query(t) };

const failures = [];
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};
const request = (suffix, extra = {}) =>
  requestPublicationAnalysis(supabase, {
    organisationId: ORG,
    userId: A,
    role: 'COMPLIANCE_MANAGER',
    publicationId: PUB,
    publicationVersionId: VER,
    useCaseId: 'UC-RI-005',
    targetEntityId: CHANGE,
    idempotencyKeySuffix: suffix,
    ...extra,
  });
const runs = () => tables.ai_analysis_runs;
const insertedRuns = () => runs().length;
async function expectError(fn, code, label) {
  try {
    const out = await fn();
    fail(`${label} — expected ${code}, got ${JSON.stringify(out)}`);
  } catch (e) {
    if (e?.message === code) pass(`${label} → ${code}`);
    else fail(`${label} — expected ${code}, got ${e?.message}`);
  }
}

// 1. A run reference that is not authorised never creates a run.
await expectError(() => request('uat-fg24-6-002'), 'uc_ri_005_run_reference_not_authorised', 'unauthorised run reference');
await expectError(() => request(undefined), 'uc_ri_005_run_reference_not_authorised', 'missing run reference');
if (insertedRuns() === 0) pass('no run created (no provider call) for unauthorised or missing references');
else fail(`runs after refused references: ${insertedRuns()}`);

// 2. Concurrent requests with the authorised reference: one run, one provider call.
const concurrent = await Promise.allSettled([request('uat-fg24-6-001'), request('uat-fg24-6-001'), request('uat-fg24-6-001')]);
const values = concurrent.filter((c) => c.status === 'fulfilled').map((c) => c.value);
const runIds = new Set(values.map((v) => v.runId));
if (insertedRuns() === 1 && runIds.size === 1 && values.length === 3) {
  pass(`three concurrent requests → one run (${[...runIds][0]}), ${values.filter((v) => v.reused).length} reused`);
} else fail(`concurrent: runs=${insertedRuns()} results=${JSON.stringify(concurrent.map((c) => c.value ?? c.reason?.message))}`);
const runId = runs()[0]?.id;
const firstStatus = runs()[0]?.execution_status;
pass(`first run finished with status ${firstStatus} on the fixture provider`);

// 3. Reuse whatever the status — including FAILED — with no delete and no new run.
const buildsBeforeReuse = globalThis.__pdfContextBuilds || 0;
for (const status of ['FAILED', 'VALIDATION_FAILED', 'RUNNING', 'COMPLETED']) {
  runs()[0].execution_status = status;
  const again = await request('uat-fg24-6-001');
  if (again.ok && again.reused && again.runId === runId && again.executionStatus === status && insertedRuns() === 1) {
    pass(`same reference with existing ${status} run → existing run returned, no new run`);
  } else fail(`reuse after ${status}: ${JSON.stringify(again)} runs=${insertedRuns()}`);
}
if (runs().some((r) => r.id === runId)) pass('the FAILED run was never deleted');
else fail('original run missing');
if ((globalThis.__pdfContextBuilds || 0) === buildsBeforeReuse) pass('reused requests do not load the PDF context');
else fail(`PDF context built ${(globalThis.__pdfContextBuilds || 0) - buildsBeforeReuse} times during reuse`);

// 4. Another run in progress blocks a new authorised reference (second instance race).
runs()[0].execution_status = 'RUNNING';
process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX = 'uat-fg24-6-002';
await expectError(() => request('uat-fg24-6-002'), 'uc_ri_005_run_in_progress', 'new authorised reference while a run is RUNNING');
if (insertedRuns() === 1) pass('no second run while one is RUNNING');
else fail(`runs: ${insertedRuns()}`);

// 5. A new attempt needs a new authorised reference and creates a new, separate run.
runs()[0].execution_status = 'FAILED';
const second = await request('uat-fg24-6-002');
if (second.runId && second.runId !== runId && !second.reused && insertedRuns() === 2) {
  pass('new operator-authorised reference after FAILED → a new, separate run; the FAILED run is retained');
} else fail(`new reference: ${JSON.stringify(second)} runs=${insertedRuns()}`);
await expectError(() => request('uat-fg24-6-001-retry'), 'uc_ri_005_run_reference_not_authorised', 'improvised retry reference');

// 6. Without an authorised reference configured, live UC-RI-005 is refused.
delete process.env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX;
await expectError(() => request('uat-fg24-6-003'), 'uc_ri_005_run_reference_not_configured', 'no authorised reference configured');

const events = tables.workflow_events.filter((e) => e.event_type === 'AI_ANALYSIS_REQUESTED');
if (events.length === insertedRuns()) pass(`AI_ANALYSIS_REQUESTED events = runs created (${events.length})`);
else fail(`requested events ${events.length} vs runs ${insertedRuns()}`);

console.log(`\nUC-RI-005 run idempotency: ${failures.length ? `FAIL (${failures.length})` : 'PASS'}`);
process.exit(failures.length ? 1 : 0);
