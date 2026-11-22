#!/usr/bin/env node
/**
 * Isolated embedded Postgres (never staging): migration 20261122090000 — provision-level conversion eligibility
 * (RI-CLS-005) — plus the instrument-aware selection and shared JS mirror (RI-CLS-006).
 *
 * Fixtures are PS26/1-shaped: a narrative page, instrument pages that set out CONC provisions as amended text
 * (underlining/strike-through, not verifiable) or wholly new text, a transitional provisions table, a chapter-form
 * transitional provision, a deleted provision and a synthetic evidential provision (TEST DATA — PS26/1 contains no
 * E provision; quotations for 7.20.1R, TP 13.3R and 4.6.3R are TEST DATA).
 */
import pg from 'pg';
import { join } from 'node:path';
import {
  applyAllMigrations,
  applyReferenceSeed,
  applySqlFile,
  ensureAppRole,
  platformRoot,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSession,
  withRlsSessionCommit,
} from './local-db/harness.mjs';
import { GMAIL, PILOT, REVISION, YAHOO, seedFindingReviewFixtures, sha, CATALOG } from './local-db/finding-review-fixtures.mjs';
import {
  analyseInstrumentProvisionText,
  detectLegalInstrumentStartPage,
  hasDutyLanguage,
  evaluateProvisionEligibility,
  parseProvisionReference,
  provisionMarkersInText,
} from '../lib/ri/classification/provision-eligibility.mjs';
import { FCA_POLICY_V1, evaluateFindingTriage } from '../lib/ri/classification/regulatory-classification-policy.mjs';
import { describeSelectedSections, selectEvidenceBlocksForAnalysis } from '../lib/ri/ai/build-pdf-grounded-analysis-context.mjs';

const MIGRATION = '20261122090000_ri_provision_level_conversion_eligibility.sql';

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

const QUOTE = {
  unfair: 'A firm must not unfairly encourage a customer to enter into a regulated deferred payment credit agreement.',
  application: 'This section applies to a firm with respect to entering into a regulated deferred payment credit agreement.',
  noDuty: 'The additional product information set out in this section relates to deferred payment credit agreements.',
  crossRef: 'A firm must provide the information required by CONC 4.2A.3R before the agreement is entered into.',
  transitional: 'A firm must apply the requirements in the table from the date the firm obtains permission.',
  evidential: 'A firm should keep a record of the explanation it provides to the customer before the agreement is made.',
  mayOnly: 'A firm may only take steps to recover the debt after it has contacted the customer about the missed payment.',
  tpDuty: 'Where the only regulated activities in its permission are deferred payment credit activities, the firm must comply with SYSC 4.1.1R.',
  deleted: 'A firm must give the customer the explanation required by this rule before the agreement is made.',
};

const CAT = [
  { sourceSectionId: 'N19', pageNumber: 19, citation: 'PDF p.19', excerpt: 'Our policy approach', inLegalInstrument: false, transitionalProvisions: false, provisionsSetOut: [] },
  { sourceSectionId: 'I83', pageNumber: 83, citation: 'PDF p.83 · legal instrument', excerpt: 'TP 1 Transitional provisions', inLegalInstrument: true, transitionalProvisions: true, provisionsSetOut: [] },
  { sourceSectionId: 'I87', pageNumber: 87, citation: 'PDF p.87 · legal instrument', excerpt: '4.2A Additional product information', inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['4.2.1R', '4.2A.1R', '4.2A.2G', '4.2A.3R'], provisionTextStatus: { '4.2.1R': 'AMENDMENT_MARKUP_UNCERTAIN', '4.2A.1R': 'NEW_TEXT', '4.2A.2G': 'NEW_TEXT', '4.2A.3R': 'NEW_TEXT' } },
  { sourceSectionId: 'I93', pageNumber: 93, citation: 'PDF p.93 · legal instrument', excerpt: '4.8.2 R A firm must not unfairly encourage', inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['4.8.2R', '6.7.42G', '6.7.43G'], provisionTextStatus: { '4.8.2R': 'AMENDMENT_MARKUP_UNCERTAIN', '6.7.42G': 'AMENDMENT_MARKUP_UNCERTAIN', '6.7.43G': 'AMENDMENT_MARKUP_UNCERTAIN' } },
  { sourceSectionId: 'I95', pageNumber: 95, citation: 'PDF p.95 · legal instrument', excerpt: 'TEST DATA evidential provision 7.20.4E', inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['7.20.4E'], provisionTextStatus: { '7.20.4E': 'NEW_TEXT' } },
  { sourceSectionId: 'I94', pageNumber: 94, citation: 'PDF p.94 · legal instrument', excerpt: '7.20 Regulated deferred payment credit agreements', inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['7.1.4R', '7.20.1R'], provisionTextStatus: { '7.1.4R': 'AMENDMENT_MARKUP_UNCERTAIN', '7.20.1R': 'NEW_TEXT' } },
  { sourceSectionId: 'I66', pageNumber: 66, citation: 'PDF p.66 · legal instrument', excerpt: 'TP 13 SMCR: application to firms with deferred payment credit temporary permission', inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['TP 13.1R', 'TP 13.3R'], provisionTextStatus: { 'TP 13.1R': 'NEW_TEXT', 'TP 13.3R': 'NEW_TEXT' } },
  { sourceSectionId: 'I92', pageNumber: 92, citation: 'PDF p.92 · legal instrument', excerpt: 'TEST DATA 4.6.3 R [deleted]', inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['4.6.3R'], provisionTextStatus: { '4.6.3R': 'DELETED' } },
];
const FINDINGS = [
  { text: 'Firms must not unfairly encourage customers to enter into deferred payment credit agreements.', sections: ['I93'] },
  { text: 'The FCA expects firms to give clear information about deferred payment credit.', sections: ['N19'] },
  { text: 'Firms must provide additional product information before the agreement.', sections: ['I93', 'I87'] },
  { text: 'The additional product information section applies to deferred payment credit lenders.', sections: ['I87'] },
  { text: 'Firms with temporary permission must apply the requirements from the date permission is obtained.', sections: ['I83'] },
  { text: 'Firms should keep a record of the explanation given to customers (evidential).', sections: ['I95'] },
  { text: 'Firms may only take recovery steps after contacting the customer about a missed payment.', sections: ['I94'] },
  { text: 'Firms with only deferred payment credit temporary permission must comply with SYSC 4.1.1R.', sections: ['I66'] },
  { text: 'Firms must give the explanation required by CONC 4.6.3R before the agreement.', sections: ['I92'] },
];

const SUBMIT = `select public.ri_submit_ai_finding_review($1, $2, $3::jsonb, $4) as r`;

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54361 });
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
  await applyAllMigrations(db);
  await ensureAppRole(db);
  await db.query(`grant all on all tables in schema public to anon, authenticated; grant authenticated to forgeniq_app;`);
  await applyReferenceSeed(db);
  const { pubId, verId, changeId } = await seedFindingReviewFixtures(db);
  const pubType = (await db.query(`select publication_type from regulatory_publications where id = $1`, [pubId])).rows[0].publication_type;

  const insertRun = async (key, catalog, findings) => {
    const output = {
      claims: findings.map((f) => ({ text: f.text, confidence: 90, sourceSectionIds: f.sections })),
      candidates: [],
      _forgeniqGrounding: { kind: 'pdf_primary_v1', extractionRevisionId: REVISION, obligationGradeSuitable: true, sectionCatalog: catalog },
    };
    const runId = (
      await db.query(
        `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version,
           requested_by, execution_status, review_status, idempotency_key, structured_output, target_entity_id)
         values ($1, 'UC-RI-005', $2, $3, 'ANTHROPIC', 'v1', $4, 'COMPLETED', 'HUMAN_REVIEW_REQUIRED', $5, $6, $7) returning id`,
        [PILOT, pubId, verId, GMAIL, key, JSON.stringify(output), changeId],
      )
    ).rows[0].id;
    const ids = [];
    for (const [i, f] of findings.entries()) {
      ids.push(
        (
          await db.query(
            `insert into ai_analysis_citations (organisation_id, analysis_run_id, claim_index, claim_text, source_section_ids, citation_status)
             values ($1, $2, $3, $4, $5, 'VERIFIED') returning id`,
            [PILOT, runId, i, f.text, f.sections],
          )
        ).rows[0].id,
      );
    }
    return { runId, ids };
  };
  const verify = (run, i, page, quote) =>
    db.query(
      `insert into ai_finding_quotation_verifications (organisation_id, analysis_run_id, finding_id, extraction_revision_id, page_number, quotation_sha256, page_text_sha256, verified_for_user_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [PILOT, run.runId, run.ids[i], REVISION, page, sha(quote), sha(`page ${page}`), YAHOO],
    );

  const run = await insertRun('prov-1', CAT, FINDINGS);
  for (const [i, page, q] of [
    [0, 93, QUOTE.unfair], [0, 93, QUOTE.application], [0, 93, QUOTE.noDuty],
    [1, 19, QUOTE.unfair], [2, 93, QUOTE.crossRef], [3, 87, QUOTE.application],
    [4, 83, QUOTE.transitional], [5, 95, QUOTE.evidential],
    [6, 94, QUOTE.mayOnly], [6, 94, QUOTE.noDuty], [6, 94, QUOTE.application], [7, 66, QUOTE.tpDuty], [8, 92, QUOTE.deleted],
  ]) await verify(run, i, page, q);

  const base = (i, extra = {}) => ({
    findingId: run.ids[i],
    claimTextSha256: sha(FINDINGS[i].text),
    decision: 'REJECTED',
    comment: 'Checked against the PS26/1 instrument by the reviewer.',
    ...extra,
  });
  const convert = (code, page, quotation, provisionReference, provisionFunction, extra = {}) => ({
    decision: 'ACCEPTED',
    regulatoryClassificationCode: code,
    disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
    legalBasis: provisionReference || 'CONC',
    quotation,
    quotationPage: page,
    provisionReference,
    provisionFunction,
    ...extra,
  });
  const decisions = (overrides) => FINDINGS.map((_, i) => base(i, overrides[i] || {}));
  const submit = (overrides, commit = false) =>
    attempt(adminUrl, YAHOO, SUBMIT, [PILOT, run.runId, JSON.stringify(decisions(overrides)), 'Provision-level review'], commit);
  const refused = async (overrides, expected, msg) => {
    const r = await submit(overrides);
    check(!r.ok && r.message === expected, msg, r.ok ? r.rows?.[0] : r.message);
  };

  check(!['finalised_guidance', 'guidance'].includes(pubType), 'fixture publication is a binding publication type', pubType);
  const fn = (await db.query(`select public.ri_provision_reference_core('CONC 4.8.2 R', 'R') a, public.ri_provision_reference_core('CONC  4.8.2R', 'R') b,
                                     public.ri_provision_reference_core('4.2A.3R', 'R') c, public.ri_provision_reference_core('CONC 4.8.2G', 'R') d,
                                     public.ri_provision_reference_core('CONC 4.8.2', 'R') e, public.ri_provision_reference_core('Article 3 RTS', 'TS') f,
                                     public.ri_provision_reference_core('SYSC TP 13.3R', 'R') g, public.ri_provision_reference_core('SUP TP 1.9A 4R', 'R') h,
                                     public.ri_provision_reference_core('DISP App 5.3.2E', 'E') i`)).rows[0];
  check(fn.i === 'App 5.3.2E', 'appendix provisions keep their App prefix (never collide with main-text numbering)', fn.i);
  check(fn.a === '4.8.2R' && fn.b === '4.8.2R' && fn.c === '4.2A.3R' && fn.d === null && fn.e === null && fn.f === null, 'reference parser: well-formed references, marker must equal code; TS has no marker and fails closed', fn);
  check(fn.g === 'TP 13.3R' && fn.h === null, 'chapter-form transitional provisions parse; transitional table rows fail closed', { g: fn.g, h: fn.h });

  // Refusals (each rolled back).
  await refused({ 1: convert('R', 19, QUOTE.unfair, 'CONC 4.8.2R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_outside_instrument:2', 'R from a narrative (non-instrument) page of a binding publication is refused');
  await refused({ 2: convert('R', 93, QUOTE.crossRef, 'CONC 4.2A.3R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_not_in_cited_section:3', 'a cross-reference on p.93 cannot convert a provision set out on p.87');
  await refused({ 3: convert('R', 87, QUOTE.application, 'CONC 4.2A.1R', 'APPLICATION') }, 'finding_provision_not_operative:4', 'an application provision marked R cannot be converted');
  await refused({ 4: convert('R', 83, QUOTE.transitional, 'CONC 16.1.5R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_not_in_cited_section:5', 'a transitional-table row that cannot be verified as set out fails closed (not excluded as transitional)');
  await refused({ 0: convert('R', 93, QUOTE.unfair, 'CONC 4.8.2R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_amendment_uncertain:1', 'amended text (underlining/strike-through not verifiable) cannot convert');
  await refused({ 8: convert('R', 92, QUOTE.deleted, 'CONC 4.6.3R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_deleted:9', 'a deleted provision cannot create an obligation');
  await refused({ 7: { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', provisionFunction: 'TRANSITIONAL', provisionReference: 'SYSC TP 13.3R', quotation: QUOTE.tpDuty, quotationPage: 66, disposition: 'HORIZON_SCANNING' } }, 'finding_disposition_not_allowed:8', 'a transitional provision quoted with mandatory language is not routed to Non-Obligation Triage');
  await refused({ 0: convert('R', 93, QUOTE.unfair, 'CONC 4.8.2G', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_reference_required:1', 'marker G on an R classification is refused');
  await refused({ 0: convert('R', 93, QUOTE.unfair, null, 'OPERATIVE_REQUIREMENT') }, 'finding_provision_reference_required:1', 'conversion without a provision reference is refused');
  await refused({ 0: convert('R', 93, QUOTE.unfair, 'CONC 4.8.2R', null) }, 'finding_provision_function_required:1', 'conversion without a provision function is refused');
  await refused({ 0: convert('R', 93, QUOTE.unfair, 'CONC 4.8.2R', 'EVIDENTIAL_PROVISION') }, 'finding_provision_not_operative:1', 'binding code with an evidential function is refused');
  await refused({ 6: convert('R', 94, QUOTE.application, 'CONC 7.20.1R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_duty_unconfirmed:7', 'application-only quotation of a live operative provision goes to Exception Triage');
  await refused({ 6: convert('R', 94, QUOTE.noDuty, 'CONC 7.20.1R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_duty_unconfirmed:7', 'quotation without recognised mandatory language goes to Exception Triage');
  await refused({ 0: convert('R', 93, QUOTE.unfair, 'CONC 4.8.2R', 'FOO') }, 'finding_provision_function_invalid:1', 'unknown provision function refused');
  await refused({ 3: { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', provisionFunction: 'APPLICATION', disposition: 'LINK_TO_EXISTING_OBLIGATION' } }, 'finding_linked_obligation_required:4', 'non-operative R routes to Non-Obligation Triage dispositions (link requires a target)');
  await refused({ 5: convert('E', 95, QUOTE.evidential, 'COBS 7.20.4E', 'EVIDENTIAL_PROVISION') }, 'finding_binding_link_required:6', 'evidential provision still needs its binding link');

  const legacy = await insertRun('prov-legacy', CATALOG.map((c) => ({ ...c, sourceSectionId: c.sourceSectionId })), [{ text: 'Legacy grounding finding must convert only with instrument data.', sections: ['S14'] }]);
  await verify(legacy, 0, 14, QUOTE.unfair);
  const legacyRes = await attempt(adminUrl, YAHOO, SUBMIT, [
    PILOT, legacy.runId,
    JSON.stringify([{ findingId: legacy.ids[0], claimTextSha256: sha('Legacy grounding finding must convert only with instrument data.'), comment: 'Legacy grounding check by the reviewer.', ...convert('R', 14, QUOTE.unfair, 'CONC 4.8.2R', 'OPERATIVE_REQUIREMENT') }]),
    'Legacy',
  ]);
  check(!legacyRes.ok && legacyRes.message === 'finding_provision_outside_instrument:1', 'runs whose grounding predates instrument detection fail closed', legacyRes.message);

  const noStatusCat = CAT.map(({ provisionTextStatus, ...c }) => c);
  const noStatus = await insertRun('prov-no-status', noStatusCat, [FINDINGS[6]]);
  await verify(noStatus, 0, 94, QUOTE.mayOnly);
  const noStatusRes = await attempt(adminUrl, YAHOO, SUBMIT, [
    PILOT, noStatus.runId,
    JSON.stringify([{ findingId: noStatus.ids[0], claimTextSha256: sha(FINDINGS[6].text), comment: 'Text status check by the reviewer.', ...convert('R', 94, QUOTE.mayOnly, 'CONC 7.20.1R', 'OPERATIVE_REQUIREMENT') }]),
    'No status',
  ]);
  check(!noStatusRes.ok && noStatusRes.message === 'finding_provision_amendment_uncertain:1', 'instrument sections without a recorded text status fail closed', noStatusRes.message);

  // Successful review (committed).
  const ok = await submit(
    {
      1: { decision: 'ACCEPTED', regulatoryClassificationCode: 'G', disposition: 'SUPPORTING_INFORMATION' },
      3: { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', provisionFunction: 'APPLICATION', provisionReference: 'CONC 4.2A.1R', disposition: 'SUPPORTING_INFORMATION' },
      0: { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', provisionFunction: 'OPERATIVE_REQUIREMENT', provisionReference: 'CONC 4.8.2R', quotation: QUOTE.unfair, quotationPage: 93, legalBasis: 'CONC 4.8.2R', disposition: 'RECLASSIFICATION_REQUESTED' },
      4: { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', provisionFunction: 'TRANSITIONAL', quotation: QUOTE.transitional, quotationPage: 83, disposition: 'ARCHIVE' },
      5: convert('E', 95, QUOTE.evidential, 'COBS 7.20.4E', 'EVIDENTIAL_PROVISION', { supportingFindingId: run.ids[6] }),
      6: convert('R', 94, QUOTE.mayOnly, 'CONC 7.20.1R', 'OPERATIVE_REQUIREMENT', { legalBasis: 'CONC 7.20.1R (FCA 2026/2)' }),
      7: convert('R', 66, QUOTE.tpDuty, 'SYSC TP 13.3R', 'OPERATIVE_REQUIREMENT', { legalBasis: 'SYSC TP 13.3R (FCA 2026/2)' }),
    },
    true,
  );
  check(ok.ok, 'review with a new-text R (no "must"), a transitional duty, one synthetic E, and amended/application/transitional findings routed away succeeds', ok.message);
  const obls = (await db.query(`select id, status, metadata from regulatory_obligations where ai_analysis_run_id = $1 order by (metadata->>'claimIndex')::int`, [run.runId])).rows;
  const rule = obls.find((o) => o.metadata.claimIndex === 6);
  const tp = obls.find((o) => o.metadata.claimIndex === 7);
  const evid = obls.find((o) => o.metadata.claimIndex === 5);
  check(obls.length === 3, 'exactly three DRAFT obligations created (new-text R, transitional R, evidential E)', obls.map((o) => o.metadata.provisionReference));
  check(
    rule?.status === 'DRAFT' && rule.metadata.provisionReference === 'CONC 7.20.1R' && rule.metadata.provisionCore === '7.20.1R' &&
      rule.metadata.provisionFunction === 'OPERATIVE_REQUIREMENT' && rule.metadata.provisionInLegalInstrument === true &&
      rule.metadata.provisionTextStatus === 'NEW_TEXT' && rule.metadata.legalStatus === 'binding',
    'R obligation (quoted with "may only", not "must") records provision reference, core, function, instrument and text status',
    rule?.metadata,
  );
  check(tp?.metadata.provisionCore === 'TP 13.3R' && tp.metadata.legalStatus === 'binding', 'a transitional provision imposing a mandatory requirement converts when classified as operative', tp?.metadata);
  check(
    evid?.metadata.legalStatus === 'evidential' && evid.metadata.supportsObligationId === rule?.id && evid.metadata.provisionFunction === 'EVIDENTIAL_PROVISION',
    'E obligation keeps evidential status and links to the binding R obligation',
    evid?.metadata,
  );
  const decs = (await db.query(`select claim_index, triage_queue, exception_reasons, disposition, provision_reference, provision_function, obligation_id is not null converted from ai_analysis_finding_decisions where analysis_run_id = $1 order by claim_index`, [run.runId])).rows;
  check(
    decs[3].triage_queue === 'NON_OBLIGATION_TRIAGE' && decs[3].provision_function === 'APPLICATION' && !decs[3].converted,
    'application R provision recorded in Non-Obligation Triage without an obligation',
    decs[3],
  );
  check(
    decs[0].triage_queue === 'EXCEPTION_TRIAGE' && decs[0].exception_reasons.includes('provision_amendment_uncertain') && !decs[0].converted,
    'amended-text R provision held in Exception Triage without an obligation',
    decs[0],
  );
  check(
    decs[4].triage_queue === 'EXCEPTION_TRIAGE' && decs[4].exception_reasons.includes('transitional_mandatory_language') && !decs[4].converted,
    'transitional arrangement quoted with mandatory language routed to Exception Triage, not excluded',
    decs[4],
  );
  const event = (await db.query(`select metadata from workflow_events where entity_id = $1 and event_type = 'AI_OBLIGATION_MATERIALISED'`, [rule?.id])).rows[0]?.metadata;
  check(event?.provision_reference === 'CONC 7.20.1R' && event?.provision_function === 'OPERATIVE_REQUIREMENT' && event?.provision_text_status === 'NEW_TEXT', 'materialisation audit event records the provision and its text status', event);

  // Register guard (privileged connection: triggers still apply).
  const reviewId = (await db.query(`select id from ai_analysis_reviews where analysis_run_id = $1`, [run.runId])).rows[0].id;
  const directInsert = (meta) =>
    db
      .query(
        `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status, origin,
           ai_analysis_run_id, ai_analysis_review_id, created_by_user_id, metadata)
         values ($1, $2, $3, 'Direct AI insert', 'DRAFT', 'AI_ASSISTED', $4, $5, $6, $7::jsonb)`,
        [PILOT, changeId, pubId, run.runId, reviewId, YAHOO, JSON.stringify(meta)],
      )
      .then(() => 'inserted', (e) => e.message);
  const noProvision = await directInsert({ regulatoryClassificationCode: 'R' });
  const narrativeProvision = await directInsert({
    regulatoryClassificationCode: 'R', provisionReference: 'CONC 4.8.2R', provisionCore: '4.8.2R', provisionFunction: 'APPLICATION', provisionInLegalInstrument: true, provisionTextStatus: 'NEW_TEXT',
  });
  const amendedProvision = await directInsert({
    regulatoryClassificationCode: 'R', provisionReference: 'CONC 4.8.2R', provisionCore: '4.8.2R', provisionFunction: 'OPERATIVE_REQUIREMENT', provisionInLegalInstrument: true, provisionTextStatus: 'AMENDMENT_MARKUP_UNCERTAIN',
  });
  check(
    noProvision === 'obligation_provision_unverified' && narrativeProvision === 'obligation_provision_unverified' && amendedProvision === 'obligation_provision_unverified',
    'AI-assisted obligation without a verified operative live-text instrument provision refused at the register',
    { noProvision, narrativeProvision, amendedProvision },
  );
  const edit = await db
    .query(`update regulatory_obligations set metadata = jsonb_set(metadata, '{provisionReference}', '"CONC 4.2A.3R"') where id = $1`, [rule?.id])
    .then(() => 'updated', (e) => e.message);
  const editStatus = await db
    .query(`update regulatory_obligations set metadata = jsonb_set(metadata, '{provisionTextStatus}', '"DELETED"') where id = $1`, [rule?.id])
    .then(() => 'updated', (e) => e.message);
  check(edit === 'obligation_provision_immutable' && editStatus === 'obligation_provision_immutable', 'provision facts and text status on an obligation cannot be edited', { edit, editStatus });
  const grants = (await db.query(`select has_function_privilege('authenticated', 'public.ri_guard_obligation_provision()', 'execute') a`)).rows[0].a;
  check(grants === false, 'provision trigger function is not directly executable by signed-in users', grants);

  const rollback = await applySqlFile(db, join(platformRoot, 'supabase', 'rollbacks', MIGRATION.replace('.sql', '.down.sql'))).then(() => 'applied', (e) => e.message);
  const after = (await db.query(`select (select count(*)::int from pg_trigger where tgname = 'ri_guard_obligation_provision') t,
                                        (select count(*)::int from pg_proc where proname = 'ri_provision_reference_core') f,
                                        (select count(*)::int from ai_analysis_finding_decisions where analysis_run_id = $1) d`, [run.runId])).rows[0];
  check(rollback === 'applied' && after.t === 0 && after.f === 0 && after.d === FINDINGS.length, 'rollback removes the guard and helper and keeps recorded decisions', { rollback, after });
} catch (e) {
  failures += 1;
  console.error('FAIL: unexpected error', e);
} finally {
  await db.end().catch(() => {});
  await stopEmbedded(embedded);
}

// Shared JS mirror and selection (no database).
try {
  check(parseProvisionReference('CONC 4.8.2 R')?.core === '4.8.2R' && parseProvisionReference('CONC 4.8.2')?.core === undefined, 'JS reference parser mirrors the database');
  const markers = provisionMarkersInText('Unfair business practices 4.8.2 R A firm must not ... see CONC 4.2A.3R and PRIN 2A.5.3R');
  check(
    markers.find((m) => m.core === '4.8.2R')?.setOut === true && markers.find((m) => m.core === '4.2A.3R')?.setOut === false,
    'unprefixed markers are provisions set out; prefixed markers are cross-references',
    markers,
  );
  const appMarkers = provisionMarkersInText('ending with 10 January 2025.App 5.3.2 E The following will be relevant records for the purposes of DISP App 5.3.1R.');
  check(
    appMarkers.length === 2 && appMarkers[0].core === 'App 5.3.2E' && appMarkers[0].setOut && appMarkers[1].core === 'App 5.3.1R' && !appMarkers[1].setOut &&
      parseProvisionReference('DISP App 5.3.2E')?.core === 'App 5.3.2E',
    'appendix provisions: set out as "App 5.3.2E"; "DISP App 5.3.1R" is a cross-reference, not main-text 5.3.1R',
    appMarkers,
  );
  const section = { inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['4.8.2R'], provisionTextStatus: { '4.8.2R': 'NEW_TEXT' } };
  const jsOk = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionReference: 'CONC 4.8.2R', provisionFunction: 'OPERATIVE_REQUIREMENT', quotation: QUOTE.unfair, section });
  const jsApp = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionReference: 'CONC 4.2A.1R', provisionFunction: 'APPLICATION', quotation: QUOTE.application, section });
  const jsNarr = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionReference: 'CONC 4.8.2R', provisionFunction: 'OPERATIVE_REQUIREMENT', quotation: QUOTE.unfair, section: { inLegalInstrument: false } });
  check(jsOk.route === 'OBLIGATION' && jsApp.route === 'NON_OBLIGATION' && jsNarr.reasons.includes('provision_not_in_instrument'), 'JS eligibility: operative converts; application routes away; narrative refused', { jsOk, jsApp, jsNarr });
  const jsAmended = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionReference: 'CONC 4.8.2R', provisionFunction: 'OPERATIVE_REQUIREMENT', quotation: QUOTE.unfair, section: { ...section, provisionTextStatus: { '4.8.2R': 'AMENDMENT_MARKUP_UNCERTAIN' } } });
  const jsDeleted = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionReference: 'CONC 4.8.2R', provisionFunction: 'OPERATIVE_REQUIREMENT', quotation: QUOTE.unfair, section: { ...section, provisionTextStatus: { '4.8.2R': 'DELETED' } } });
  const jsTpDuty = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionFunction: 'TRANSITIONAL', quotation: QUOTE.tpDuty, section });
  const jsTpNoDuty = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionFunction: 'TRANSITIONAL', quotation: 'SYSC TP 13 applies to a firm with a deferred payment credit temporary permission.', section });
  check(
    jsAmended.route === 'EXCEPTION' && jsAmended.reasons[0] === 'provision_amendment_uncertain' && jsDeleted.reasons[0] === 'provision_deleted' &&
      jsTpDuty.route === 'EXCEPTION' && jsTpNoDuty.route === 'NON_OBLIGATION',
    'JS eligibility: amended and deleted text to Exception; transitional with mandatory language to Exception; transitional arrangement to Non-Obligation',
    { jsAmended, jsDeleted, jsTpDuty, jsTpNoDuty },
  );
  check(
    ['A firm may not charge a fee.', 'A firm may only lend after checks.', 'No firm may enter into the agreement.', 'The firm is prohibited from charging.', 'A firm must take reasonable steps.', 'The firm must ensure that'].every(hasDutyLanguage) &&
      !hasDutyLanguage('This section relates to deferred payment credit.'),
    'mandatory language is recognised beyond "must" (may not, may only, no firm may, prohibited, ensure)',
  );
  const amendBlocks = [
    { documentEvidenceId: 'A1', pageNumber: 10, extractedText: 'Annex F Amendments to CONC In this Annex, underlining indicates new text and striking through indicates deleted text. 4.2.1 R This section applies to a firm. Insert the following new section, CONC 4.2A. All the text is new and is not underlined. 4.2A.3 R A firm must provide.' },
    { documentEvidenceId: 'A2', pageNumber: 11, extractedText: '4.2A.4 R A firm must explain. Amend the following as shown. 4.8.2 R A firm must not unfairly encourage. 4.6.3 R [deleted]' },
    { documentEvidenceId: 'A3', pageNumber: 12, extractedText: 'Delete the following. 4.9.1 R A firm must notify. Annex G Amendments to the Perimeter Guidance manual (PERG) 2.7.7F G Guidance text.' },
  ];
  const status = analyseInstrumentProvisionText(amendBlocks, 10);
  check(
    status.get('A1')['4.2.1R'] === 'AMENDMENT_MARKUP_UNCERTAIN' && status.get('A1')['4.2A.3R'] === 'NEW_TEXT' && status.get('A2')['4.2A.4R'] === 'NEW_TEXT' &&
      status.get('A2')['4.8.2R'] === 'AMENDMENT_MARKUP_UNCERTAIN' && status.get('A2')['4.6.3R'] === 'DELETED' && status.get('A3')['4.9.1R'] === 'DELETED' &&
      status.get('A3')['2.7.7FG'] === 'AMENDMENT_MARKUP_UNCERTAIN',
    'amendment analysis: markup text uncertain, inserted new text live across pages, "[deleted]" and "Delete the following" deleted',
    Object.fromEntries(status),
  );

  const finding = { citationStatus: 'VERIFIED', modelLabels: [], sections: [{ pageNumber: 93, ...section }] };
  const proposal = { code: 'R', legalBasis: 'CONC 4.8.2R', quotation: QUOTE.unfair, quotationPage: 93, provisionReference: 'CONC 4.8.2R', provisionFunction: 'OPERATIVE_REQUIREMENT' };
  const t1 = evaluateFindingTriage({ policy: FCA_POLICY_V1, publicationType: 'policy_statement_with_instrument', finding, proposal });
  const t2 = evaluateFindingTriage({ policy: FCA_POLICY_V1, publicationType: 'policy_statement_with_instrument', finding, proposal: { ...proposal, provisionFunction: 'EXEMPTION' } });
  const t3 = evaluateFindingTriage({ policy: FCA_POLICY_V1, publicationType: 'policy_statement_with_instrument', finding, proposal: { ...proposal, provisionReference: null } });
  check(t1.conversionEligible && t2.queue === 'NON_OBLIGATION_TRIAGE' && !t2.conversionEligible && t3.queue === 'EXCEPTION_TRIAGE', 'triage mirror routes operative / exemption / missing reference as the database does', { t1: t1.queue, t2: t2.queue, t3: t3.exceptionReasons });

  const block = (page, text) => ({ documentEvidenceId: `B${page}`, pageNumber: page, extractedText: text });
  const narrative = Array.from({ length: 30 }, (_, i) => block(i + 1, `Chapter text ${i + 1}: firms must consider the rules and guidance; we expect firms should comply.`));
  const instrumentBlocks = [
    block(31, 'Appendix 1 Made rules (legal instrument)'),
    block(32, 'EXAMPLE INSTRUMENT 2026 Powers exercised by the Financial Conduct Authority'),
    block(33, 'TP 1 Transitional provisions TP 1.1 A firm must apply 16.1.5 R from the date'),
    block(34, '4.8.2 R A firm must not unfairly encourage a customer. 4.8.3 G Guidance on this rule.'),
    block(35, '7.20.1 R A firm must contact the customer. 7.20.3 R A firm must provide information.'),
    block(36, 'Statements of Principle apply to approved persons; see CONC 4.8.2R.'),
  ];
  const all = [...narrative, ...instrumentBlocks];
  const start = detectLegalInstrumentStartPage(all);
  const picked = selectEvidenceBlocksForAnalysis(all, { instrumentStartPage: start });
  const described = describeSelectedSections(all, picked, start);
  const pickedPages = picked.map((b) => b.pageNumber);
  check(start === 31, 'instrument detected at the "Made rules (legal instrument)" divider', start);
  check(
    pickedPages.includes(34) && pickedPages.includes(35) && pickedPages.includes(33) && !pickedPages.includes(36) && picked.length === 18,
    'instrument pages setting out operative rules are selected, including transitional provisions; cross-reference-only pages are not; 18 sections',
    pickedPages,
  );
  check(
    described.selection.strategy === 'instrument_priority_v1' && described.selection.scope === 'PARTIAL_DOCUMENT' && described.selection.instrumentProvisionsSupplied === 5 &&
      described.selection.instrumentProvisionsNotSupplied.length === 0 && described.sourceSections.find((x) => x.pageNumber === 34)?.provisionTextStatus['4.8.2R'] === 'INSTRUMENT_TEXT',
    'selection summary records strategy, partial scope and instrument provisions supplied',
    described.selection,
  );
  const keyword = selectEvidenceBlocksForAnalysis(all);
  check(keyword.length === 18 && describeSelectedSections(all, keyword, null).selection.strategy === 'keyword_v1', 'without an instrument the keyword selection is unchanged');
} catch (e) {
  failures += 1;
  console.error('FAIL: JS mirror error', e);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
