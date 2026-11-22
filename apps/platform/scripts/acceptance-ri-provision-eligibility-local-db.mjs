#!/usr/bin/env node
/**
 * Isolated embedded Postgres (never staging): migration 20261122090000 — provision-level conversion eligibility
 * (RI-CLS-005) — plus the instrument-aware selection and shared JS mirror (RI-CLS-006).
 *
 * Fixtures are PS26/1-shaped: a narrative page, instrument pages that set out CONC provisions, a transitional
 * provisions table and a synthetic evidential provision (TEST DATA — PS26/1 contains no E provision).
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
  detectLegalInstrumentStartPage,
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
};

const CAT = [
  { sourceSectionId: 'N19', pageNumber: 19, citation: 'PDF p.19', excerpt: 'Our policy approach', inLegalInstrument: false, transitionalProvisions: false, provisionsSetOut: [] },
  { sourceSectionId: 'I83', pageNumber: 83, citation: 'PDF p.83 · legal instrument', excerpt: 'TP 1 Transitional provisions', inLegalInstrument: true, transitionalProvisions: true, provisionsSetOut: [] },
  { sourceSectionId: 'I87', pageNumber: 87, citation: 'PDF p.87 · legal instrument', excerpt: '4.2A Additional product information', inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['4.2.1R', '4.2A.1R', '4.2A.2G', '4.2A.3R'] },
  { sourceSectionId: 'I93', pageNumber: 93, citation: 'PDF p.93 · legal instrument', excerpt: '4.8.2 R A firm must not unfairly encourage', inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['4.8.2R', '6.7.42G', '6.7.43G'] },
  { sourceSectionId: 'I95', pageNumber: 95, citation: 'PDF p.95 · legal instrument', excerpt: 'TEST DATA evidential provision 7.20.4E', inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['7.20.4E'] },
];
const FINDINGS = [
  { text: 'Firms must not unfairly encourage customers to enter into deferred payment credit agreements.', sections: ['I93'] },
  { text: 'The FCA expects firms to give clear information about deferred payment credit.', sections: ['N19'] },
  { text: 'Firms must provide additional product information before the agreement.', sections: ['I93', 'I87'] },
  { text: 'The additional product information section applies to deferred payment credit lenders.', sections: ['I87'] },
  { text: 'Firms with temporary permission must apply the requirements from the date permission is obtained.', sections: ['I83'] },
  { text: 'Firms should keep a record of the explanation given to customers (evidential).', sections: ['I95'] },
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
                                     public.ri_provision_reference_core('CONC 4.8.2', 'R') e, public.ri_provision_reference_core('Article 3 RTS', 'TS') f`)).rows[0];
  check(fn.a === '4.8.2R' && fn.b === '4.8.2R' && fn.c === '4.2A.3R' && fn.d === null && fn.e === null && fn.f === null, 'reference parser: well-formed references, marker must equal code; TS has no marker and fails closed', fn);

  // Refusals (each rolled back).
  await refused({ 1: convert('R', 19, QUOTE.unfair, 'CONC 4.8.2R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_outside_instrument:2', 'R from a narrative (non-instrument) page of a binding publication is refused');
  await refused({ 2: convert('R', 93, QUOTE.crossRef, 'CONC 4.2A.3R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_not_in_cited_section:3', 'a cross-reference on p.93 cannot convert a provision set out on p.87');
  await refused({ 3: convert('R', 87, QUOTE.application, 'CONC 4.2A.1R', 'APPLICATION') }, 'finding_provision_not_operative:4', 'an application provision marked R cannot be converted');
  await refused({ 4: convert('R', 83, QUOTE.transitional, 'CONC 16.1.5R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_outside_instrument:5', 'a transitional-provisions table cannot ground an obligation');
  await refused({ 0: convert('R', 93, QUOTE.unfair, 'CONC 4.8.2G', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_reference_required:1', 'marker G on an R classification is refused');
  await refused({ 0: convert('R', 93, QUOTE.unfair, null, 'OPERATIVE_REQUIREMENT') }, 'finding_provision_reference_required:1', 'conversion without a provision reference is refused');
  await refused({ 0: convert('R', 93, QUOTE.unfair, 'CONC 4.8.2R', null) }, 'finding_provision_function_required:1', 'conversion without a provision function is refused');
  await refused({ 0: convert('R', 93, QUOTE.unfair, 'CONC 4.8.2R', 'EVIDENTIAL_PROVISION') }, 'finding_provision_not_operative:1', 'binding code with an evidential function is refused');
  await refused({ 0: convert('R', 93, QUOTE.application, 'CONC 4.8.2R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_not_operative:1', 'quotation with application language cannot convert as an operative requirement');
  await refused({ 0: convert('R', 93, QUOTE.noDuty, 'CONC 4.8.2R', 'OPERATIVE_REQUIREMENT') }, 'finding_provision_not_operative:1', 'quotation without duty language cannot convert');
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

  // Successful review (committed).
  const ok = await submit(
    {
      0: convert('R', 93, QUOTE.unfair, 'CONC 4.8.2 R', 'OPERATIVE_REQUIREMENT', { legalBasis: 'CONC 4.8.2R (FCA 2026/2)' }),
      1: { decision: 'ACCEPTED', regulatoryClassificationCode: 'G', disposition: 'SUPPORTING_INFORMATION' },
      3: { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', provisionFunction: 'APPLICATION', provisionReference: 'CONC 4.2A.1R', disposition: 'SUPPORTING_INFORMATION' },
      4: { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', provisionFunction: 'TRANSITIONAL', disposition: 'ARCHIVE' },
      5: convert('E', 95, QUOTE.evidential, 'COBS 7.20.4E', 'EVIDENTIAL_PROVISION', { supportingFindingId: run.ids[0] }),
    },
    true,
  );
  check(ok.ok, 'review with one operative R, one synthetic E, and application/transitional R routed away succeeds', ok.message);
  const obls = (await db.query(`select id, status, metadata from regulatory_obligations where ai_analysis_run_id = $1 order by (metadata->>'claimIndex')::int`, [run.runId])).rows;
  const rule = obls.find((o) => o.metadata.claimIndex === 0);
  const evid = obls.find((o) => o.metadata.claimIndex === 5);
  check(obls.length === 2, 'exactly two DRAFT obligations created (operative R and evidential E)', obls.map((o) => o.metadata.provisionReference));
  check(
    rule?.status === 'DRAFT' && rule.metadata.provisionReference === 'CONC 4.8.2 R' && rule.metadata.provisionCore === '4.8.2R' &&
      rule.metadata.provisionFunction === 'OPERATIVE_REQUIREMENT' && rule.metadata.provisionInLegalInstrument === true && rule.metadata.legalStatus === 'binding',
    'R obligation records provision reference, core, operative function and instrument status',
    rule?.metadata,
  );
  check(
    evid?.metadata.legalStatus === 'evidential' && evid.metadata.supportsObligationId === rule?.id && evid.metadata.provisionFunction === 'EVIDENTIAL_PROVISION',
    'E obligation keeps evidential status and links to the binding R obligation',
    evid?.metadata,
  );
  const decs = (await db.query(`select claim_index, triage_queue, disposition, provision_reference, provision_function, obligation_id is not null converted from ai_analysis_finding_decisions where analysis_run_id = $1 order by claim_index`, [run.runId])).rows;
  check(
    decs[3].triage_queue === 'NON_OBLIGATION_TRIAGE' && decs[3].provision_function === 'APPLICATION' && !decs[3].converted &&
      decs[4].triage_queue === 'NON_OBLIGATION_TRIAGE' && decs[4].provision_function === 'TRANSITIONAL' && !decs[4].converted,
    'application and transitional R provisions recorded in Non-Obligation Triage without obligations',
    decs,
  );
  const event = (await db.query(`select metadata from workflow_events where entity_id = $1 and event_type = 'AI_OBLIGATION_MATERIALISED'`, [rule?.id])).rows[0]?.metadata;
  check(event?.provision_reference === 'CONC 4.8.2 R' && event?.provision_function === 'OPERATIVE_REQUIREMENT', 'materialisation audit event records the provision', event);

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
    regulatoryClassificationCode: 'R', provisionReference: 'CONC 4.8.2R', provisionCore: '4.8.2R', provisionFunction: 'APPLICATION', provisionInLegalInstrument: true,
  });
  check(
    noProvision === 'obligation_provision_unverified' && narrativeProvision === 'obligation_provision_unverified',
    'AI-assisted obligation without a verified operative instrument provision refused at the register',
    { noProvision, narrativeProvision },
  );
  const edit = await db
    .query(`update regulatory_obligations set metadata = jsonb_set(metadata, '{provisionReference}', '"CONC 4.2A.3R"') where id = $1`, [rule?.id])
    .then(() => 'updated', (e) => e.message);
  check(edit === 'obligation_provision_immutable', 'provision facts on an obligation cannot be edited', edit);
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
  const section = { inLegalInstrument: true, transitionalProvisions: false, provisionsSetOut: ['4.8.2R'] };
  const jsOk = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionReference: 'CONC 4.8.2R', provisionFunction: 'OPERATIVE_REQUIREMENT', quotation: QUOTE.unfair, section });
  const jsApp = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionReference: 'CONC 4.2A.1R', provisionFunction: 'APPLICATION', quotation: QUOTE.application, section });
  const jsNarr = evaluateProvisionEligibility({ code: 'R', legalStatus: 'binding', provisionReference: 'CONC 4.8.2R', provisionFunction: 'OPERATIVE_REQUIREMENT', quotation: QUOTE.unfair, section: { inLegalInstrument: false } });
  check(jsOk.route === 'OBLIGATION' && jsApp.route === 'NON_OBLIGATION' && jsNarr.reasons.includes('provision_not_in_instrument'), 'JS eligibility: operative converts; application routes away; narrative refused', { jsOk, jsApp, jsNarr });

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
    pickedPages.includes(34) && pickedPages.includes(35) && !pickedPages.includes(33) && !pickedPages.includes(36) && picked.length === 18,
    'instrument pages setting out operative rules are selected; TP tables and cross-reference-only pages are not; 18 sections',
    pickedPages,
  );
  check(
    described.selection.strategy === 'instrument_priority_v1' && described.selection.scope === 'PARTIAL_DOCUMENT' && described.selection.instrumentProvisionsSupplied === 4 &&
      described.selection.instrumentProvisionsNotSupplied.join() === '16.1.5R',
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
