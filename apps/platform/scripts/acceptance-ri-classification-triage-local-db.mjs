#!/usr/bin/env node
/**
 * Isolated embedded Postgres (never staging): migration 20261121180000.
 * Regulatory classification policy (FCA v1), legal guardrails and operator maker-checker on policy changes,
 * triage routing and conversion eligibility in public.ri_submit_ai_finding_review, the obligation register
 * guard against manual/API bypass, evidential provisions linked to binding obligations, reporting split,
 * atomic rollback, duplicates, tenant isolation and the unchanged independent approval of DRAFT obligations.
 * Also applies the migration over a review recorded under the previous function to prove existing rows are
 * untouched. Requires: npm run sync:reference-catalogue
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
  CATALOG,
  CANDIDATES,
  FINDINGS,
  GMAIL,
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

const MIGRATION = '20261121180000_ri_regulatory_classification_policy.sql';
const GRANTS_MIGRATION = '20261121220000_ri_classification_trigger_function_grants.sql';
const migrationsDir = join(platformRoot, 'supabase', 'migrations');
const OP1 = 'user_platform_operator_1';
const OP2 = 'user_platform_operator_2';

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

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54357 });
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

  const { changeId, insertRun, pubId } = await seedFindingReviewFixtures(db);
  const run1 = await insertRun('cls-1', false);
  const legacyRun = await insertRun('cls-legacy', false);
  const run3 = await insertRun('cls-3', true);

  const decision = (ids, i, d, extra = {}) => ({
    findingId: ids[i],
    claimTextSha256: sha(FINDINGS[i].text),
    decision: d,
    comment: 'Verified against the FCA PDF by the reviewer.',
    ...extra,
  });
  const verify = async (run, i, page, quote, user = YAHOO) =>
    db.query(
      `insert into ai_finding_quotation_verifications (organisation_id, analysis_run_id, finding_id, extraction_revision_id, page_number, quotation_sha256, page_text_sha256, verified_for_user_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [PILOT, run.runId, run.ids[i], REVISION, page, sha(quote), sha(`page ${page}`), user],
    );
  const submit = (sub, run, decisions, commit = false) =>
    attempt(adminUrl, sub, SUBMIT, [PILOT, run.runId, JSON.stringify(decisions), 'Classification UAT'], commit);

  // A review committed under the previous function (guidance_on_requirement still converted then).
  await verify(legacyRun, 2, 14, QUOTES.endDelay);
  const legacy = await submit(
    YAHOO,
    legacyRun,
    [
      decision(legacyRun.ids, 0, 'REJECTED'),
      decision(legacyRun.ids, 1, 'REJECTED'),
      decision(legacyRun.ids, 2, 'ACCEPTED', { classification: 'guidance_on_requirement', legalBasis: 'FG24/6 para 3.12', quotation: QUOTES.endDelay, quotationPage: 14 }),
      decision(legacyRun.ids, 3, 'REJECTED'),
      decision(legacyRun.ids, 4, 'REJECTED'),
    ],
    true,
  );
  check(legacy.ok && legacy.rows[0].r.materialised.length === 1, 'pre-migration: previous function converted guidance on a requirement (the defect)', legacy.ok ? legacy.rows[0].r : legacy.message);
  const legacyObligation = legacy.rows?.[0]?.r?.materialised?.[0]?.obligationId;

  const manualObligation = (
    await db.query(
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin)
       values ($1, $2, $3, 'Existing manual obligation (unclassified).', 'OPEN', 'MANUAL') returning id`,
      [PILOT, changeId, pubId],
    )
  ).rows[0].id;

  const fingerprint = async () =>
    (
      await db.query(`select
        (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from ai_analysis_runs t) runs,
        (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from ai_analysis_citations t) cites,
        (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from ai_analysis_reviews t) reviews,
        (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from ai_claim_materialisations t) mats,
        (select md5(coalesce(string_agg(t::text, '|' order by id), '')) from regulatory_obligations t) obls,
        (select md5(coalesce(string_agg((to_jsonb(t) - array['regulatory_classification_code','legal_status','classification_policy_id','triage_queue','exception_reasons','disposition','linked_obligation_id','reclassification_evidence'])::text, '|' order by id), '')) from ai_analysis_finding_decisions t) decisions`)
    ).rows[0];
  const before = await fingerprint();
  await applySqlFile(db, join(migrationsDir, MIGRATION));
  const after = await fingerprint();
  check(JSON.stringify(before) === JSON.stringify(after), 'migration applies over existing reviews, decisions and obligations without modifying them', { before, after });
  await applySqlFile(db, join(migrationsDir, GRANTS_MIGRATION));
  const triggerFnGrants = (
    await db.query(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
                       and p.proname in ('ri_guard_obligation_classification', 'ri_guard_classification_policy_change', 'ri_guard_classification_policy_entry_change', 'ri_audit_classification_policy_insert', 'ri_refuse_classification_policy_event_change')`)
  ).rows;
  check(triggerFnGrants.length === 5 && triggerFnGrants.every((g) => !g.anon && !g.auth), 'classification trigger functions are not executable by anon or authenticated (all later writes run under these grants)', triggerFnGrants);

  // A binding obligation created manually against the verified authoritative provision (not the guidance text).
  const PROVISION = {
    reference: 'Payment Services Regulations 2017, regulation 86',
    sourceUrl: 'https://www.legislation.gov.uk/uksi/2017/752/regulation/86',
    quotation: 'TEST DATA — provision text as verified by the creator on legislation.gov.uk.',
  };
  const manualMeta = (code, extra = {}) => ({ regulatoryClassificationCode: code, legalBasis: 'PSRs 2017 reg. 86', authoritativeProvision: PROVISION, ...extra });
  const insertManual = (sub, meta, { status = 'DRAFT', change = changeId, pub = pubId, createdBy = null, commit = false } = {}) =>
    attempt(
      adminUrl,
      sub,
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin, metadata, created_by_user_id)
       values ($1, $2, $3, 'Manual obligation', $4::obligation_status, 'MANUAL', $5::jsonb, $6) returning id, metadata, created_by_user_id, status`,
      [PILOT, change, pub, status, JSON.stringify(meta), createdBy],
      commit,
    );
  const verifiedRes = await insertManual(THIRD, manualMeta('UK'), { commit: true });
  const verifiedObligation = verifiedRes.rows?.[0]?.id;
  const verifiedMeta = verifiedRes.rows?.[0]?.metadata;
  check(
    verifiedRes.ok &&
      verifiedRes.rows[0].created_by_user_id === THIRD &&
      verifiedRes.rows[0].status === 'DRAFT' &&
      verifiedMeta.legalStatus === 'binding' &&
      verifiedMeta.authoritativeProvision.verifiedBy === THIRD &&
      verifiedMeta.authoritativeProvision.sourceUrl === PROVISION.sourceUrl,
    'manual UK obligation created as DRAFT against the authoritative provision; creator and verifier recorded by the server',
    verifiedRes.ok ? verifiedRes.rows[0] : verifiedRes.message,
  );

  // 1. Seeded FCA policy.
  const pol = (await db.query(`select p.*, (select count(*)::int from regulatory_classification_policy_entries e where e.policy_id = p.id) n from regulatory_classification_policies p`)).rows;
  check(pol.length === 1 && pol[0].regulator_key === 'REG-FCA' && pol[0].status === 'ACTIVE' && pol[0].policy_version === 1 && pol[0].n === 21, 'FCA v1 active with 21 entries', pol);
  const yes = (await db.query(`select string_agg(code, ',' order by code) c from regulatory_classification_policy_entries where conversion_enabled`)).rows[0].c;
  check(yes === 'D,E,EU,P,R,TS,UK', 'only R, E, D, P, UK, EU, TS are conversion-enabled', yes);
  const seedEvents = (await db.query(`select string_agg(event_type, ',' order by created_at, event_type) e, count(*)::int n from regulatory_classification_policy_events`)).rows[0];
  check(seedEvents.n === 23 && /POLICY_PROPOSED/.test(seedEvents.e) && /POLICY_ACTIVE/.test(seedEvents.e), 'seed recorded in audit history (proposal, 21 entries, activation)', seedEvents);

  // 2. Legal guardrails cannot be bypassed, even by privileged sessions.
  const draftPolicy = (
    await db.query(
      `insert into regulatory_classification_policies (regulator_key, policy_version, effective_from, non_binding_publication_types, change_reason, created_by_user_id)
       values ('REG-PRA', 1, current_date, public.ri_mandatory_non_binding_publication_types(), 'Guardrail test policy for PRA.', 'tester') returning id`,
    )
  ).rows[0].id;
  const insEntry = (code, conv, queue, link = false, status = null) =>
    db
      .query(
        `insert into regulatory_classification_policy_entries (policy_id, code, description, legal_status, conversion_enabled, destination_queue, supporting_obligation_link_required)
         values ($1, $2, 'test', coalesce($6, public.ri_classification_code_legal_status($2)), $3, $4, $5)`,
        [draftPolicy, code, conv, queue, link, status],
      )
      .then(() => 'inserted', (e) => e.code);
  check((await insEntry('G', true, 'OBLIGATION_TRIAGE')) === '23514', 'privileged insert enabling conversion for Guidance refused by constraint');
  check((await insEntry('GBR', true, 'OBLIGATION_TRIAGE', false, 'binding')) === '23514', 'relabelling GBR as binding refused (legal status fixed)');
  check((await insEntry('E', true, 'OBLIGATION_TRIAGE', false)) === '23514', 'E without supporting-link requirement refused');
  check((await insEntry('UNKNOWN', false, 'NON_OBLIGATION_TRIAGE')) === '23514', 'UNKNOWN outside Exception Triage refused');
  check((await insEntry('R', false, 'OBLIGATION_TRIAGE')) === '23514', 'Obligation Triage without conversion refused');
  check(['23514', '23502'].includes(await insEntry('ZZ', false, 'EXCEPTION_TRIAGE')), 'non-canonical code refused');
  const floor = await db
    .query(`insert into regulatory_classification_policies (regulator_key, policy_version, effective_from, non_binding_publication_types, change_reason, created_by_user_id) values ('REG-PRA', 2, current_date, array['news'], 'Floor test policy for PRA.', 'tester')`)
    .then(() => 'inserted', (e) => e.code);
  check(floor === '23514', 'policy without the mandatory non-binding publication types refused');
  const activateNoUnknown = await db.query(`update regulatory_classification_policies set status = 'ACTIVE', approved_by_user_id = 'checker', approved_at = now() where id = $1`, [draftPolicy]).then(() => 'activated', (e) => e.message);
  check(activateNoUnknown === 'classification_policy_unknown_entry_required', 'a policy cannot be activated without an UNKNOWN entry', activateNoUnknown);
  const fcaId = pol[0].id;
  const editActive = await db.query(`update regulatory_classification_policy_entries set conversion_enabled = false, destination_queue = 'NON_OBLIGATION_TRIAGE' where policy_id = $1 and code = 'R'`, [fcaId]).then(() => 'updated', (e) => e.message);
  check(editActive === 'classification_policy_immutable', 'entries of an active policy are immutable', editActive);
  const delPolicy = await db.query(`delete from regulatory_classification_policies where id = $1`, [fcaId]).then(() => 'deleted', (e) => e.message);
  check(delPolicy === 'classification_policy_immutable', 'policies cannot be deleted', delPolicy);
  const editEvents = await db.query(`delete from regulatory_classification_policy_events`).then(() => 'deleted', (e) => e.message);
  check(editEvents === 'classification_policy_events_append_only', 'policy audit history is append-only', editEvents);
  const tenantWrite = await attempt(adminUrl, YAHOO, `update regulatory_classification_policy_entries set description = 'x' where code = 'G'`, [], true);
  const tenantInsert = await attempt(adminUrl, YAHOO, `insert into regulatory_classification_policies (regulator_key, policy_version, effective_from, non_binding_publication_types, change_reason, created_by_user_id) values ('REG-X', 1, current_date, public.ri_mandatory_non_binding_publication_types(), 'Tenant insert attempt.', 'x')`, [], true);
  const gDescription = (await db.query(`select description from regulatory_classification_policy_entries where code = 'G' and policy_id = $1`, [pol[0].id])).rows[0].description;
  check((!tenantWrite.ok || tenantWrite.rowCount === 0) && !tenantInsert.ok && gDescription === 'Guidance', 'tenant users cannot write policy configuration (no RLS write policy)', { tenantWrite, tenantInsert: tenantInsert.message });
  const tenantRead = await attempt(adminUrl, OUTSIDER, `select count(*)::int n from regulatory_classification_policy_entries`);
  check(tenantRead.ok && tenantRead.rows[0].n >= 21, 'signed-in users can read the policy (global reference configuration)', tenantRead);
  const tenantEvents = await attempt(adminUrl, YAHOO, `select count(*)::int n from regulatory_classification_policy_events`);
  check(tenantEvents.ok && tenantEvents.rows[0].n === 0, 'policy audit history visible to platform operators only', tenantEvents);

  // 3. Per-finding review under the policy (publication type TEST: not a non-binding source).
  await verify(run1, 1, 14, QUOTES.notify);
  await verify(run1, 3, 16, QUOTES.liability);
  const evidence2 = { legalBasis: 'PSRs 2017 reg. 86(2C)', quotation: QUOTES.notify, quotationPage: 14 };
  const evidence4 = { legalBasis: 'PSRs 2017 reg. 86(2D)', quotation: QUOTES.liability, quotationPage: 16 };
  const reclass = 'Reg 86(2C) PSRs 2017 imposes this duty; the FG text restates it.';
  const good = (ids) => [
    decision(ids, 0, 'REJECTED'),
    decision(ids, 1, 'ACCEPTED', { regulatoryClassificationCode: 'UK', ...evidence2, reclassificationEvidence: reclass }),
    decision(ids, 2, 'ACCEPTED', { regulatoryClassificationCode: 'GBR', disposition: 'LINK_TO_EXISTING_OBLIGATION', linkedObligationId: verifiedObligation }),
    decision(ids, 3, 'ACCEPTED', { regulatoryClassificationCode: 'E', ...evidence4, supportingFindingId: ids[1] }),
    decision(ids, 4, 'ACCEPTED', { regulatoryClassificationCode: 'EXEMPT', disposition: 'ARCHIVE' }),
  ];
  const variant = (i, patch) => {
    const d = good(run1.ids);
    d[i] = { ...d[i], ...patch };
    return d;
  };
  const refused = async (decisions, expected, label) => {
    const r = await submit(YAHOO, run1, decisions);
    check(!r.ok && r.message === expected, label, r.message);
  };
  await refused(variant(1, { regulatoryClassificationCode: undefined, classification: 'binding_requirement' }), 'finding_classification_code_required:2', 'accepted finding without a classification code refused (legacy payload)');
  await refused(variant(2, { disposition: 'CONVERT_TO_DRAFT_OBLIGATION', legalBasis: 'FG24/6 3.12', quotation: QUOTES.endDelay, quotationPage: 14 }), 'finding_conversion_not_permitted:3', 'guidance on binding requirements (GBR) cannot be converted');
  await refused(variant(1, { reclassificationEvidence: null }), 'finding_classification_conflict:2', 'binding code contradicting the model guidance label needs evidence-based reclassification');
  await refused(variant(3, { supportingFindingId: null }), 'finding_binding_link_required:4', 'evidential provision without a binding link refused');
  await refused(variant(3, { supportingFindingId: run1.ids[2] }), 'finding_binding_link_invalid:4', 'evidential provision linked to an unconverted finding refused');
  await refused(variant(3, { supportingFindingId: null, supportingObligationId: manualObligation }), 'finding_binding_link_invalid:4', 'evidential provision linked to an unclassified obligation refused');
  await refused(variant(4, { regulatoryClassificationCode: 'UNKNOWN', disposition: 'CONVERT_TO_DRAFT_OBLIGATION' }), 'finding_classification_unknown:5', 'UNKNOWN classification blocked from conversion');
  await refused(variant(4, { regulatoryClassificationCode: 'EXEMPT', disposition: 'CONVERT_TO_DRAFT_OBLIGATION' }), 'finding_conversion_not_permitted:5', 'exemption cannot be converted');
  await refused(variant(4, { regulatoryClassificationCode: 'C', disposition: 'CONVERT_TO_DRAFT_OBLIGATION', ...evidence2 }), 'finding_conversion_not_permitted:5', 'C (market abuse conclusive provision) cannot be converted');
  await refused(variant(4, { regulatoryClassificationCode: 'XYZ' }), 'finding_classification_unknown:5', 'code outside the canonical vocabulary refused');
  await refused(variant(1, { disposition: 'ARCHIVE' }), 'finding_disposition_not_allowed:2', 'an Obligation Triage finding cannot be archived');
  await refused(variant(2, { linkedObligationId: '00000000-0000-4000-8000-000000000000' }), 'finding_linked_obligation_required:3', 'link to a non-existent obligation refused');
  await refused(variant(2, { linkedObligationId: manualObligation }), 'finding_linked_obligation_unclassified:3', 'guidance cannot be linked to an unclassified legacy obligation');
  await refused(variant(1, { legalBasis: '' }), 'finding_legal_basis_required:2', 'missing legal basis blocks conversion');
  const counts = async (runId) =>
    (
      await db.query(
        `select (select count(*)::int from ai_analysis_reviews where analysis_run_id = $1) reviews,
                (select count(*)::int from ai_analysis_finding_decisions where analysis_run_id = $1) decisions,
                (select count(*)::int from regulatory_obligations where ai_analysis_run_id = $1) obligations,
                (select count(*)::int from ai_claim_materialisations where analysis_run_id = $1) mats,
                (select review_status::text from ai_analysis_runs where id = $1) status`,
        [runId],
      )
    ).rows[0];
  const c0 = await counts(run1.runId);
  check(c0.reviews === 0 && c0.decisions === 0 && c0.obligations === 0 && c0.status === 'HUMAN_REVIEW_REQUIRED', 'refused submissions persisted nothing', c0);

  // Atomic rollback after the binding obligation was inserted.
  await db.query(`
    create function public.test_fail_e() returns trigger language plpgsql as $$
    begin if new.claim_index = 3 then raise exception 'test_injected_failure'; end if; return new; end $$;
    create trigger test_fail_e before insert on public.ai_claim_materialisations for each row execute function public.test_fail_e();`);
  const injected = await submit(YAHOO, run1, good(run1.ids), true);
  const c1 = await counts(run1.runId);
  check(!injected.ok && injected.message === 'test_injected_failure' && c1.reviews === 0 && c1.obligations === 0 && c1.decisions === 0, 'failure on the evidential conversion rolls back the binding obligation and every decision', { injected: injected.message, c1 });
  await db.query(`drop trigger test_fail_e on public.ai_claim_materialisations; drop function public.test_fail_e();`);

  const requester = await submit(GMAIL, run1, good(run1.ids));
  check(!requester.ok && requester.message === 'segregation_of_duties', 'AI requester still cannot review their own run', requester.message);

  const ok = await submit(YAHOO, run1, good(run1.ids), true);
  const result = ok.rows?.[0]?.r;
  check(ok.ok && result.decision === 'PARTIALLY_ACCEPTED' && result.classificationPolicyVersion === 1, 'review committed under FCA policy v1', ok.ok ? result : ok.message);
  check(JSON.stringify(result?.materialised?.map((m) => [m.claimIndex, m.classificationCode, m.legalStatus])) === JSON.stringify([[1, 'UK', 'binding'], [3, 'E', 'evidential']]), 'only the UK legislation finding and its linked evidential provision became DRAFT obligations', result?.materialised);
  const obls = (await db.query(`select * from regulatory_obligations where ai_analysis_run_id = $1 order by (metadata->>'claimIndex')::int`, [run1.runId])).rows;
  const [bind, evid] = obls;
  check(bind?.status === 'DRAFT' && bind.metadata.legalStatus === 'binding' && bind.metadata.regulatoryClassificationCode === 'UK' && bind.metadata.classificationPolicyVersion === 1 && bind.metadata.regulatorKey === 'REG-FCA' && bind.metadata.reclassificationEvidence === reclass && bind.metadata.sourceQuotation === QUOTES.notify, 'binding obligation keeps code, legal status, policy version, quotation and reclassification evidence', bind?.metadata);
  check(evid?.status === 'DRAFT' && evid.metadata.legalStatus === 'evidential' && evid.metadata.regulatoryClassificationCode === 'E' && evid.metadata.supportsObligationId === bind?.id, 'evidential provision keeps E and is linked to the binding obligation', evid?.metadata);
  const decisions = (await db.query(`select * from ai_analysis_finding_decisions where analysis_run_id = $1 order by claim_index`, [run1.runId])).rows;
  check(decisions.length === 5 && decisions.every((d) => d.triage_queue), 'every finding (including rejected) has a recorded triage destination', decisions.map((d) => d.triage_queue));
  check(
    JSON.stringify(decisions.map((d) => [d.triage_queue, d.disposition])) ===
      JSON.stringify([
        ['EXCEPTION_TRIAGE', null],
        ['OBLIGATION_TRIAGE', 'CONVERT_TO_DRAFT_OBLIGATION'],
        ['NON_OBLIGATION_TRIAGE', 'LINK_TO_EXISTING_OBLIGATION'],
        ['OBLIGATION_TRIAGE', 'CONVERT_TO_DRAFT_OBLIGATION'],
        ['NON_OBLIGATION_TRIAGE', 'ARCHIVE'],
      ]),
    'queues and dispositions recorded per finding',
    decisions.map((d) => [d.triage_queue, d.disposition, d.exception_reasons]),
  );
  check(decisions[0].exception_reasons.includes('conflicting_classifications'), 'rejected finding 1 recorded in Exception Triage with its reason (model labels conflict)', decisions[0].exception_reasons);
  check(decisions[2].linked_obligation_id === verifiedObligation && decisions[2].obligation_id === null, 'guidance finding linked to the verified binding obligation and retained as supporting triage; no new obligation', decisions[2]);
  const report = (await db.query(`select reporting_category, classification_review_required, count(*)::int n from ri_obligation_legal_classification where organisation_id = $1 group by 1, 2 order by 1`, [PILOT])).rows;
  check(
    JSON.stringify(report) ===
      JSON.stringify([
        { reporting_category: 'BINDING_OBLIGATION', classification_review_required: false, n: 2 },
        { reporting_category: 'EVIDENTIAL_REQUIREMENT', classification_review_required: false, n: 1 },
        { reporting_category: 'UNCLASSIFIED', classification_review_required: true, n: 2 },
      ]),
    'reporting separates binding obligations and evidential requirements; legacy unclassified obligations flagged for review',
    report,
  );
  const resubmit = await submit(YAHOO, run1, good(run1.ids), true);
  const c2 = await counts(run1.runId);
  check(!resubmit.ok && resubmit.message === 'already_reviewed' && c2.obligations === 2 && c2.decisions === 5, 'duplicate submission refused; no duplicate obligations', { msg: resubmit.message, c2 });

  // 4. A finding from finalised guidance (FG24/6 shape) cannot be converted, only triaged.
  const fgPub = (
    await db.query(
      `insert into regulatory_publications (source_id, regulator_id, title, publication_type, canonical_url, data_origin, provenance)
       select source_id, regulator_id, 'TEST DATA — FG24/6-shaped finalised guidance', 'finalised_guidance', 'https://example.test/fg', data_origin, provenance
         from regulatory_publications where id = $1 returning id`,
      [pubId],
    )
  ).rows[0].id;
  const fgChange = (await db.query(`insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, metadata) values ($1, $2, 'FG change', 'TEST', 'OPEN', '{"recordProvenance":"uat_authorised"}'::jsonb) returning id`, [PILOT, fgPub])).rows[0].id;
  const fgOutput = {
    claims: FINDINGS.map((f) => ({ text: f.text, confidence: 100, sourceSectionIds: f.sections })),
    candidates: CANDIDATES,
    _forgeniqGrounding: { kind: 'pdf_primary_v1', extractionRevisionId: REVISION, obligationGradeSuitable: true, sectionCatalog: CATALOG },
  };
  const fgVer = (await db.query(`insert into regulatory_publication_versions (publication_id, version_number, source_hash, canonical_url, retrieved_at) values ($1, 1, 'hash-fg', 'https://example.test/fg', now()) returning id`, [fgPub])).rows[0].id;
  const fgRunId = (await db.query(`insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version, requested_by, execution_status, review_status, idempotency_key, structured_output, target_entity_id) values ($1, 'UC-RI-005', $2, $6, 'ANTHROPIC', 'v1', $3, 'COMPLETED', 'HUMAN_REVIEW_REQUIRED', 'cls-fg', $4, $5) returning id`, [PILOT, fgPub, GMAIL, JSON.stringify(fgOutput), fgChange, fgVer])).rows[0].id;
  const fgIds = [];
  for (const [i, f] of FINDINGS.entries()) {
    fgIds.push((await db.query(`insert into ai_analysis_citations (organisation_id, analysis_run_id, claim_index, claim_text, source_section_ids, citation_status) values ($1, $2, $3, $4, $5, 'VERIFIED') returning id`, [PILOT, fgRunId, i, f.text, f.sections])).rows[0].id);
  }
  const fgRun = { runId: fgRunId, ids: fgIds };
  await verify(fgRun, 3, 16, QUOTES.liability);
  const fgConvert = await submit(YAHOO, fgRun, [
    decision(fgIds, 0, 'REJECTED'),
    decision(fgIds, 1, 'REJECTED'),
    decision(fgIds, 2, 'REJECTED'),
    decision(fgIds, 3, 'ACCEPTED', { regulatoryClassificationCode: 'UK', ...evidence4 }),
    decision(fgIds, 4, 'REJECTED'),
  ]);
  check(!fgConvert.ok && fgConvert.message === 'finding_source_not_binding:4', 'binding conversion from finalised guidance refused even at model confidence 100', fgConvert.message);
  const fgTriage = await submit(YAHOO, fgRun, [
    decision(fgIds, 0, 'ACCEPTED', { regulatoryClassificationCode: 'PERM', disposition: 'SUPPORTING_INFORMATION' }),
    decision(fgIds, 1, 'ACCEPTED', { regulatoryClassificationCode: 'GBR', disposition: 'HORIZON_SCANNING' }),
    decision(fgIds, 2, 'ACCEPTED', { regulatoryClassificationCode: 'GBR', disposition: 'RECLASSIFICATION_REQUESTED' }),
    decision(fgIds, 3, 'ACCEPTED', { regulatoryClassificationCode: 'GBR', disposition: 'LINK_TO_EXISTING_OBLIGATION', linkedObligationId: verifiedObligation }),
    decision(fgIds, 4, 'ACCEPTED', { regulatoryClassificationCode: 'UNKNOWN' }),
  ], true);
  const fgDecisions = (await db.query(`select triage_queue, disposition from ai_analysis_finding_decisions where analysis_run_id = $1 order by claim_index`, [fgRunId])).rows;
  check(fgTriage.ok && fgTriage.rows[0].r.materialised.length === 0 && fgTriage.rows[0].r.skipped.length === 5, 'FG findings all triaged, none converted, none discarded', fgTriage.ok ? fgTriage.rows[0].r : fgTriage.message);
  check(fgDecisions[4].triage_queue === 'EXCEPTION_TRIAGE' && fgDecisions[4].disposition === 'SUPPORTING_INFORMATION' && fgDecisions.slice(0, 4).every((d) => d.triage_queue === 'NON_OBLIGATION_TRIAGE'), 'UNKNOWN routed to Exception Triage; guidance and permissions to Non-Obligation Triage', fgDecisions);

  // Production-grounded run: R conversion still works for a binding source.
  await verify(run3, 3, 16, QUOTES.liability);
  const prod = await submit(YAHOO, run3, [
    decision(run3.ids, 0, 'REJECTED'),
    decision(run3.ids, 1, 'REJECTED'),
    decision(run3.ids, 2, 'REJECTED'),
    decision(run3.ids, 3, 'ACCEPTED', { regulatoryClassificationCode: 'R', ...evidence4, comment: 'Matches the rule.' }),
    decision(run3.ids, 4, 'ACCEPTED', { regulatoryClassificationCode: 'DEF' }),
  ], true);
  check(prod.ok && prod.rows[0].r.materialised.length === 1 && prod.rows[0].r.evidencePathway === 'production_grounded', 'production-grounded R conversion from a binding source succeeds', prod.ok ? prod.rows[0].r : prod.message);

  // 5. Obligation register guard: manual and direct API bypass attempts.
  const direct = async (meta, origin = 'MANUAL', pub = pubId, change = changeId) =>
    attempt(
      adminUrl,
      YAHOO,
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin, metadata)
       values ($1, $2, $3, 'Direct insert', 'DRAFT', $4, $5::jsonb) returning id, metadata`,
      [PILOT, change, pub, origin, JSON.stringify(meta)],
    );
  let r = await direct({ findingId: run1.ids[2] });
  check(!r.ok && r.message === 'finding_conversion_requires_review', 'manual obligation carrying a finding ID refused (must go through review)', r.message);
  for (const code of ['G', 'GBR', 'C', 'UNKNOWN']) {
    r = await direct(manualMeta(code));
    check(!r.ok && r.message === `obligation_conversion_not_permitted:${code}`, `manual obligation classified as ${code} refused even with a legal basis and provision`, r.message);
  }
  r = await direct({});
  check(!r.ok && r.message === 'obligation_classification_required', 'manual obligation without a classification refused', r.message);
  r = await direct({ legalStatus: 'binding' });
  check(!r.ok && r.message === 'obligation_classification_required', 'self-asserted legal status without a code refused', r.message);
  r = await direct({ regulatoryClassificationCode: 'R' });
  check(!r.ok && r.message === 'obligation_legal_basis_required', 'manual obligation without a legal basis refused', r.message);
  r = await direct(manualMeta('R', { authoritativeProvision: undefined }));
  check(!r.ok && r.message === 'obligation_authoritative_provision_required', 'manual obligation without a verified authoritative provision refused', r.message);
  r = await direct(manualMeta('R', { authoritativeProvision: { ...PROVISION, quotation: 'too short' } }));
  check(!r.ok && r.message === 'obligation_authoritative_provision_required', 'authoritative provision without a substantive quotation refused', r.message);
  r = await direct(manualMeta('R', { authoritativeProvision: { ...PROVISION, sourceUrl: 'https://www.fca.org.uk/publication/finalised-guidance/fg24-6.pdf' } }));
  check(!r.ok && r.message === 'obligation_authoritative_source_invalid', 'guidance document cited as the authoritative source refused', r.message);
  r = await insertManual(YAHOO, manualMeta('R'), { status: 'OPEN' });
  check(!r.ok && r.message === 'classified_obligation_must_start_draft', 'manual obligation cannot be created already approved', r.message);
  r = await insertManual(YAHOO, manualMeta('R'), { createdBy: THIRD });
  check(!r.ok && r.message === 'obligation_creator_mismatch', 'creator cannot be attributed to another user', r.message);
  r = await direct(manualMeta('R'), 'MANUAL', fgPub, fgChange);
  check(r.ok && r.rows[0].metadata.legalStatus === 'binding' && r.rows[0].metadata.sourcePublicationType === 'finalised_guidance', 'binding requirement referenced by finalised guidance can be recorded against the verified authoritative provision (rolled back)', r.ok ? r.rows[0].metadata : r.message);
  r = await direct(manualMeta('E'));
  check(!r.ok && r.message === 'obligation_binding_link_required', 'manual evidential provision without a binding obligation refused', r.message);
  r = await direct(manualMeta('E', { supportsObligationId: manualObligation }));
  check(!r.ok && r.message === 'obligation_binding_link_required', 'evidential obligation linked to an unclassified obligation refused', r.message);
  r = await direct(manualMeta('E', { supportsObligationId: verifiedObligation }));
  check(r.ok && r.rows[0].metadata.legalStatus === 'evidential' && r.rows[0].metadata.supportsObligationId === verifiedObligation, 'manual evidential provision linked to a verified binding obligation allowed and kept distinct (rolled back)', r.ok ? r.rows[0].metadata : r.message);
  r = await direct(manualMeta('R', { legalStatus: 'evidential' }));
  check(r.ok && r.rows[0].metadata.legalStatus === 'binding' && r.rows[0].metadata.classificationPolicyVersion === 1, 'manual R obligation allowed; legal status stamped by the server, not the client (rolled back)', r.ok ? r.rows[0].metadata : r.message);
  const cEntry = (await db.query(`select conversion_enabled, destination_queue, legal_status, description from regulatory_classification_policy_entries where policy_id = $1 and code = 'C'`, [fcaId])).rows[0];
  check(cEntry.conversion_enabled === false && cEntry.destination_queue === 'NON_OBLIGATION_TRIAGE' && /market abuse/i.test(cEntry.description), 'C (market abuse conclusive provisions) routes to Non-Obligation Triage without conversion', cEntry);
  const review1 = result.reviewId;
  const aiNoCode = await attempt(
    adminUrl,
    YAHOO,
    `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin, ai_analysis_run_id, ai_analysis_review_id, created_by_user_id)
     values ($1, $2, $3, 'Legacy claim-index materialisation', 'DRAFT', 'AI_ASSISTED', $4, $5, $6)`,
    [PILOT, changeId, pubId, run1.runId, review1, YAHOO],
  );
  check(!aiNoCode.ok && aiNoCode.message === 'obligation_classification_required', 'AI_ASSISTED obligation without a classification (legacy path / API) refused', aiNoCode.message);
  const reclassify = await attempt(adminUrl, YAHOO, `update regulatory_obligations set metadata = jsonb_set(metadata, '{regulatoryClassificationCode}', '"G"') where id = $1`, [bind.id]);
  check(!reclassify.ok && reclassify.message === 'obligation_classification_immutable', 'classification of an existing obligation cannot be edited', reclassify.message);
  const privileged = await db.query(`update regulatory_obligations set metadata = metadata - 'legalStatus' where id = $1`, [evid.id]).then(() => 'updated', (e) => e.message);
  check(privileged === 'obligation_classification_immutable', 'classification metadata immutable even for privileged sessions', privileged);
  const legacyUntouched = (await db.query(`select metadata from regulatory_obligations where id = $1`, [legacyObligation])).rows[0].metadata;
  check(legacyUntouched.classification === 'guidance_on_requirement' && !('legalStatus' in legacyUntouched), 'pre-migration guidance obligation left unchanged (flagged by the remediation audit, not altered)', legacyUntouched);

  // 6. Independent approval unchanged.
  const submitDraft = await attempt(adminUrl, YAHOO, `update regulatory_obligations set status = 'IN_REVIEW' where id = $1`, [bind.id], true);
  check(submitDraft.ok && submitDraft.rowCount === 1, 'Yahoo submits the binding DRAFT obligation');
  const yahooApprove = await attempt(adminUrl, YAHOO, `update regulatory_obligations set status = 'OPEN' where id = $1`, [bind.id]);
  const gmailApprove = await attempt(adminUrl, GMAIL, `update regulatory_obligations set status = 'OPEN' where id = $1`, [bind.id]);
  const thirdApprove = await attempt(adminUrl, THIRD, `update regulatory_obligations set status = 'OPEN' where id = $1`, [bind.id]);
  check(!yahooApprove.ok && yahooApprove.message === 'segregation_of_duties' && !gmailApprove.ok && gmailApprove.message === 'segregation_of_duties' && thirdApprove.ok, 'maker-checker unchanged: Yahoo and Gmail refused, independent third reviewer can approve (rolled back)', { y: yahooApprove.message, g: gmailApprove.message, t: thirdApprove.ok });

  // 6b. Manual classified obligations follow the same maker-checker as AI-generated ones.
  const REVIEWER_USER = 'user_reviewer_role';
  await db.query(`insert into organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, 'REVIEWER'::platform_role, 'active')`, [PILOT, REVIEWER_USER]);
  const setStatus = (sub, status, commit = false) => attempt(adminUrl, sub, `update regulatory_obligations set status = $2::obligation_status where id = $1`, [verifiedObligation, status], commit);
  const skip = await setStatus(YAHOO, 'OPEN');
  check(!skip.ok && skip.message === 'classified_obligation_invalid_transition', 'manual classified DRAFT cannot skip review straight to OPEN', skip.message);
  const manualSubmit = await setStatus(THIRD, 'IN_REVIEW', true);
  const submitter = (await db.query(`select status, ai_submitted_by_user_id from regulatory_obligations where id = $1`, [verifiedObligation])).rows[0];
  check(manualSubmit.ok && submitter.status === 'IN_REVIEW' && submitter.ai_submitted_by_user_id === THIRD, 'creator submits the manual obligation; submitter recorded by the server', submitter);
  const selfApprove = await setStatus(THIRD, 'OPEN');
  check(!selfApprove.ok && selfApprove.message === 'segregation_of_duties', 'creator cannot approve their own manual obligation', selfApprove.message);
  const viewerApprove = await setStatus(VIEWER, 'OPEN');
  check(
    viewerApprove.ok ? viewerApprove.rowCount === 0 : ['classified_obligation_review_role_required', 'insufficient_role'].includes(viewerApprove.message),
    'viewer cannot approve',
    viewerApprove,
  );
  const reviewerApprove = await setStatus(REVIEWER_USER, 'OPEN');
  check(reviewerApprove.ok && reviewerApprove.rowCount === 1, 'independent REVIEWER can approve the manual obligation (rolled back)', reviewerApprove.message);
  const managerApprove = await setStatus(YAHOO, 'OPEN');
  check(managerApprove.ok && managerApprove.rowCount === 1, 'independent compliance manager can approve the manual obligation (rolled back)', managerApprove.message);
  const reviewerEdit = await attempt(adminUrl, REVIEWER_USER, `update regulatory_obligations set obligation_statement = 'edited' where id = $1`, [verifiedObligation]);
  check(!reviewerEdit.ok && reviewerEdit.message === 'insufficient_role', 'REVIEWER may approve or return, not edit', reviewerEdit.message);
  const reattribute = await attempt(adminUrl, YAHOO, `update regulatory_obligations set created_by_user_id = $2 where id = $1`, [verifiedObligation, YAHOO]);
  check(!reattribute.ok && reattribute.message === 'classified_obligation_provenance_immutable', 'creator of a classified obligation cannot be rewritten', reattribute.message);
  const legacyEdit = await attempt(adminUrl, YAHOO, `update regulatory_obligations set obligation_statement = 'Existing manual obligation (unclassified, edited).' where id = $1`, [manualObligation]);
  check(legacyEdit.ok && legacyEdit.rowCount === 1, 'legacy unclassified obligations are not deleted or locked; they remain editable pending review (rolled back)', legacyEdit.message);

  // 7. Tenant isolation.
  const outsiderUpdate = await attempt(adminUrl, OUTSIDER, `update regulatory_obligations set status = 'OPEN' where id = $1`, [verifiedObligation]);
  check(outsiderUpdate.ok && outsiderUpdate.rowCount === 0, 'other organisation cannot approve or change this organisation’s obligations', outsiderUpdate);
  const outsiderInsert = await insertManual(OUTSIDER, manualMeta('R'));
  check(!outsiderInsert.ok, 'other organisation cannot create obligations in this organisation', outsiderInsert.message);
  const outsiderDecisions = await attempt(adminUrl, OUTSIDER, `select count(*)::int n from ai_analysis_finding_decisions`);
  const outsiderReport = await attempt(adminUrl, OUTSIDER, `select count(*)::int n from ri_obligation_legal_classification`);
  const memberReport = await attempt(adminUrl, VIEWER, `select count(*)::int n from ri_obligation_legal_classification where organisation_id = $1`, [PILOT]);
  check(outsiderDecisions.ok && outsiderDecisions.rows[0].n === 0 && outsiderReport.ok && outsiderReport.rows[0].n === 0, 'other organisation sees no decisions and no classified obligations', { outsiderDecisions, outsiderReport });
  check(memberReport.ok && memberReport.rows[0].n > 0, 'members read their own organisation’s classification report (RLS via security_invoker view)', memberReport);

  // 8. Operator maker-checker on policy changes.
  await db.query(`insert into platform_operators (clerk_user_id, status) values ($1, 'active'), ($2, 'active')`, [OP1, OP2]);
  const fcaEntries = (await db.query(`select code, description, conversion_enabled as "conversionEnabled", destination_queue as "destinationQueue", human_review_required as "humanReviewRequired", supporting_obligation_link_required as "supportingObligationLinkRequired" from regulatory_classification_policy_entries where policy_id = $1`, [fcaId])).rows;
  const PROPOSE = `select public.ri_propose_classification_policy('REG-FCA', current_date, array['dear_ceo_letter'], $1::jsonb, $2) as id`;
  const nonOperator = await attempt(adminUrl, YAHOO, PROPOSE, [JSON.stringify(fcaEntries), 'Tenant attempt to change policy.']);
  check(!nonOperator.ok && nonOperator.message === 'classification_policy_operator_required', 'tenant compliance manager cannot propose policy changes', nonOperator.message);
  const unlawful = fcaEntries.map((e) => (e.code === 'G' ? { ...e, conversionEnabled: true, destinationQueue: 'OBLIGATION_TRIAGE' } : e));
  const unlawfulRes = await attempt(adminUrl, OP1, PROPOSE, [JSON.stringify(unlawful), 'Attempt to make guidance convertible.'], true);
  const policiesAfterUnlawful = (await db.query(`select count(*)::int n from regulatory_classification_policies where regulator_key = 'REG-FCA'`)).rows[0].n;
  check(!unlawfulRes.ok && unlawfulRes.code === '23514' && policiesAfterUnlawful === 1, 'operator proposal enabling Guidance conversion refused atomically', { unlawfulRes, policiesAfterUnlawful });
  const conservative = fcaEntries.map((e) => (e.code === 'P' ? { ...e, conversionEnabled: false, destinationQueue: 'EXCEPTION_TRIAGE' } : e));
  const proposed = await attempt(adminUrl, OP1, PROPOSE, [JSON.stringify(conservative), 'Route principles to exception triage pending SME review.'], true);
  const v2 = proposed.rows?.[0]?.id;
  check(proposed.ok && v2, 'operator 1 proposes FCA v2 (DRAFT)', proposed.message);
  const selfActivate = await attempt(adminUrl, OP1, `select public.ri_activate_classification_policy($1)`, [v2], true);
  check(!selfActivate.ok && selfActivate.message === 'segregation_of_duties', 'proposer cannot activate their own policy', selfActivate.message);
  const activate = await attempt(adminUrl, OP2, `select public.ri_activate_classification_policy($1)`, [v2], true);
  const states = (await db.query(`select policy_version, status, approved_by_user_id from regulatory_classification_policies where regulator_key = 'REG-FCA' order by policy_version`)).rows;
  check(activate.ok && states[0].status === 'SUPERSEDED' && states[1].status === 'ACTIVE' && states[1].approved_by_user_id === OP2, 'second operator activates v2; v1 superseded', states);
  const v2Types = (await db.query(`select non_binding_publication_types t from regulatory_classification_policies where id = $1`, [v2])).rows[0].t;
  check(v2Types.includes('dear_ceo_letter') && v2Types.includes('finalised_guidance'), 'operator may add non-binding publication types; the mandatory floor is kept', v2Types);
  const history = await attempt(adminUrl, OP2, `select string_agg(distinct event_type, ',' order by event_type) e from regulatory_classification_policy_events where policy_id = $1`, [v2]);
  check(history.ok && /POLICY_PROPOSED/.test(history.rows[0].e) && /POLICY_ACTIVE/.test(history.rows[0].e) && /ENTRY_INSERT/.test(history.rows[0].e), 'operators can read the v2 audit history', history.rows?.[0]);
  const historicDecisions = (await db.query(`select count(*)::int n from ai_analysis_finding_decisions where classification_policy_id = $1`, [fcaId])).rows[0].n;
  check(historicDecisions === 15, 'decisions made under v1 keep their policy reference after v2 activation', historicDecisions);

  const rollback = await applySqlFile(db, join(platformRoot, 'supabase', 'rollbacks', MIGRATION.replace('.sql', '.down.sql'))).then(() => 'applied', (e) => e.message);
  check(/rollback_refused/.test(rollback), 'rollback refuses to discard classification history', rollback);
} catch (e) {
  failures += 1;
  console.error('FAIL: unexpected error', e);
} finally {
  await db.end().catch(() => {});
  await stopEmbedded(embedded);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
