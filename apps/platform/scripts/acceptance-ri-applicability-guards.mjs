#!/usr/bin/env node
/**
 * Server-side applicability guards, exercised on the real service code (Node type stripping) with an
 * in-memory Supabase stand-in: one live assessment per organisation and publication, draft-only edits,
 * maker-checker transitions and submitter segregation of duties. RLS is covered by
 * acceptance-ri-role-aware-rls-local-db.mjs.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = `
const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) return next(root + specifier.slice(2) + '.ts', context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const { saveApplicabilityAssessment } = await import('../lib/ri/services/applicability.ts');
const { patchApplicabilityAssessment } = await import('../lib/ri/services/governance-queue.ts');

const ORG = 'b8f5e3a1-00ad-4000-8000-000000000001';
const OTHER_ORG = '4d871541-e0d4-4581-828d-72073f763f85';
const PUB = 'ec168f48-1717-4631-8e4a-a3e95df4d5ce';
const A = 'user_a';
const B = 'user_b';

// Status values come from the migrations, so the stand-in rejects what Postgres would reject.
function enumFromMigrations(typeName) {
  const dir = join(platformRoot, 'supabase', 'migrations');
  const values = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    const created = sql.match(new RegExp(`create type public\\.${typeName} as enum \\(([^)]*)\\)`, 'i'));
    if (created) values.push(...[...created[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
    for (const added of sql.matchAll(new RegExp(`alter type public\\.${typeName} add value (?:if not exists )?'([^']+)'`, 'gi'))) {
      values.push(added[1]);
    }
  }
  return new Set(values);
}
const APPLICABILITY_STATUSES = enumFromMigrations('applicability_assessment_status');
function assertStatus(table, row) {
  if (table === 'applicability_assessments' && row.status !== undefined && !APPLICABILITY_STATUSES.has(row.status)) {
    throw new Error(`invalid input value for enum applicability_assessment_status: "${row.status}"`);
  }
}

const tables = { applicability_assessments: [], workflow_events: [] };
let clock = 0;
const now = () => new Date(Date.UTC(2026, 10, 20, 19, 0, ++clock)).toISOString();
let idSeq = 0;

function query(table) {
  const filters = [];
  let op = 'select';
  let payload = null;
  let limitN = null;
  const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === 'insert' || op === 'update') assertStatus(table, payload);
    if (op === 'insert') {
      const row = { id: `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`, created_at: now(), ...payload };
      row.updated_at = row.created_at;
      tables[table].push(row);
      return [row];
    }
    if (op === 'update') {
      const hit = rows();
      for (const r of hit) Object.assign(r, payload, { updated_at: now() });
      return hit;
    }
    const hit = rows();
    return limitN == null ? hit : hit.slice(0, limitN);
  };
  const builder = {
    select() {
      return builder;
    },
    insert(body) {
      op = 'insert';
      payload = body;
      return builder;
    },
    update(body) {
      op = 'update';
      payload = body;
      return builder;
    },
    eq(col, val) {
      filters.push((r) => r[col] === val);
      return builder;
    },
    neq(col, val) {
      filters.push((r) => r[col] !== val);
      return builder;
    },
    in(col, vals) {
      filters.push((r) => vals.includes(r[col]));
      return builder;
    },
    order() {
      return builder;
    },
    limit(n) {
      limitN = n;
      return builder;
    },
    async single() {
      const out = run();
      return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'no_single_row' } };
    },
    async maybeSingle() {
      const out = run();
      return { data: out[0] ?? null, error: null };
    },
    then(resolve, reject) {
      return Promise.resolve({ data: run(), error: null }).then(resolve, reject);
    },
  };
  return builder;
}
const supabase = { from: (t) => query(t) };

const failures = [];
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};
async function expectError(fn, code, label) {
  try {
    await fn();
    fail(`${label} — expected ${code}, succeeded`);
  } catch (e) {
    if (e?.message === code) pass(`${label} → ${code}`);
    else fail(`${label} — expected ${code}, got ${e?.message}`);
  }
}
const live = () => tables.applicability_assessments.filter((r) => r.organisation_id === ORG && r.publication_id === PUB);
const save = (userId, extra) =>
  saveApplicabilityAssessment(supabase, { organisationId: ORG, publicationId: PUB, userId, recommendation: 'APPLICABLE', rationale: 'UAT', ...extra });
// Same field shape as app/api/ri-lab/applicability/[id]/route.ts: rationale is always present, null unless sent.
const workflow = (userId, assessmentId, action, expectedUpdatedAt, decisionComments = 'UAT') =>
  patchApplicabilityAssessment(supabase, {
    organisationId: ORG,
    assessmentId,
    userId,
    role: 'COMPLIANCE_MANAGER',
    fields: { action, rationale: null, decisionComments },
    expectedUpdatedAt,
  });
const eventFor = (id, type) => [...tables.workflow_events].reverse().find((e) => e.entity_id === id && e.event_type === type);

const draft = await save(A);
if (draft.status === 'DRAFT' && live().length === 1) pass('first save inserts one DRAFT assessment');
else fail(`first save: ${JSON.stringify(draft)}`);
if (tables.workflow_events.some((e) => e.event_type === 'APPLICABILITY_DECIDED' && e.actor_user_id === A)) pass('APPLICABILITY_DECIDED event by A');
else fail(`events: ${JSON.stringify(tables.workflow_events)}`);

await expectError(() => save(A), 'applicability_assessment_exists', 'second insert for same organisation and publication');
if (live().length === 1) pass('still exactly one assessment');
else fail(`assessments: ${live().length}`);

const other = await saveApplicabilityAssessment(supabase, { organisationId: OTHER_ORG, publicationId: PUB, userId: 'user_other', recommendation: 'NOT_APPLICABLE' });
if (other.organisation_id === OTHER_ORG && live().length === 1) pass('another organisation can hold its own assessment (tenant scoped)');
else fail('other-organisation insert affected AI Development');

const draftUpdatedAt = draft.updated_at;
const updated = { ...(await save(A, { assessmentId: draft.id, rationale: 'UAT updated', expectedUpdatedAt: draftUpdatedAt })) };
if (updated.id === draft.id && updated.rationale === 'UAT updated' && live().length === 1) pass('draft update edits the same row');
else fail(`update: ${JSON.stringify(updated)}`);
await expectError(() => save(A, { assessmentId: draft.id, expectedUpdatedAt: draftUpdatedAt }), 'stale_record', 'update with stale expectedUpdatedAt');

const submitted = await workflow(A, draft.id, 'submit', updated.updated_at);
if (submitted.status === 'IN_REVIEW' && submitted.submitted_by === A) pass('A submits → IN_REVIEW, submitted_by A');
else fail(`submit: ${JSON.stringify(submitted)}`);
if (live()[0].rationale === 'UAT updated') pass('submit keeps the saved rationale (route sends rationale: null)');
else fail(`rationale after submit: ${JSON.stringify(live()[0].rationale)}`);
await expectError(
  () =>
    patchApplicabilityAssessment(supabase, {
      organisationId: ORG,
      assessmentId: draft.id,
      userId: A,
      role: 'COMPLIANCE_MANAGER',
      fields: { action: null, rationale: 'edited in review' },
    }),
  'applicability_locked',
  'rationale edit through the workflow route while in review',
);

await expectError(() => save(A, { assessmentId: draft.id, recommendation: 'NOT_APPLICABLE' }), 'applicability_locked', 'editing a submitted assessment');
if (live()[0].status === 'IN_REVIEW' && live()[0].recommendation === 'APPLICABLE') pass('submitted assessment unchanged after refused edit');
else fail(`after refused edit: ${JSON.stringify(live()[0])}`);
await expectError(() => save(A), 'applicability_assessment_exists', 'new insert while one is in review');
await expectError(() => workflow(A, draft.id, 'approve'), 'segregation_of_duties', 'submitter A approving own submission');

const approved = await workflow(B, draft.id, 'approve', undefined, 'Approved for UAT');
if (approved.status === 'APPROVED' && approved.reviewed_by === B && approved.submitted_by === A) pass('B approves → APPROVED, reviewed_by B');
else fail(`approve: ${JSON.stringify(approved)}`);
if (live()[0].rationale === 'UAT updated' && eventFor(draft.id, 'APPLICABILITY_APPROVED')?.metadata?.decisionComments === 'Approved for UAT') {
  pass('approve keeps the maker rationale; checker comment recorded on the audit event');
} else fail(`after approve: ${JSON.stringify({ rationale: live()[0].rationale, event: eventFor(draft.id, 'APPLICABILITY_APPROVED') })}`);
await expectError(() => workflow(B, draft.id, 'approve'), 'applicability_invalid_transition', 'second approval');
await expectError(() => save(B, { assessmentId: draft.id }), 'applicability_locked', 'editing an approved assessment');
if (live()[0].status === 'APPROVED' && live()[0].reviewed_by === B) pass('approval preserved after refused edit');
else fail(`after approval: ${JSON.stringify(live()[0])}`);

const events = tables.workflow_events.filter((e) => e.entity_id === draft.id).map((e) => `${e.event_type}:${e.actor_user_id}`);
const expected = ['APPLICABILITY_DECIDED:user_a', 'APPLICABILITY_SUBMITTED:user_a', 'APPLICABILITY_APPROVED:user_b'];
if (JSON.stringify(events) === JSON.stringify(expected)) pass(`workflow history ${events.join(' → ')}`);
else fail(`workflow history ${JSON.stringify(events)}`);

// Live recovery path: an IN_REVIEW assessment with no rationale is rejected, corrected on the same row, resubmitted, approved.
const PUB2 = '11111111-2222-4333-8444-555555555555';
const recovery = await saveApplicabilityAssessment(supabase, { organisationId: ORG, publicationId: PUB2, userId: A, recommendation: 'APPLICABLE' });
await workflow(A, recovery.id, 'submit');
const rejected = await workflow(B, recovery.id, 'reject', undefined, 'Rationale missing — please add and resubmit.');
const recRow = () => tables.applicability_assessments.find((r) => r.id === recovery.id);
if (rejected.status === 'REJECTED' && recRow().rationale == null && eventFor(recovery.id, 'APPLICABILITY_REJECTED')?.metadata?.decisionComments === 'Rationale missing — please add and resubmit.') {
  pass('reject keeps the maker rationale untouched; reviewer comment recorded on the audit event');
} else fail(`reject: ${JSON.stringify({ row: recRow(), event: eventFor(recovery.id, 'APPLICABILITY_REJECTED') })}`);
await saveApplicabilityAssessment(supabase, {
  organisationId: ORG,
  publicationId: PUB2,
  userId: A,
  assessmentId: recovery.id,
  recommendation: 'APPLICABLE',
  rationale: 'Corrected rationale',
  expectedUpdatedAt: recRow().updated_at,
});
await workflow(A, recovery.id, 'submit', recRow().updated_at);
const reapproved = await workflow(B, recovery.id, 'approve');
const recCount = tables.applicability_assessments.filter((r) => r.organisation_id === ORG && r.publication_id === PUB2).length;
if (reapproved.status === 'APPROVED' && recRow().rationale === 'Corrected rationale' && reapproved.submitted_by === A && reapproved.reviewed_by === B && recCount === 1) {
  pass('rejected assessment corrected, resubmitted and approved on the same row with rationale intact');
} else fail(`recovery: ${JSON.stringify({ row: recRow(), recCount })}`);

console.log(`acceptance-ri-applicability-guards: ${failures.length ? 'FAIL' : 'PASS'} (${failures.length} failures)`);
if (failures.length) process.exit(1);
