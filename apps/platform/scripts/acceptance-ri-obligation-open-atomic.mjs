#!/usr/bin/env node
/**
 * Atomic obligation approval (Production Readiness: hosted-UAT defect "OPEN without impact assessment").
 * Embedded Postgres, real RLS sessions as non-superuser Clerk identities, real TypeScript services.
 * Deterministic. No provider call, no network, no paid AI (the failure injection is the fail-closed LIVE gate).
 *
 * Proves: failed approvals leave NOTHING behind (status, edits, impact, events all roll back, including a failure
 * injected at the very last write); unauthorised callers are rejected before any mutation; concurrent approvals
 * serialise to exactly one winner; repeats are idempotent; Stage 2 being unavailable refuses the approval instead of
 * leaving an OPEN obligation disconnected; a genuine no-Stage-2 case is recorded durably; the integrity view makes any
 * historical disconnected row visible and recovery repairs it; and the function grants are not open to anon/public.
 */
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const fanOutStub = `export async function fanOutTenantNotification() { return { ok: true, delivered: false, reason: 'fixture_test' }; }`;
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.includes('tenant-notification-fanout')) return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(fanOutStub)}`)}, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

for (const k of ['RI_AI_EXECUTION_ENABLED', 'RI_AI_EXECUTION_RUN_REFERENCE', 'RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k];
process.env.FORGENIQ_STAGE2_AI = 'FIXTURE';
process.env.RI_AI_PROVIDER_MODE = 'FIXTURE';

const {
  ORG_A,
  ORG_B,
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  insertTestPublication,
  resetAndStartEmbedded,
  stopEmbedded,
  TEST_MANUAL_OBLIGATION_METADATA,
  withRlsSessionCommit,
} = await import('./local-db/harness.mjs');
const { createPgSupabaseClient } = await import('./local-db/pg-supabase-adapter.mjs');
const { updateObligation } = await import('../lib/ri/services/obligations.ts');
const { ensureImpactAssessmentFromApprovedObligation } = await import('../lib/ri/services/obligation-impact-downstream.ts');

let pass = 0;
let fail = 0;
const check = (id, ok, detail) => {
  if (ok) pass += 1;
  else {
    fail += 1;
    console.error(`FAIL: ${id}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
};
const rejects = async (id, fn, pattern) => {
  try {
    await fn();
    check(id, false, 'expected a rejection, call succeeded');
  } catch (e) {
    const msg = `${e?.name ?? ''}:${e?.message ?? e}`;
    check(id, pattern.test(msg), msg);
  }
};

const MAKER = 'clerk_maker_atomic';
const CM = 'clerk_cm_atomic';
const CM2 = 'clerk_cm2_atomic';
const REV = 'clerk_reviewer_atomic';
const VIEW = 'clerk_viewer_atomic';
const OTHER_B = 'clerk_other_org_atomic';

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54374 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
const q = async (text, params) => (await admin.query(text, params)).rows;

try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);
  await admin.query('grant authenticated to forgeniq_app');
  const publicationId = await insertTestPublication(admin);

  await admin.query(`insert into public.organisations (id, name, slug) values ($1, 'ORG A ATOMIC', 'org-a-atomic'), ($2, 'ORG B ATOMIC', 'org-b-atomic') on conflict do nothing`, [ORG_A, ORG_B]);
  for (const [org, user, role] of [
    [ORG_A, MAKER, 'ANALYST'], [ORG_A, CM, 'COMPLIANCE_MANAGER'], [ORG_A, CM2, 'COMPLIANCE_MANAGER'],
    [ORG_A, REV, 'REVIEWER'], [ORG_A, VIEW, 'VIEWER'], [ORG_B, OTHER_B, 'COMPLIANCE_MANAGER'],
  ]) {
    await admin.query(`insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, $3::public.platform_role, 'active') on conflict (organisation_id, clerk_user_id) do update set role = excluded.role`, [org, user, role]);
  }
  const [{ id: changeId }] = await q(`insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, external_key, created_by_user_id) values ($1, $2, 'Atomic test change', 'TEST', 'OPEN', 'ATOMIC-CHG', $3) returning id`, [ORG_A, publicationId, MAKER]);

  let seq = 0;
  async function mkOb({ origin = 'MANUAL', withChange = true, status = 'IN_REVIEW', createdBy = MAKER } = {}) {
    seq += 1;
    const [{ id }] = await q(
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, owner_user_id, origin, created_by_user_id, external_key, citation, priority, metadata)
       values ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, 'ORIG-CITATION', 'Low', $9::jsonb) returning id`,
      [ORG_A, withChange ? changeId : null, publicationId, `Atomic obligation ${seq}: firms must keep labelled evidence.`, MAKER, origin, createdBy, `ATOMIC-OBL-${seq}`, JSON.stringify(TEST_MANUAL_OBLIGATION_METADATA)],
    );
    // Submission is a user action enforced by the database, so it goes through a real RLS session as the maker.
    if (status !== 'DRAFT') {
      await withRlsSessionCommit(adminUrl, MAKER, (c) =>
        c.query(`update regulatory_obligations set status = $2::public.obligation_status where id = $1`, [id, status]),
      );
    }
    await admin.query(
      `insert into workflow_events (organisation_id, entity_type, entity_id, event_type, to_status, actor_user_id) values ($1, 'regulatory_obligation', $2, 'OBLIGATION_STATUS_CHANGED', 'IN_REVIEW', $3)`,
      [ORG_A, id, MAKER],
    );
    return id;
  }
  const snap = async (id) => {
    const [o] = await q(`select status::text as status, citation, priority, obligation_statement, updated_at from regulatory_obligations where id = $1`, [id]);
    const [{ impacts }] = await q(`select count(*)::int as impacts from impact_assessments where metadata->>'sourceRegulatoryObligationId' = $1`, [id]);
    const events = await q(`select event_type from workflow_events where entity_type = 'regulatory_obligation' and entity_id = $1 and event_type <> 'OBLIGATION_STATUS_CHANGED' or (entity_id = $1 and to_status = 'OPEN') order by occurred_at, event_type`, [id]);
    const [{ areas }] = await q(`select count(*)::int as areas from impact_assessment_business_areas b join impact_assessments a on a.id = b.impact_assessment_id where a.metadata->>'sourceRegulatoryObligationId' = $1`, [id]);
    return { ...o, impacts, areas, events: events.map((e) => e.event_type) };
  };
  // The classified-status guard (correctly) refuses an identity-less move to OPEN, so legacy rows are forged with
  // that one trigger paused inside a single transaction. This only reproduces data written before the fix.
  const forgeLegacyOpen = async (id) => {
    await admin.query('begin');
    try {
      await admin.query('alter table public.regulatory_obligations disable trigger ri_guard_classified_obligation_status');
      await admin.query(`update regulatory_obligations set status = 'OPEN' where id = $1`, [id]);
      await admin.query('alter table public.regulatory_obligations enable trigger ri_guard_classified_obligation_status');
      await admin.query('commit');
    } catch (e) {
      await admin.query('rollback');
      throw e;
    }
  };
  const stateOf = async (id) => (await q(`select stage2_state from obligation_stage2_integrity where obligation_id = $1`, [id]))[0]?.stage2_state ?? null;
  const asUser = (sub) => createPgSupabaseClient(adminUrl, sub);
  const payload = (extra = {}) => ({
    status: 'DRAFT', business_impact: 'b', operational_impact: 'o', technology_impact: 't', compliance_impact: 'c',
    financial_impact: 'f', implementation_complexity: 'MEDIUM', materiality: 'UNASSESSED',
    metadata: { labProvenanceLocked: true }, business_areas: ['Operations', 'Compliance'], ...extra,
  });
  const rpc = (sub, id, args = {}) =>
    asUser(sub).rpc('approve_obligation_with_stage2', {
      p_organisation_id: ORG_A, p_obligation_id: id, p_expected_status: 'IN_REVIEW', p_actor_user_id: sub,
      p_impact: payload(), p_skip_reason: null, p_impact_event_metadata: { source: 'test' }, p_ai_provider: 'fixture',
      p_fields: {}, p_expected_updated_at: null, ...args,
    });

  // ---------------------------------------------------------------- grants
  const fnSig = 'public.approve_obligation_with_stage2(uuid,uuid,text,text,jsonb,text,jsonb,text,jsonb,timestamptz)';
  const [g] = await q(`select
      has_function_privilege('anon', '${fnSig}', 'execute') as anon,
      has_function_privilege('authenticated', '${fnSig}', 'execute') as authed`);
  check('grants: anon cannot execute the approval function', g.anon === false, g);
  check('grants: authenticated can execute (it authorises as the caller)', g.authed === true, g);
  const [pub] = await q(`select has_function_privilege('public', 'public.approve_obligation_with_stage2(uuid,uuid,text,text,jsonb,text,jsonb,text,jsonb,timestamptz)', 'execute') as p`);
  check('grants: PUBLIC cannot execute', pub.p === false, pub);

  // ---------------------------------------------------------------- SQL: happy path
  {
    const id = await mkOb();
    const before = await snap(id);
    const { data, error } = await rpc(CM, id, { p_fields: { citation: 'EDITED-CITATION', priority: 'High' } });
    check('happy path: approval succeeds', !error && data?.ok === true && data.statusChanged === true && !!data.impactAssessmentId, { data, error });
    const after = await snap(id);
    check('happy path: status OPEN, edits applied, exactly one impact, business areas written', after.status === 'OPEN' && after.citation === 'EDITED-CITATION' && after.priority === 'High' && after.impacts === 1 && after.areas === 2, after);
    check('happy path: statement untouched (not in the edit set)', after.obligation_statement === before.obligation_statement);
    const ev = await q(`select event_type, entity_type, actor_user_id from workflow_events where (entity_id = $1 or entity_id = $2) order by occurred_at, event_type`, [id, data.impactAssessmentId]);
    const types = ev.map((e) => e.event_type);
    check('happy path: audit trail is complete and causally ordered', JSON.stringify(types.filter((t) => t !== 'OBLIGATION_STATUS_CHANGED' || true).slice(-3)) === JSON.stringify(['OBLIGATION_STATUS_CHANGED', 'IMPACT_CREATED', 'IMPACT_INITIATED_FROM_OBLIGATION']), types);
    check('happy path: every event attributed to the approver', ev.slice(-3).every((e) => e.actor_user_id === CM), ev);
    const [imp] = await q(`select status::text as status, regulatory_change_id, owner_user_id, metadata->>'sourceRegulatoryObligationId' as src from impact_assessments where id = $1`, [data.impactAssessmentId]);
    check('happy path: impact is a DRAFT bound to the obligation\'s own change', imp.status === 'DRAFT' && imp.regulatory_change_id === changeId && imp.src === id, imp);
    check('happy path: integrity view reports LINKED', (await stateOf(id)) === 'LINKED');

    // idempotency and stale protection
    const again = await rpc(CM, id, { p_expected_status: 'OPEN', p_impact: { reuseOnly: true }, p_fields: {} });
    check('repeat on an already OPEN obligation reuses the impact (no duplicate, no status event)', !again.error && again.data?.reused === true && again.data.statusChanged === false && again.data.impactAssessmentId === data.impactAssessmentId, again);
    check('repeat: still exactly one impact and one status-changed event', (await snap(id)).impacts === 1 && (await q(`select 1 from workflow_events where entity_id = $1 and event_type = 'OBLIGATION_STATUS_CHANGED' and to_status = 'OPEN'`, [id])).length === 1);
    const stale = await rpc(CM, id);
    check('approving from a stale expected status is refused', /stale_record/.test(stale.error?.message ?? ''), stale);
  }

  // ---------------------------------------------------------------- SQL: failure leaves nothing behind
  {
    const id = await mkOb({ withChange: false });
    const before = await snap(id);
    const r = await rpc(CM, id, { p_fields: { citation: 'MUST-NOT-PERSIST', priority: 'High' } });
    const after = await snap(id);
    check('rollback: missing change fails the approval', /missing_regulatory_change/.test(r.error?.message ?? ''), r);
    check('rollback: status, edits, impact and events are all unchanged (failure came AFTER the status update)', JSON.stringify(after) === JSON.stringify(before), { before, after });
  }
  {
    const id = await mkOb();
    const before = await snap(id);
    await admin.query(`create or replace function public.tmp_block_stage2_event() returns trigger language plpgsql as $$ begin if new.event_type = 'IMPACT_INITIATED_FROM_OBLIGATION' then raise exception 'injected_failure_at_last_write'; end if; return new; end $$`);
    await admin.query(`create trigger tmp_block_stage2_event before insert on public.workflow_events for each row execute function public.tmp_block_stage2_event()`);
    const r = await rpc(CM, id, { p_fields: { citation: 'MUST-NOT-PERSIST-2' } });
    const failed = await snap(id);
    check('rollback: a failure injected at the very last write is reported, not swallowed', /injected_failure_at_last_write/.test(r.error?.message ?? ''), r);
    check('rollback: obligation, edits, impact, business areas and events fully rolled back', JSON.stringify(failed) === JSON.stringify(before), { before, failed });
    check('rollback: no OPEN obligation without Stage 2 exists', (await stateOf(id)) === null);
    await admin.query(`drop trigger tmp_block_stage2_event on public.workflow_events`);
    const retry = await rpc(CM, id, { p_fields: { citation: 'PERSISTS-AFTER-RETRY' } });
    const done = await snap(id);
    check('rollback: the identical request succeeds once the fault is removed', !retry.error && done.status === 'OPEN' && done.impacts === 1 && done.citation === 'PERSISTS-AFTER-RETRY', { retry, done });
  }

  // ---------------------------------------------------------------- SQL: authorisation before any mutation
  {
    const refusal = async (label, sub, args, pattern, obOpts) => {
      const id = await mkOb(obOpts);
      const before = await snap(id);
      const r = await rpc(sub, id, args);
      check(`auth: ${label} is refused`, pattern.test(r.error?.message ?? ''), r);
      check(`auth: ${label} leaves no mutation`, JSON.stringify(await snap(id)) === JSON.stringify(before));
    };
    await refusal('VIEWER', VIEW, {}, /insufficient_role/);
    await refusal('a member of another organisation', OTHER_B, {}, /insufficient_role/);
    // Maker-checker: the submitter can never approve their own submission (DB trigger, still fires inside the function).
    await refusal('the submitter approving their own submission (segregation of duties)', MAKER, {}, /segregation_of_duties/);
    await refusal('a REVIEWER approving a record they created (segregation of duties)', REV, {}, /segregation_of_duties/, { createdBy: REV });
    {
      // An independent REVIEWER IS allowed to complete a checker approval; the function must not block that
      // legitimate maker-checker path, and must still produce the full Stage 2 hand-off atomically.
      const id = await mkOb();
      const r = await rpc(REV, id);
      const s = await snap(id);
      check('auth: an independent REVIEWER (the checker) can approve and gets the full Stage 2 hand-off', !r.error && s.status === 'OPEN' && s.impacts === 1 && (await stateOf(id)) === 'LINKED', { r, s });
    }
    await refusal('caller impersonating another actor', CM, { p_actor_user_id: CM2 }, /actor_mismatch/);
    {
      const id = await mkOb();
      const before = await snap(id);
      const r = await createPgSupabaseClient(adminUrl, 'clerk_unknown_user_atomic').rpc('approve_obligation_with_stage2', {
        p_organisation_id: ORG_A, p_obligation_id: id, p_expected_status: 'IN_REVIEW', p_actor_user_id: 'clerk_unknown_user_atomic', p_impact: payload(),
      });
      check('auth: authenticated non-member is refused', /insufficient_role/.test(r.error?.message ?? ''), r);
      check('auth: non-member leaves no mutation', JSON.stringify(await snap(id)) === JSON.stringify(before));
    }
    {
      // Org B user naming Org B as the organisation but Org A's obligation id: tenant-scoped lock finds nothing.
      const id = await mkOb();
      const before = await snap(id);
      const r = await asUser(OTHER_B).rpc('approve_obligation_with_stage2', { p_organisation_id: ORG_B, p_obligation_id: id, p_expected_status: 'IN_REVIEW', p_actor_user_id: OTHER_B, p_impact: payload() });
      check('tenant: another tenant\'s obligation id is not found, not approved', /not_found/.test(r.error?.message ?? ''), r);
      check('tenant: no mutation of the victim obligation', JSON.stringify(await snap(id)) === JSON.stringify(before));
    }
    {
      // No JWT and not the service role / owner: the unauthenticated branch.
      const id = await mkOb();
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      try {
        await c.query('begin');
        await c.query('set local role forgeniq_app');
        const r = await c.query(`select public.approve_obligation_with_stage2($1, $2, 'IN_REVIEW', 'x', $3::jsonb)`, [ORG_A, id, JSON.stringify(payload())]).then(() => null, (e) => e);
        check('auth: a session with no identity is refused', /unauthenticated/.test(r?.message ?? ''), r?.message);
        await c.query('rollback');
      } finally {
        await c.end();
      }
      check('auth: unauthenticated attempt leaves no mutation', (await snap(id)).status === 'IN_REVIEW');
    }
    {
      const id = await mkOb();
      const before = await snap(id);
      const r = await rpc(CM, id, { p_expected_updated_at: '2000-01-01T00:00:00Z' });
      check('optimistic concurrency is re-checked under the row lock', /stale_record/.test(r.error?.message ?? ''), r);
      check('stale timestamp leaves no mutation', JSON.stringify(await snap(id)) === JSON.stringify(before));
    }
  }

  // ---------------------------------------------------------------- SQL: concurrency
  {
    let winners = 0;
    let stale = 0;
    for (let round = 0; round < 6; round += 1) {
      const id = await mkOb();
      const results = await Promise.all([rpc(CM, id), rpc(CM2, id), rpc(CM, id)]);
      winners += results.filter((r) => !r.error && r.data?.ok).length;
      stale += results.filter((r) => /stale_record/.test(r.error?.message ?? '')).length;
      const s = await snap(id);
      const [{ n }] = await q(`select count(*)::int as n from workflow_events where entity_id = $1 and event_type = 'OBLIGATION_STATUS_CHANGED' and to_status = 'OPEN'`, [id]);
      check(`concurrency round ${round + 1}: one impact, one OPEN transition, linked`, s.status === 'OPEN' && s.impacts === 1 && n === 1 && (await stateOf(id)) === 'LINKED', { s, n });
    }
    check('concurrency: exactly one winner per round, every loser told stale_record', winners === 6 && stale === 12, { winners, stale });
  }

  // ---------------------------------------------------------------- SQL: recorded skip and the integrity view
  {
    const id = await mkOb({ withChange: false });
    const r = await rpc(CM, id, { p_impact: null, p_skip_reason: 'missing_regulatory_change' });
    const s = await snap(id);
    const skip = await q(`select metadata->>'reason' as reason from workflow_events where entity_id = $1 and event_type = 'OBLIGATION_STAGE2_INITIATION_SKIPPED'`, [id]);
    check('skip: an obligation with no change opens with a DURABLE skip record', !r.error && s.status === 'OPEN' && s.impacts === 0 && skip[0]?.reason === 'missing_regulatory_change', { r, s, skip });
    check('skip: integrity view classifies it (not DISCONNECTED)', (await stateOf(id)) === 'NO_CHANGE_RECORDED');
  }
  {
    // A historical defect: OPEN, has a change, no impact, no recorded skip. Simulate with the owner bypass.
    const id = await mkOb();
    await forgeLegacyOpen(id);
    check('integrity view: historical OPEN-without-Stage-2 is reported DISCONNECTED', (await stateOf(id)) === 'DISCONNECTED');
    const fix = await rpc(CM, id, { p_expected_status: 'OPEN' });
    check('recovery: the atomic function repairs it in place (no status event, one impact)', !fix.error && fix.data?.statusChanged === false && (await snap(id)).impacts === 1 && (await stateOf(id)) === 'LINKED', fix);
    const [{ n }] = await q(`select count(*)::int as n from obligation_stage2_integrity where stage2_state = 'DISCONNECTED' and organisation_id = $1 and obligation_id <> all (select obligation_id from obligation_stage2_integrity where false)`, [ORG_A]);
    check('integrity view: no DISCONNECTED rows remain after recovery and the atomic approvals above', n === 0, n);
    const crossTenant = await createPgSupabaseClient(adminUrl, OTHER_B).from('obligation_stage2_integrity').select('obligation_id');
    check('integrity view: security_invoker keeps it tenant-isolated', !crossTenant.error && (crossTenant.data ?? []).length === 0, crossTenant);
  }

  // ---------------------------------------------------------------- TypeScript service on top of the function
  const approveTs = (sub, role, id, fields = { status: 'OPEN' }, extra = {}) =>
    updateObligation(createPgSupabaseClient(adminUrl, sub), { organisationId: ORG_A, obligationId: id, userId: sub, role, fields, ...extra });
  {
    const id = await mkOb();
    const row = await approveTs(CM, 'COMPLIANCE_MANAGER', id);
    const s = await snap(id);
    check('service: approval returns the committed OPEN row', row.status === 'OPEN' && s.impacts === 1 && (await stateOf(id)) === 'LINKED', { row: row.status, s });
    const again = await approveTs(CM, 'COMPLIANCE_MANAGER', id);
    check('service: repeating the request is idempotent (no second impact)', again.status === 'OPEN' && (await snap(id)).impacts === 1);
  }
  {
    // Stage 2 cannot be produced (fail-closed LIVE gate, no provider call): approval refused, obligation untouched.
    const id = await mkOb();
    const before = await snap(id);
    process.env.FORGENIQ_STAGE2_AI = 'LIVE';
    await rejects('service: Stage 2 unavailable refuses the approval', () => approveTs(CM, 'COMPLIANCE_MANAGER', id, { status: 'OPEN', citation: 'MUST-NOT-PERSIST-3' }), /RiConflictError:stage2_unavailable/);
    const after = await snap(id);
    const refusals = await q(`select metadata->>'reason' as reason, metadata->>'obligationUnchanged' as unchanged from workflow_events where entity_id = $1 and event_type = 'OBLIGATION_STAGE2_APPROVAL_REFUSED'`, [id]);
    check('service: obligation, edits, impact and events are unchanged by the refusal (except the audit record)', after.status === before.status && after.citation === before.citation && after.impacts === 0 && after.areas === 0, { before, after });
    check('service: the refusal is audited with its reason', refusals.length === 1 && /AI_EXTERNAL_PROCESSING_DISABLED/.test(refusals[0].reason) && refusals[0].unchanged === 'true', refusals);
    check('service: no OPEN obligation was left without Stage 2', (await stateOf(id)) === null);
    process.env.FORGENIQ_STAGE2_AI = 'FIXTURE';
    const retried = await approveTs(CM, 'COMPLIANCE_MANAGER', id, { status: 'OPEN', citation: 'PERSISTS-AFTER-RETRY-2' });
    check('service: the same request succeeds once Stage 2 is available (recoverable)', retried.status === 'OPEN' && retried.citation === 'PERSISTS-AFTER-RETRY-2' && (await snap(id)).impacts === 1);
  }
  {
    const id = await mkOb({ withChange: false });
    await approveTs(CM, 'COMPLIANCE_MANAGER', id);
    const s = await snap(id);
    check('service: no regulatory change opens with a durable skip record, not silently', s.status === 'OPEN' && s.events.includes('OBLIGATION_STAGE2_INITIATION_SKIPPED') && (await stateOf(id)) === 'NO_CHANGE_RECORDED', s);
  }
  {
    const id = await mkOb();
    const before = await snap(id);
    await rejects('service: stale expectedUpdatedAt is refused', () => approveTs(CM, 'COMPLIANCE_MANAGER', id, { status: 'OPEN' }, { expectedUpdatedAt: '2000-01-01T00:00:00Z' }), /stale_record/);
    check('service: stale request leaves no mutation', JSON.stringify(await snap(id)) === JSON.stringify(before));
  }
  {
    // Concurrent approvals through the service: one winner, one stale_record, one impact.
    const id = await mkOb();
    const settled = await Promise.allSettled([approveTs(CM, 'COMPLIANCE_MANAGER', id), approveTs(CM2, 'COMPLIANCE_MANAGER', id)]);
    const ok = settled.filter((s) => s.status === 'fulfilled').length;
    const stale = settled.filter((s) => s.status === 'rejected' && /stale_record/.test(String(s.reason?.message))).length;
    const s = await snap(id);
    check('service concurrency: one approval wins, the other is told stale_record', ok === 1 && stale === 1, settled.map((x) => x.status === 'fulfilled' ? 'ok' : x.reason?.message));
    check('service concurrency: exactly one impact and a linked state', s.status === 'OPEN' && s.impacts === 1 && (await stateOf(id)) === 'LINKED', s);
  }
  {
    // Governed (policy-classified) obligation: an independent REVIEWER may approve via the review-decision path,
    // atomically with Stage 2. (AI_ASSISTED rows are governed identically; their pilot-organisation fixtures live in
    // the AI pilot suites.)
    const ai = await mkOb();
    const row = await updateObligation(createPgSupabaseClient(adminUrl, REV), {
      organisationId: ORG_A, obligationId: ai, userId: REV, role: 'REVIEWER', fields: { status: 'OPEN' }, reviewDecisionOnly: true,
    });
    check('service: independent REVIEWER approves a governed obligation, atomically with its impact', row.status === 'OPEN' && (await snap(ai)).impacts === 1 && (await stateOf(ai)) === 'LINKED');
    {
      // A REVIEWER may only make the review decision: any other field edit is refused before any mutation.
      const edit = await mkOb();
      const eBefore = await snap(edit);
      await rejects('service: REVIEWER cannot smuggle field edits into an approval', () => updateObligation(createPgSupabaseClient(adminUrl, REV), {
        organisationId: ORG_A, obligationId: edit, userId: REV, role: 'REVIEWER', fields: { status: 'OPEN', priority: 'High', citation: 'SMUGGLED' }, reviewDecisionOnly: true,
      }), /./);
      check('service: refused REVIEWER edit leaves no mutation', JSON.stringify(await snap(edit)) === JSON.stringify(eBefore));
    }
    const selfApproved = await mkOb({ createdBy: REV });
    const sBefore = await snap(selfApproved);
    await rejects('service: maker/acceptor self-approval stays prohibited', () => updateObligation(createPgSupabaseClient(adminUrl, REV), {
      organisationId: ORG_A, obligationId: selfApproved, userId: REV, role: 'REVIEWER', fields: { status: 'OPEN' }, reviewDecisionOnly: true,
    }), /segregation_of_duties/);
    check('service: SoD refusal leaves no mutation', JSON.stringify(await snap(selfApproved)) === JSON.stringify(sBefore));
  }
  {
    // Legacy-disconnected OPEN obligation: the recovery path through the service repairs it.
    const id = await mkOb();
    await forgeLegacyOpen(id);
    check('recovery: historical row is DISCONNECTED before repair', (await stateOf(id)) === 'DISCONNECTED');
    await approveTs(CM, 'COMPLIANCE_MANAGER', id);
    check('recovery: re-submitting OPEN through the service links it', (await stateOf(id)) === 'LINKED' && (await snap(id)).impacts === 1);
    const direct = await ensureImpactAssessmentFromApprovedObligation(createPgSupabaseClient(adminUrl), { organisationId: ORG_A, obligationId: id, actorUserId: CM });
    check('direct ensureImpact on an OPEN obligation keeps its contract (idempotent reuse)', direct.skipped === false && direct.reused === true);
  }
  {
    const [{ n }] = await q(`select count(*)::int as n from obligation_stage2_integrity where stage2_state = 'DISCONNECTED'`);
    check('final invariant: no OPEN obligation in the database is DISCONNECTED from Stage 2', n === 0, n);
  }
} catch (e) {
  fail += 1;
  console.error(`FAIL: unexpected error — ${e?.stack || e}`);
} finally {
  await admin.end().catch(() => undefined);
  await stopEmbedded(embedded);
}

console.log(`Atomic obligation approval: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
