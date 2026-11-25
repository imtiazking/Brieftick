#!/usr/bin/env node
/**
 * REVIEWER obligation approval: permission matrix, lab capabilities, review-decision scope,
 * segregation of duties and tenant isolation. Offline: runs the real TypeScript services (Node type
 * stripping) against an in-memory Supabase double. No DB, no network, no AI.
 */
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLATFORM = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(PLATFORM, '..', '..');

function resolveTsPath(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith('\\') && /\.[cm]?[jt]sx?$/.test(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    let base = null;
    if (specifier.startsWith('@/')) base = join(PLATFORM, specifier.slice(2));
    else if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      base = join(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      const hit = resolveTsPath(base);
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { canRi } = await import('../lib/ri/permissions.ts');
const writes = await import('../lib/ri/lab-api/lab-connected-writes.ts');
const { primaryRowsForLabScope } = await import('../lib/ri/uat-record-provenance.ts');
const { updateObligation } = await import('../lib/ri/services/obligations.ts');
const { isAiObligationReviewDecision } = await import('../lib/ri/ai/ai-obligation-workflow.mjs');

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`PASS: ${label}`);
  else {
    failures += 1;
    console.error(`FAIL: ${label} — expected ${e}, got ${a}`);
  }
}
async function rejects(label, fn, expectedMessage) {
  try {
    await fn();
    failures += 1;
    console.error(`FAIL: ${label} — expected rejection ${expectedMessage}, call succeeded`);
  } catch (err) {
    const msg = err?.message || String(err);
    const name = err?.constructor?.name;
    if (msg === expectedMessage || name === expectedMessage) console.log(`PASS: ${label}`);
    else {
      failures += 1;
      console.error(`FAIL: ${label} — expected ${expectedMessage}, got ${name}: ${msg}`);
    }
  }
}

// ── 1. Permission matrix: REVIEWER gets review, nothing that creates records or runs AI ─────────────
const reviewerOnly = {
  'obligation:review': true,
  'ai:review': true,
  'obligation:read': true,
  'obligation:write': false,
  'ai:request': false,
  'change:write': false,
  'applicability:write': false,
  'impact:write': false,
  'impact:approve': false,
  'risk:write': false,
  'control:write': false,
  'ai:governance': false,
};
for (const [action, expected] of Object.entries(reviewerOnly)) {
  check(`REVIEWER ${action} = ${expected}`, canRi('REVIEWER', action), expected);
}
check('VIEWER cannot review obligations', canRi('VIEWER', 'obligation:review'), false);
check('ANALYST keeps obligation:write', canRi('ANALYST', 'obligation:write'), true);
check('COMPLIANCE_MANAGER keeps obligation:review', canRi('COMPLIANCE_MANAGER', 'obligation:review'), true);

// ── 2. Lab capabilities honour the connected-writes switch ──────────────────────────────────────────
const savedFlag = process.env.RI_LAB_CONNECTED_WRITES_ENABLED;
process.env.RI_LAB_CONNECTED_WRITES_ENABLED = 'true';
const reviewerCaps = writes.buildLabWriteCapabilities('REVIEWER', 'org-a');
check('REVIEWER capability obligationReview', reviewerCaps.obligationReview, true);
check('REVIEWER capability obligations (write)', reviewerCaps.obligations, false);
check('REVIEWER capability aiRequest', reviewerCaps.aiRequest, false);
check('REVIEWER capability changeManagement', reviewerCaps.changeManagement, false);
check('REVIEWER capability risks', reviewerCaps.risks, false);
check('ANALYST capability obligations (write) unchanged', writes.buildLabWriteCapabilities('ANALYST', 'org-a').obligations, true);
await rejects('VIEWER refused by review gate', () => writes.assertLabObligationReviewEnabled('VIEWER'), 'connected_writes_disabled');
process.env.RI_LAB_CONNECTED_WRITES_ENABLED = 'false';
check('switch off → REVIEWER obligationReview false', writes.buildLabWriteCapabilities('REVIEWER', 'org-a').obligationReview, false);
await rejects('switch off → review gate refuses REVIEWER', () => writes.assertLabObligationReviewEnabled('REVIEWER'), 'connected_writes_disabled');
if (savedFlag === undefined) delete process.env.RI_LAB_CONNECTED_WRITES_ENABLED;
else process.env.RI_LAB_CONNECTED_WRITES_ENABLED = savedFlag;

// ── 3. Review-decision scope ────────────────────────────────────────────────────────────────────────
const decision = (over) => isAiObligationReviewDecision({ fieldKeys: ['status'], origin: 'AI_ASSISTED', from: 'IN_REVIEW', to: 'OPEN', ...over });
check('approve submitted AI obligation is a review decision', decision({}), true);
check('return submitted AI obligation is a review decision', decision({ to: 'DRAFT' }), true);
check('manual obligation is not', decision({ origin: 'MANUAL' }), false);
check('DRAFT → IN_REVIEW (submission) is not', decision({ from: 'DRAFT', to: 'IN_REVIEW' }), false);
check('OPEN → CLOSED is not', decision({ from: 'OPEN', to: 'CLOSED' }), false);
check('IN_REVIEW → CLOSED is not', decision({ to: 'CLOSED' }), false);
check('status plus another field is not', decision({ fieldKeys: ['status', 'citation'] }), false);
check('non-status field is not', decision({ fieldKeys: ['obligation_statement'] }), false);

// ── 4. Service behaviour against an in-memory Supabase double ──────────────────────────────────────
const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const REQ = 'user_requester';
const ACC = 'user_acceptor';
const SUB = 'user_submitter';
const CHK = 'user_checker';

function makeDb({ beforeUpdate, impactInsertError } = {}) {
  const t = {
    regulatory_obligations: [
      { id: 'obl-ai', organisation_id: ORG_A, status: 'IN_REVIEW', origin: 'AI_ASSISTED', obligation_statement: 'Firms must…', citation: 'FG24/6 §2', owner_user_id: ACC, created_by_user_id: ACC, ai_analysis_run_id: 'run-1', updated_at: '2026-11-20T09:00:00.000Z' },
      { id: 'obl-manual', organisation_id: ORG_A, status: 'IN_REVIEW', origin: 'MANUAL', obligation_statement: 'Manual', owner_user_id: SUB, created_by_user_id: SUB, ai_analysis_run_id: null, updated_at: '2026-11-20T09:00:00.000Z' },
      { id: 'obl-draft', organisation_id: ORG_A, status: 'DRAFT', origin: 'AI_ASSISTED', obligation_statement: 'Draft', owner_user_id: ACC, created_by_user_id: ACC, ai_analysis_run_id: 'run-1', updated_at: '2026-11-20T09:00:00.000Z' },
      { id: 'obl-open', organisation_id: ORG_A, status: 'OPEN', origin: 'AI_ASSISTED', obligation_statement: 'Open', owner_user_id: ACC, created_by_user_id: ACC, ai_analysis_run_id: 'run-1', updated_at: '2026-11-20T09:00:00.000Z' },
      { id: 'obl-org-b', organisation_id: ORG_B, status: 'IN_REVIEW', origin: 'AI_ASSISTED', obligation_statement: 'Other tenant', owner_user_id: ACC, created_by_user_id: ACC, ai_analysis_run_id: 'run-b', updated_at: '2026-11-20T09:00:00.000Z' },
    ],
    ai_analysis_runs: [
      { id: 'run-1', organisation_id: ORG_A, requested_by: REQ },
      { id: 'run-b', organisation_id: ORG_B, requested_by: REQ },
    ],
    workflow_events: [
      { organisation_id: ORG_A, entity_type: 'regulatory_obligation', entity_id: 'obl-ai', event_type: 'OBLIGATION_STATUS_CHANGED', to_status: 'IN_REVIEW', actor_user_id: SUB, created_at: '2026-11-20T08:59:00.000Z' },
      { organisation_id: ORG_B, entity_type: 'regulatory_obligation', entity_id: 'obl-org-b', event_type: 'OBLIGATION_STATUS_CHANGED', to_status: 'IN_REVIEW', actor_user_id: SUB, created_at: '2026-11-20T08:59:00.000Z' },
    ],
  };

  function query(table) {
    const state = { op: 'select', filters: [], payload: null, limit: null, order: null, mode: 'many' };
    const rows = () => (t[table] ||= []).filter((r) => state.filters.every(([c, v]) => {
      if (c.startsWith('metadata->>')) return r.metadata?.[c.slice('metadata->>'.length)] === v;
      return r[c] === v;
    }));
    function run() {
      if (state.op === 'insert') {
        if (table === 'impact_assessments' && impactInsertError) {
          return { data: null, error: impactInsertError };
        }
        const row = {
          id: state.payload.id || `${table}-${(t[table] || []).length + 1}`,
          created_at: new Date().toISOString(),
          ...state.payload,
        };
        t[table] ||= [];
        t[table].push(row);
        if (state.mode === 'single') return { data: { ...row }, error: null };
        return { data: null, error: null };
      }
      let out = rows();
      if (state.op === 'update') {
        beforeUpdate?.(t, table);
        out = rows();
        for (const r of out) Object.assign(r, state.payload, { updated_at: new Date().toISOString() });
      }
      if (state.order) out = [...out].sort((a, b) => (a[state.order.col] < b[state.order.col] ? 1 : -1) * (state.order.asc ? -1 : 1));
      if (state.limit != null) out = out.slice(0, state.limit);
      if (state.mode === 'single') {
        if (out.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
        return { data: { ...out[0] }, error: null };
      }
      if (state.mode === 'maybe') return { data: out[0] ? { ...out[0] } : null, error: null };
      return { data: out.map((r) => ({ ...r })), error: null };
    }
    const b = {
      select() { return b; },
      insert(p) { state.op = 'insert'; state.payload = p; return b; },
      update(p) { state.op = 'update'; state.payload = p; return b; },
      eq(c, v) { state.filters.push([c, v]); return b; },
      order(col, opts) { state.order = { col, asc: opts?.ascending !== false }; return b; },
      limit(n) { state.limit = n; return b; },
      single() { state.mode = 'single'; return Promise.resolve(run()); },
      maybeSingle() { state.mode = 'maybe'; return Promise.resolve(run()); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  }
  return { tables: t, client: { from: query } };
}

const statusOf = (db, id) => db.tables.regulatory_obligations.find((r) => r.id === id).status;
const eventsFor = (db, id) => db.tables.workflow_events.filter((e) => e.entity_id === id && e.event_type === 'OBLIGATION_STATUS_CHANGED');
const review = (db, over) =>
  updateObligation(db.client, {
    organisationId: ORG_A,
    obligationId: 'obl-ai',
    userId: CHK,
    role: 'REVIEWER',
    fields: { status: 'OPEN' },
    reviewDecisionOnly: true,
    ...over,
  });

{
  const db = makeDb();
  await review(db);
  check('independent REVIEWER approves → OPEN in existing register', statusOf(db, 'obl-ai'), 'OPEN');
  const ev = eventsFor(db, 'obl-ai').at(-1);
  check('approval audited with approver, from and to status', [ev.actor_user_id, ev.from_status, ev.to_status], [CHK, 'IN_REVIEW', 'OPEN']);
}
{
  const db = makeDb();
  await review(db, { fields: { status: 'DRAFT' } });
  check('independent REVIEWER returns → DRAFT', statusOf(db, 'obl-ai'), 'DRAFT');
}

const refused = [
  ['REVIEWER cannot edit statement', { fields: { obligation_statement: 'Changed' } }, 'insufficient_role', 'obl-ai'],
  ['REVIEWER cannot combine status with another field', { fields: { status: 'OPEN', citation: 'x' } }, 'insufficient_role', 'obl-ai'],
  ['REVIEWER cannot approve manual obligations', { obligationId: 'obl-manual' }, 'insufficient_role', 'obl-manual'],
  ['REVIEWER cannot submit drafts', { obligationId: 'obl-draft', fields: { status: 'IN_REVIEW' } }, 'insufficient_role', 'obl-draft'],
  ['REVIEWER cannot move OPEN obligations', { obligationId: 'obl-open', fields: { status: 'CLOSED' } }, 'insufficient_role', 'obl-open'],
  ['REVIEWER cannot reassign owner', { fields: { owner_user_id: CHK } }, 'insufficient_role', 'obl-ai'],
  ['AI run requester cannot approve', { userId: REQ }, 'segregation_of_duties', 'obl-ai'],
  ['AI output acceptor cannot approve', { userId: ACC }, 'segregation_of_duties', 'obl-ai'],
  ['submitter cannot approve', { userId: SUB }, 'segregation_of_duties', 'obl-ai'],
  ['other tenant obligation is not visible', { obligationId: 'obl-org-b' }, 'RiNotFoundError', 'obl-org-b'],
];
for (const [label, over, expected, id] of refused) {
  const db = makeDb();
  const before = JSON.stringify(db.tables.regulatory_obligations.find((r) => r.id === id));
  const eventsBefore = db.tables.workflow_events.length;
  await rejects(label, () => review(db, over), expected);
  check(`${label}: row unchanged, no audit event`, [JSON.stringify(db.tables.regulatory_obligations.find((r) => r.id === id)) === before, db.tables.workflow_events.length], [true, eventsBefore]);
}

{
  const db = makeDb({
    beforeUpdate: (t, table) => {
      if (table === 'regulatory_obligations') t.regulatory_obligations.find((r) => r.id === 'obl-ai').status = 'DRAFT';
    },
  });
  const eventsBefore = db.tables.workflow_events.length;
  await rejects('concurrent status change → stale_record', () => review(db), 'stale_record');
  check('stale decision writes no audit event', db.tables.workflow_events.length, eventsBefore);
}

{
  const db = makeDb();
  await updateObligation(db.client, {
    organisationId: ORG_A,
    obligationId: 'obl-ai',
    userId: ACC,
    role: 'COMPLIANCE_MANAGER',
    fields: { citation: 'FG24/6 §2.1' },
  });
  check('write path unchanged: Compliance Manager edits citation', db.tables.regulatory_obligations.find((r) => r.id === 'obl-ai').citation, 'FG24/6 §2.1');
  await rejects('write path keeps SoD: acceptor approving via write path', () =>
    updateObligation(db.client, { organisationId: ORG_A, obligationId: 'obl-ai', userId: ACC, role: 'COMPLIANCE_MANAGER', fields: { status: 'OPEN' } }), 'segregation_of_duties');
}

check(
  'operational scope keeps authorised UAT out of the primary register',
  primaryRowsForLabScope('operational', ['op'], ['op', 'uat']),
  ['op'],
);
check(
  'scope=all keeps authorised UAT in the primary register',
  primaryRowsForLabScope('all', ['op'], ['op', 'uat']),
  ['op', 'uat'],
);

function stage2Obligation(db) {
  db.tables.regulatory_changes = [
    {
      id: 'ch-1',
      organisation_id: ORG_A,
      title: 'Hosted regulatory change',
      origin: 'MANUAL',
      metadata: { labProvenanceLocked: true, labCreationMode: 'uat_authorised', recordProvenance: 'uat_authorised' },
    },
  ];
  db.tables.regulatory_obligations.push({
    id: 'obl-stage2',
    organisation_id: ORG_A,
    status: 'IN_REVIEW',
    origin: 'AI_ASSISTED',
    obligation_statement: 'Firms must keep labelled test evidence.',
    citation: 'FG24/6',
    owner_user_id: CHK,
    created_by_user_id: ACC,
    ai_analysis_run_id: 'run-1',
    regulatory_change_id: 'ch-1',
    updated_at: '2026-11-20T09:00:00.000Z',
  });
}

{
  const savedStage = process.env.FORGENIQ_STAGE2_AI;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.FORGENIQ_STAGE2_AI = 'OFF';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = makeDb({
    impactInsertError: { code: '42501', message: 'new row violates row-level security policy' },
  });
  stage2Obligation(db);
  await rejects(
    'reviewer stage2 denial does not report success',
    () => review(db, { obligationId: 'obl-stage2' }),
    'new row violates row-level security policy',
  );
  check('failed approval restores the previous status', statusOf(db, 'obl-stage2'), 'IN_REVIEW');
  check(
    'failed approval does not audit OPEN',
    eventsFor(db, 'obl-stage2').some((e) => e.to_status === 'OPEN'),
    false,
  );
  check(
    'failed approval records stage2 failure',
    db.tables.workflow_events.some(
      (e) => e.event_type === 'OBLIGATION_STAGE2_INITIATION_FAILED' && e.entity_id === 'obl-stage2',
    ),
    true,
  );
  check('failed approval inserts no impact assessment', (db.tables.impact_assessments || []).length, 0);
  if (savedStage === undefined) delete process.env.FORGENIQ_STAGE2_AI;
  else process.env.FORGENIQ_STAGE2_AI = savedStage;
  if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
}

{
  const savedStage = process.env.FORGENIQ_STAGE2_AI;
  process.env.FORGENIQ_STAGE2_AI = 'OFF';
  const db = makeDb();
  stage2Obligation(db);
  const approve = () =>
    updateObligation(db.client, {
      organisationId: ORG_A,
      obligationId: 'obl-stage2',
      userId: CHK,
      role: 'COMPLIANCE_MANAGER',
      fields: { status: 'OPEN' },
    });
  await approve();
  check('successful approval remains OPEN with its impact', statusOf(db, 'obl-stage2'), 'OPEN');
  check('successful approval creates one impact', db.tables.impact_assessments.length, 1);
  await approve();
  check('repeated approval does not create a second impact', db.tables.impact_assessments.length, 1);
  if (savedStage === undefined) delete process.env.FORGENIQ_STAGE2_AI;
  else process.env.FORGENIQ_STAGE2_AI = savedStage;
}

// ── 5. Route and UI wiring ──────────────────────────────────────────────────────────────────────────
const route = readFileSync(join(PLATFORM, 'app/api/ri-lab/obligations/[id]/route.ts'), 'utf8');
const patchBody = route.slice(route.indexOf('export async function PATCH'));
check('PATCH entry gate is obligation:review', patchBody.includes("requireRiContext('obligation:review')"), true);
check('PATCH without obligation:write is review-decision only', /reviewDecisionOnly = !canRi\(ctx\.role, 'obligation:write'\)/.test(patchBody), true);
check('PATCH passes reviewDecisionOnly to the service', /reviewDecisionOnly,\s*\n\s*\}\);/.test(patchBody), true);
for (const root of ['design-lab', 'apps/platform/design-lab-bundle']) {
  const panels = readFileSync(join(REPO, root, 'regulatory-intelligence/js/platform/connected-obligation-panels.js'), 'utf8');
  check(
    `${root}: review panel only for submitted governed (AI or classified manual) obligations`,
    panels.includes("const governed = o.origin === 'AI_ASSISTED' || (o.classificationCode && !o.classificationReviewRequired);") &&
      panels.includes("if (!governed || o.statusCode !== 'IN_REVIEW') return '';"),
    true,
  );
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nacceptance-ri-obligation-reviewer-approval: all checks passed');
