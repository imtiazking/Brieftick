#!/usr/bin/env node
/**
 * Isolated embedded Postgres (never staging): migration 20261121120000.
 * Per-finding UC-RI-005 review through public.ri_submit_ai_finding_review with real triggers and RLS:
 * selective acceptance, obligation text/citations by finding ID, eligibility, verified quotations,
 * atomic rollback, duplicate and concurrent submission, tenant isolation, immutability, and independent
 * approval of the resulting DRAFT obligations.
 * Requires: npm run sync:reference-catalogue
 */
import pg from 'pg';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyReferenceSeed,
  applySqlFile,
  ensureAppRole,
  platformRoot,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSession,
  withRlsSessionCommit,
} from './local-db/harness.mjs';
import {
  FINDINGS,
  GMAIL,
  OTHER,
  OUTSIDER,
  PILOT,
  QUOTES,
  REVISION,
  THIRD,
  VIEWER,
  YAHOO,
  seedFindingReviewFixtures,
  sha,
} from './local-db/finding-review-fixtures.mjs';

const MIGRATION = '20261121120000_ai_finding_review_draft_materialisation.sql';
const migrationsDir = join(platformRoot, 'supabase', 'migrations');

let failures = 0;
let passes = 0;
const check = (cond, msg, detail) => {
  if (cond) {
    passes += 1;
    console.log(`PASS: ${msg}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${msg}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
};

async function attempt(adminUrl, sub, sql, params = [], commit = false) {
  try {
    const run = commit ? withRlsSessionCommit : withRlsSession;
    const res = await run(adminUrl, sub, (c) => c.query(sql, params));
    return { ok: true, rowCount: res.rowCount, rows: res.rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

const SUBMIT = `select public.ri_submit_ai_finding_review($1, $2, $3::jsonb, $4) as r`;

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54353 });
const db = new pg.Client({ connectionString: adminUrl });
await db.connect();

try {
  await applySqlFile(db, join(platformRoot, 'scripts', 'local-db', 'auth-jwt-shim.sql'));
  await db.query(`
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql') && f < MIGRATION).sort();
  for (const f of files) await applySqlFile(db, join(migrationsDir, f));
  await ensureAppRole(db);
  await db.query(`grant all on all tables in schema public to anon, authenticated; grant authenticated to forgeniq_app;`);
  await applyReferenceSeed(db);

  // Candidates are in a different order from the findings: obligation text must follow the finding.
  const { changeId, insertRun } = await seedFindingReviewFixtures(db);
  const run1 = await insertRun('uat-1', false);
  const run2 = await insertRun('uat-2', false);
  const run3 = await insertRun('uat-3', true);

  const fingerprint = async () =>
    (
      await db.query(`select
        (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from ai_analysis_runs t) runs,
        (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from ai_analysis_citations t) cites,
        (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from ai_claim_materialisations t) mats,
        (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from regulatory_obligations t) obls`)
    ).rows[0];
  const before = await fingerprint();
  await applySqlFile(db, join(migrationsDir, MIGRATION));
  const afterMigration = await fingerprint();
  check(
    before.runs === afterMigration.runs && before.cites === afterMigration.cites && before.obls === afterMigration.obls && before.mats === afterMigration.mats,
    'migration applies without modifying existing runs, citations, materialisations or obligations',
  );

  const privs = (
    await db.query(`select has_function_privilege('anon', 'public.ri_submit_ai_finding_review(uuid,uuid,jsonb,text)', 'execute') anon,
                           has_function_privilege('authenticated', 'public.ri_submit_ai_finding_review(uuid,uuid,jsonb,text)', 'execute') auth`)
  ).rows[0];
  check(privs.anon === false && privs.auth === true, 'function executable by authenticated only (not anon)', privs);

  const decision = (ids, i, d, extra = {}) => ({
    findingId: ids[i],
    claimTextSha256: sha(FINDINGS[i].text),
    decision: d,
    comment: 'Verified against FCA FG24/6 PDF by reviewer.',
    ...extra,
  });
  const fullDecisions = (ids) => [
    decision(ids, 0, 'REJECTED'),
    decision(ids, 1, 'ACCEPTED', { classification: 'binding_requirement', legalBasis: 'PSRs 2017 reg. 86(2C)', quotation: QUOTES.notify, quotationPage: 14 }),
    decision(ids, 2, 'ACCEPTED', { classification: 'guidance_on_requirement', legalBasis: 'PSRs 2017 reg. 86(2B); FG24/6 para 3.12', quotation: QUOTES.endDelay, quotationPage: 14 }),
    decision(ids, 3, 'ACCEPTED', { classification: 'binding_requirement', legalBasis: 'PSRs 2017 reg. 86(2D)', quotation: QUOTES.liability, quotationPage: 16 }),
    decision(ids, 4, 'ACCEPTED', { classification: 'scope_exclusion' }),
  ];
  const verify = async (run, i, page, quote, user = YAHOO) =>
    db.query(
      `insert into ai_finding_quotation_verifications (organisation_id, analysis_run_id, finding_id, extraction_revision_id, page_number, quotation_sha256, page_text_sha256, verified_for_user_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [PILOT, run.runId, run.ids[i], REVISION, page, sha(quote), sha(`page ${page}`), user],
    );
  const counts = async (runId) =>
    (
      await db.query(
        `select (select count(*)::int from ai_analysis_reviews where analysis_run_id = $1) reviews,
                (select count(*)::int from ai_analysis_finding_decisions where analysis_run_id = $1) decisions,
                (select count(*)::int from regulatory_obligations where ai_analysis_run_id = $1) obligations,
                (select count(*)::int from ai_claim_materialisations where analysis_run_id = $1) mats,
                (select count(*)::int from workflow_events where entity_id = $1 or (metadata->>'analysis_run_id') = $1::text) events,
                (select review_status::text from ai_analysis_runs where id = $1) status`,
        [runId],
      )
    ).rows[0];
  const untouched = (c) => c.reviews === 0 && c.decisions === 0 && c.obligations === 0 && c.mats === 0 && c.events === 0 && c.status === 'HUMAN_REVIEW_REQUIRED';
  const submit = (sub, run, decisions, org = PILOT, commit = false) =>
    attempt(adminUrl, sub, SUBMIT, [org, run.runId, JSON.stringify(decisions), 'UAT review'], commit);

  // Direct writes that would bypass the function.
  const forgeVerification = await attempt(
    adminUrl,
    YAHOO,
    `insert into ai_finding_quotation_verifications (organisation_id, analysis_run_id, finding_id, extraction_revision_id, page_number, quotation_sha256, page_text_sha256, verified_for_user_id)
     values ($1, $2, $3, $4, 14, $5, $5, $6)`,
    [PILOT, run1.runId, run1.ids[1], REVISION, sha('x'), YAHOO],
  );
  check(!forgeVerification.ok && forgeVerification.code === '42501', 'reviewer cannot forge a quotation verification (RLS)', forgeVerification);
  const directDecision = await attempt(adminUrl, YAHOO, `insert into ai_analysis_finding_decisions (organisation_id, analysis_run_id, analysis_review_id, finding_id, claim_index, claim_text_sha256, decision, reviewer_comment, evidence_pathway, reviewer_user_id) values ($1, $2, gen_random_uuid(), $3, 1, 'x', 'ACCEPTED', 'x', 'human_verified_uat', $4)`, [PILOT, run1.runId, run1.ids[1], YAHOO]);
  check(!directDecision.ok, 'reviewer cannot insert finding decisions outside the function', directDecision.code);

  // Authorisation and segregation of duties.
  const noUser = await db.query(SUBMIT, [PILOT, run1.runId, JSON.stringify(fullDecisions(run1.ids)), null]).then(
    () => ({ ok: true }),
    (e) => ({ ok: false, message: e.message }),
  );
  check(!noUser.ok && noUser.message === 'ai_finding_review_requires_user', 'service-level call without a human user refused', noUser);
  const requester = await submit(GMAIL, run1, fullDecisions(run1.ids));
  check(!requester.ok && requester.message === 'segregation_of_duties', 'AI requester (Gmail) cannot review their own run', requester.message);
  const viewer = await submit(VIEWER, run1, fullDecisions(run1.ids));
  check(!viewer.ok && viewer.message === 'insufficient_role', 'VIEWER cannot review', viewer.message);
  const outsiderPilot = await submit(OUTSIDER, run1, fullDecisions(run1.ids));
  check(!outsiderPilot.ok && outsiderPilot.message === 'insufficient_role', 'other-organisation user refused for the pilot organisation', outsiderPilot.message);
  const outsiderOwnOrg = await submit(OUTSIDER, run1, fullDecisions(run1.ids), OTHER);
  check(!outsiderOwnOrg.ok && outsiderOwnOrg.message === 'not_found', 'other-organisation user cannot reach the run through their own organisation', outsiderOwnOrg.message);

  // Payload validation (nothing persisted).
  const incomplete = await submit(YAHOO, run1, fullDecisions(run1.ids).slice(0, 4));
  check(!incomplete.ok && incomplete.message === 'finding_decisions_incomplete', 'every finding needs an explicit decision', incomplete.message);
  const dup = fullDecisions(run1.ids);
  dup[4] = { ...dup[3] };
  const duplicated = await submit(YAHOO, run1, dup);
  check(!duplicated.ok && duplicated.message === 'finding_decisions_incomplete', 'a finding decided twice in one payload is refused', duplicated.message);
  const foreign = fullDecisions(run1.ids);
  foreign[0] = { ...foreign[0], findingId: run2.ids[0] };
  const foreignRes = await submit(YAHOO, run1, foreign);
  check(!foreignRes.ok && foreignRes.message === 'finding_decisions_incomplete', 'finding IDs from another run are refused', foreignRes.message);
  const unverified = await submit(YAHOO, run1, fullDecisions(run1.ids));
  check(!unverified.ok && unverified.message === 'finding_quotation_not_verified:2', 'obligation-class acceptance without a server-verified quotation refused', unverified.message);

  await verify(run1, 1, 14, QUOTES.notify);
  await verify(run1, 2, 14, QUOTES.endDelay);
  await verify(run1, 3, 16, QUOTES.liability);

  const wrongPage = fullDecisions(run1.ids);
  wrongPage[3] = { ...wrongPage[3], quotationPage: 14 };
  const wrongPageRes = await submit(YAHOO, run1, wrongPage);
  check(!wrongPageRes.ok && wrongPageRes.message === 'finding_quotation_page_not_cited:4', 'quotation page must be one of the finding’s cited pages', wrongPageRes.message);
  const stale = fullDecisions(run1.ids);
  stale[1] = { ...stale[1], claimTextSha256: sha('different text') };
  const staleRes = await submit(YAHOO, run1, stale);
  check(!staleRes.ok && staleRes.message === 'finding_text_mismatch:2', 'decision bound to a different statement text refused', staleRes.message);
  const shortJustification = fullDecisions(run1.ids);
  shortJustification[1] = { ...shortJustification[1], comment: 'ok' };
  const shortRes = await submit(YAHOO, run1, shortJustification);
  check(!shortRes.ok && shortRes.message === 'finding_justification_required:2', 'human-verified UAT pathway requires a reviewer justification', shortRes.message);
  const noBasis = fullDecisions(run1.ids);
  noBasis[2] = { ...noBasis[2], legalBasis: '' };
  const noBasisRes = await submit(YAHOO, run1, noBasis);
  check(!noBasisRes.ok && noBasisRes.message === 'finding_legal_basis_required:3', 'legal basis required for an obligation', noBasisRes.message);
  const tampered = fullDecisions(run1.ids);
  tampered[1] = { ...tampered[1], quotation: `${QUOTES.notify} Additional words.` };
  const tamperedRes = await submit(YAHOO, run1, tampered);
  check(!tamperedRes.ok && tamperedRes.message === 'finding_quotation_not_verified:2', 'quotation altered after verification refused', tamperedRes.message);
  const noComment = fullDecisions(run1.ids);
  noComment[0] = { ...noComment[0], comment: '  ' };
  const noCommentRes = await submit(YAHOO, run1, noComment);
  check(!noCommentRes.ok && noCommentRes.message === 'finding_comment_required:1', 'reviewer comment required for every decision', noCommentRes.message);
  check(untouched(await counts(run1.runId)), 'refused submissions persisted nothing', await counts(run1.runId));

  // Rollback: a failure after obligations were inserted leaves no review, decisions, obligations or events.
  await db.query(`
    create function public.test_fail_materialisation() returns trigger language plpgsql as $$
    begin if new.claim_index = 3 then raise exception 'test_injected_failure'; end if; return new; end $$;
    create trigger test_fail_materialisation before insert on public.ai_claim_materialisations
      for each row execute function public.test_fail_materialisation();`);
  const injected = await submit(YAHOO, run1, fullDecisions(run1.ids), PILOT, true);
  const afterFailure = await counts(run1.runId);
  check(!injected.ok && injected.message === 'test_injected_failure', 'injected failure during materialisation surfaces as an error', injected.message);
  check(untouched(afterFailure), 'rollback: no review, decisions, obligations, links or events; run still HUMAN_REVIEW_REQUIRED', afterFailure);
  await db.query(`drop trigger test_fail_materialisation on public.ai_claim_materialisations; drop function public.test_fail_materialisation();`);

  // Selective acceptance (Yahoo): findings 2, 3, 4 become DRAFT obligations; 1 rejected; 5 accepted as scope exclusion only.
  const ok = await submit(YAHOO, run1, fullDecisions(run1.ids), PILOT, true);
  const result = ok.rows?.[0]?.r;
  check(ok.ok && result?.decision === 'PARTIALLY_ACCEPTED', 'Yahoo per-finding review committed as PARTIALLY_ACCEPTED', ok.ok ? result : ok.message);
  check(result?.evidencePathway === 'human_verified_uat', 'obligationGradeSuitable=false recorded as human_verified_uat pathway', result?.evidencePathway);
  check(
    JSON.stringify((result?.materialised ?? []).map((m) => m.claimIndex)) === '[1,2,3]',
    'exactly findings 2, 3 and 4 materialised',
    result?.materialised,
  );
  check(
    result?.skipped?.length === 1 && result.skipped[0].claimIndex === 4 && result.skipped[0].reason === 'classification_not_obligation:scope_exclusion',
    'accepted scope exclusion recorded but not materialised',
    result?.skipped,
  );
  const obligations = (
    await db.query(
      `select o.*, m.finding_id from regulatory_obligations o join ai_claim_materialisations m on m.entity_id = o.id
        where o.ai_analysis_run_id = $1 order by (o.metadata->>'claimIndex')::int`,
      [run1.runId],
    )
  ).rows;
  const expected = [
    { i: 1, quote: QUOTES.notify, page: 14, cls: 'binding_requirement' },
    { i: 2, quote: QUOTES.endDelay, page: 14, cls: 'guidance_on_requirement' },
    { i: 3, quote: QUOTES.liability, page: 16, cls: 'binding_requirement' },
  ];
  check(obligations.length === 3, 'three obligations in the existing regulatory_obligations register', obligations.length);
  for (const [k, e] of expected.entries()) {
    const o = obligations[k];
    check(
      o &&
        o.obligation_statement === FINDINGS[e.i].text &&
        o.metadata.findingId === run1.ids[e.i] &&
        o.finding_id === run1.ids[e.i] &&
        o.metadata.sourceQuotation === e.quote &&
        o.metadata.quotationPage === e.page &&
        o.citation === `PDF p.${e.page}` &&
        o.metadata.classification === e.cls &&
        o.metadata.evidencePathway === 'human_verified_uat' &&
        o.metadata.obligationGradeSuitable === false,
      `finding ${e.i + 1}: statement, finding ID, quotation, page and classification match the selected finding`,
      o && { statement: o.obligation_statement, meta: o.metadata, citation: o.citation },
    );
    check(
      o && o.status === 'DRAFT' && o.origin === 'AI_ASSISTED' && o.created_by_user_id === YAHOO && o.regulatory_change_id === changeId && o.metadata.recordProvenance === 'uat_authorised',
      `finding ${e.i + 1}: DRAFT, AI_ASSISTED, created by the reviewer under the approved change`,
      o && { status: o.status, origin: o.origin, by: o.created_by_user_id },
    );
  }
  check(!obligations.some((o) => o.obligation_statement === FINDINGS[0].text || o.obligation_statement === FINDINGS[4].text), 'rejected finding 1 and scope exclusion 5 not in the register');
  const c1 = await counts(run1.runId);
  check(c1.reviews === 1 && c1.decisions === 5 && c1.mats === 3 && c1.status === 'PARTIALLY_ACCEPTED', 'one review, five finding decisions, three links, run PARTIALLY_ACCEPTED', c1);
  const events = (await db.query(`select event_type, actor_user_id from workflow_events where entity_id = $1 or (metadata->>'analysis_run_id') = $1::text order by event_type`, [run1.runId])).rows;
  check(
    JSON.stringify(events.map((e) => e.event_type)) ===
      JSON.stringify(['AI_MATERIALISATION_COMPLETED', 'AI_MATERIALISATION_SKIPPED', 'AI_OBLIGATION_MATERIALISED', 'AI_OBLIGATION_MATERIALISED', 'AI_OBLIGATION_MATERIALISED', 'AI_REVIEW_PARTIALLY_ACCEPTED']) &&
      events.every((e) => e.actor_user_id === YAHOO),
    'audit events written in the same transaction, attributed to the reviewer',
    events,
  );

  // Duplicate prevention.
  const resubmit = await submit(YAHOO, run1, fullDecisions(run1.ids), PILOT, true);
  check(!resubmit.ok && resubmit.message === 'already_reviewed', 'second submission for the same run refused', resubmit.message);
  const c1b = await counts(run1.runId);
  check(c1b.obligations === 3 && c1b.decisions === 5 && c1b.reviews === 1, 'no duplicate obligations, decisions or reviews', c1b);
  const dupLink = await db
    .query(`insert into ai_claim_materialisations (organisation_id, analysis_run_id, analysis_review_id, claim_index, finding_id, entity_type, entity_id)
            select organisation_id, analysis_run_id, analysis_review_id, claim_index, finding_id, entity_type, entity_id from ai_claim_materialisations where analysis_run_id = $1 limit 1`, [run1.runId])
    .then(() => 'inserted', (e) => e.code);
  check(dupLink === '23505', 'database refuses a second materialisation link for the same finding', dupLink);

  // Concurrent submissions for one run (Yahoo and third reviewer): exactly one commits.
  for (const user of [YAHOO, THIRD]) {
    await verify(run2, 1, 14, QUOTES.notify, user);
    await verify(run2, 2, 14, QUOTES.endDelay, user);
    await verify(run2, 3, 16, QUOTES.liability, user);
  }
  const session = async (sub) => {
    const c = new pg.Client({ connectionString: adminUrl });
    await c.connect();
    await c.query('begin');
    await c.query('set local role forgeniq_app');
    await c.query(`select set_config('app.test_jwt', $1, true)`, [JSON.stringify({ sub })]);
    return c;
  };
  const a = await session(YAHOO);
  const b = await session(THIRD);
  await a.query(SUBMIT, [PILOT, run2.runId, JSON.stringify(fullDecisions(run2.ids)), null]);
  const bPending = b.query(SUBMIT, [PILOT, run2.runId, JSON.stringify(fullDecisions(run2.ids)), null]).then(
    () => 'committed',
    (e) => e.message,
  );
  await new Promise((r) => setTimeout(r, 300));
  await a.query('commit');
  const bResult = await bPending;
  await b.query('rollback').catch(() => {});
  await a.end();
  await b.end();
  const c2 = await counts(run2.runId);
  check(bResult === 'already_reviewed' && c2.reviews === 1 && c2.obligations === 3, 'concurrent submission: second waits on the run lock and is refused', { bResult, c2 });

  // Production-grade evidence pathway is distinct; permissions are never obligations.
  await verify(run3, 1, 14, QUOTES.notify);
  const prodDecisions = [
    decision(run3.ids, 0, 'ACCEPTED', { classification: 'permission', comment: 'Permission.' }),
    decision(run3.ids, 1, 'ACCEPTED', { classification: 'binding_requirement', legalBasis: 'PSRs 2017 reg. 86(2C)', quotation: QUOTES.notify, quotationPage: 14, comment: 'Matches.' }),
    decision(run3.ids, 2, 'REJECTED', { comment: 'Guidance only.' }),
    decision(run3.ids, 3, 'REJECTED', { comment: 'Not verified.' }),
    decision(run3.ids, 4, 'REJECTED', { comment: 'Scope note.' }),
  ];
  const prod = await submit(YAHOO, run3, prodDecisions, PILOT, true);
  const prodResult = prod.rows?.[0]?.r;
  check(
    prod.ok && prodResult.evidencePathway === 'production_grounded' && prodResult.materialised.length === 1 && prodResult.skipped[0]?.reason === 'classification_not_obligation:permission',
    'obligation-grade extraction uses production_grounded pathway; accepted permission not materialised',
    prod.ok ? prodResult : prod.message,
  );

  // Tenant isolation and immutability.
  const outsiderRead = await attempt(adminUrl, OUTSIDER, `select count(*)::int n from ai_analysis_finding_decisions`);
  check(outsiderRead.ok && outsiderRead.rows[0].n === 0, 'other-organisation user sees no finding decisions', outsiderRead);
  const memberRead = await attempt(adminUrl, VIEWER, `select count(*)::int n from ai_analysis_finding_decisions where analysis_run_id = $1`, [run1.runId]);
  check(memberRead.ok && memberRead.rows[0].n === 5, 'pilot member can read the finding decisions', memberRead);
  const upd = await db.query(`update ai_analysis_finding_decisions set decision = 'ACCEPTED' where analysis_run_id = $1`, [run1.runId]).then(() => 'updated', (e) => e.message);
  const del = await db.query(`delete from ai_analysis_finding_decisions where analysis_run_id = $1`, [run1.runId]).then(() => 'deleted', (e) => e.message);
  check(upd === 'ai_finding_review_immutable' && del === 'ai_finding_review_immutable', 'finding decisions immutable even for privileged sessions', { upd, del });

  // Independent approval of the DRAFT obligations (existing ri_guard_ai_obligation_status).
  const target = obligations[0].id;
  const submitDraft = await attempt(adminUrl, YAHOO, `update regulatory_obligations set status = 'IN_REVIEW' where id = $1`, [target], true);
  check(submitDraft.ok && submitDraft.rowCount === 1, 'Yahoo submits the DRAFT obligation for approval', submitDraft);
  const yahooApprove = await attempt(adminUrl, YAHOO, `update regulatory_obligations set status = 'OPEN' where id = $1`, [target]);
  check(!yahooApprove.ok && yahooApprove.message === 'segregation_of_duties', 'Yahoo (acceptor and submitter) cannot approve', yahooApprove.message);
  const gmailApprove = await attempt(adminUrl, GMAIL, `update regulatory_obligations set status = 'OPEN' where id = $1`, [target]);
  check(!gmailApprove.ok && gmailApprove.message === 'segregation_of_duties', 'Gmail (AI requester) cannot approve', gmailApprove.message);
  const serviceApprove = await db.query(`update regulatory_obligations set status = 'OPEN' where id = $1`, [target]).then(() => 'approved', (e) => e.message);
  check(serviceApprove === 'ai_obligation_approval_requires_user', 'no autonomous (service-level) approval', serviceApprove);
  const thirdApprove = await attempt(adminUrl, THIRD, `update regulatory_obligations set status = 'OPEN' where id = $1`, [target]);
  check(thirdApprove.ok && thirdApprove.rowCount === 1, 'an independent third reviewer can approve (rolled back)', thirdApprove);
  const stillDraft = (await db.query(`select count(*)::int n from regulatory_obligations where ai_analysis_run_id = $1 and status = 'DRAFT'`, [run1.runId])).rows[0].n;
  check(stillDraft === 2, 'remaining materialised obligations stay DRAFT', stillDraft);

  const otherRunsUnchanged = (await db.query(`select count(*)::int n from regulatory_obligations where origin = 'MANUAL'`)).rows[0].n;
  check(otherRunsUnchanged === 0, 'no manual obligations were created or altered by the function', otherRunsUnchanged);

  const rollback = await applySqlFile(db, join(platformRoot, 'supabase', 'rollbacks', MIGRATION.replace('.sql', '.down.sql'))).then(
    () => 'applied',
    (e) => e.message,
  );
  check(/rollback_refused/.test(rollback), 'rollback script refuses to drop existing per-finding review evidence', rollback);
} catch (e) {
  failures += 1;
  console.error('FAIL: unexpected error', e);
} finally {
  await db.end().catch(() => {});
  await stopEmbedded(embedded);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
