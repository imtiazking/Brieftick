#!/usr/bin/env node
/**
 * UC-RI-005 per-finding review service (lib/ri/services/ai-finding-review.ts) end to end against embedded
 * Postgres (never staging): real migrations, triggers, RLS and ri_submit_ai_finding_review. Only the PDF
 * evidence loader is stubbed (page text in finding-review-fixtures.mjs). No AI provider is called.
 * Requires: npm run sync:reference-catalogue
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfStub = `export async function loadPublicationPdfEvidenceForAskRi() { return globalThis.__pdfEvidence; }`;
const groundedStub = `export async function buildPdfGroundedAnalysisContext() { return { ok: false, code: 'not_used' }; }`;
const adminStub = `export function createSupabaseAdminClient() { return globalThis.__adminClient ?? null; }`;
const hook = `
const stubs = ${JSON.stringify({ pdfStub, groundedStub, adminStub })};
const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
const data = (src) => ({ url: 'data:text/javascript,' + encodeURIComponent(src), shortCircuit: true });
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return data('export {}');
  if (specifier.endsWith('load-publication-pdf-evidence.mjs')) return data(stubs.pdfStub);
  if (specifier.endsWith('build-pdf-grounded-analysis-context.mjs')) return data(stubs.groundedStub);
  if (specifier === '@/lib/supabase/admin') return data(stubs.adminStub);
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-only';

const { readdirSync } = await import('node:fs');
const harness = await import('./local-db/harness.mjs');
const fx = await import('./local-db/finding-review-fixtures.mjs');
const { createPgSupabaseClient } = await import('./local-db/pg-supabase-adapter.mjs');
const { getFindingReview, submitFindingReview } = await import('../lib/ri/services/ai-finding-review.ts');
const { submitAnalysisReview } = await import('../lib/ri/services/ai-analysis.ts');
const { assertNotAutonomousAiAction, assertHumanReviewedDraftMaterialisation, HUMAN_REVIEWED_DRAFT_MATERIALISATION } =
  await import('../lib/ri/ai/autonomy.ts');

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
const errorOf = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return { name: e.constructor?.name, message: e.message };
  }
};

const { embedded, adminUrl } = await harness.resetAndStartEmbedded({ port: 54354 });
const db = new pg.Client({ connectionString: adminUrl });
await db.connect();

try {
  await harness.applySqlFile(db, join(platformRoot, 'scripts', 'local-db', 'auth-jwt-shim.sql'));
  await db.query(`
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  const migrationsDir = join(platformRoot, 'supabase', 'migrations');
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await harness.applySqlFile(db, join(migrationsDir, f));
  }
  await harness.ensureAppRole(db);
  await db.query(`grant all on all tables in schema public to anon, authenticated; grant authenticated to forgeniq_app;`);
  await harness.applyReferenceSeed(db);
  const { insertRun } = await fx.seedFindingReviewFixtures(db);
  const run1 = await insertRun('svc-1', false);
  const run2 = await insertRun('svc-2', false);

  globalThis.__adminClient = createPgSupabaseClient(adminUrl);
  globalThis.__pdfEvidence = {
    evidence: [
      {
        extractionRevisionId: fx.REVISION,
        structured: { pages: Object.entries(fx.PAGE_TEXT).map(([n, text]) => ({ pageNumber: Number(n), text })) },
      },
    ],
    errors: [],
  };
  const yahoo = createPgSupabaseClient(adminUrl, fx.YAHOO);
  const gmail = createPgSupabaseClient(adminUrl, fx.GMAIL);
  const outsider = createPgSupabaseClient(adminUrl, fx.OUTSIDER);

  const outputMd5 = async (runId) =>
    (await db.query(`select md5(structured_output::text) h, (select md5(string_agg(t::text, '|' order by claim_index)) from ai_analysis_citations t where analysis_run_id = $1) c from ai_analysis_runs where id = $1`, [runId])).rows[0];
  const benchmarkBefore = await outputMd5(run1.runId);

  const counts = async (runId) =>
    (
      await db.query(
        `select (select count(*)::int from ai_analysis_reviews where analysis_run_id = $1) reviews,
                (select count(*)::int from regulatory_obligations where ai_analysis_run_id = $1) obligations,
                (select count(*)::int from ai_finding_quotation_verifications where analysis_run_id = $1) verifications,
                (select review_status::text from ai_analysis_runs where id = $1) status`,
        [runId],
      )
    ).rows[0];

  // Review view: stable finding IDs, pages, model suggestion shown for verification only.
  const view = await getFindingReview(yahoo, fx.PILOT, run1.runId);
  check(view.findings.length === 5 && view.findings.every((f, i) => f.findingId === run1.ids[i] && f.number === i + 1), 'view lists every finding with its stable ID and 1-based number');
  check(
    JSON.stringify(view.findings.map((f) => f.pages)) === JSON.stringify([[1, 14], [14], [14], [9, 16], [4]]),
    'view maps each finding’s cited sections to PDF pages',
    view.findings.map((f) => f.pages),
  );
  check(
    view.findings[1].suggestion?.sourceQuotation === fx.QUOTES.notify &&
      view.findings[1].suggestion?.modelBindingNature === 'binding_requirement' &&
      view.findings[2].suggestion?.sourceQuotation === fx.QUOTES.endDelay,
    'suggested quotations matched by wording, not array position',
    view.findings.map((f) => f.suggestion?.candidateIndex ?? null),
  );
  check(view.evidence.pathway === 'human_verified_uat' && view.evidence.obligationGradeSuitable === false, 'view reports obligationGradeSuitable=false and the human-verified UAT pathway', view.evidence);
  check(view.enabled === false && view.decisions.length === 0, 'finding review disabled by default; no decisions yet');
  const outsiderView = await errorOf(() => getFindingReview(outsider, fx.OTHER, run1.runId));
  check(outsiderView?.message === 'not_found', 'other organisation cannot load the review view', outsiderView);

  const decisions = (run, overrides = {}) =>
    view.findings.map((f, i) => {
      const base = { findingId: run.ids[i], claimTextSha256: f.claimTextSha256, comment: 'Checked against FCA FG24/6 PDF original.' };
      const byIndex = {
        0: { decision: 'REJECTED', comment: 'Permission, not an obligation.' },
        1: {
          decision: 'ACCEPTED',
          regulatoryClassificationCode: 'UK',
          legalBasis: 'PSRs 2017 reg. 86(2C)',
          // As copied from a PDF viewer, with a line break mid-sentence.
          quotation: fx.QUOTES.notify.replace('the reason for the delay,', 'the reason for\nthe delay,'),
          quotationPage: 14,
          reclassificationEvidence: 'Restates PSRs 2017 reg. 86(2C) verbatim; the statutory duty binds independently of FG24/6.',
        },
        2: { decision: 'ACCEPTED', regulatoryClassificationCode: 'GBR', disposition: 'SUPPORTING_INFORMATION' },
        3: { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', legalBasis: 'PSRs 2017 reg. 86(2D)', quotation: fx.QUOTES.liability, quotationPage: 16 },
        4: { decision: 'ACCEPTED', regulatoryClassificationCode: 'EXEMPT', disposition: 'ARCHIVE' },
      };
      return { ...base, ...byIndex[i], ...(overrides[i] ?? {}) };
    });
  const params = (userId, runId, list) => ({ organisationId: fx.PILOT, userId, role: 'COMPLIANCE_MANAGER', runId, decisions: list });

  const disabled = await errorOf(() => submitFindingReview(yahoo, params(fx.YAHOO, run1.runId, decisions(run1))));
  check(disabled?.message === 'uc_ri_005_finding_review_disabled', 'submission refused while RI_UC_RI_005_FINDING_REVIEW_ENABLED is not true', disabled);
  process.env.RI_UC_RI_005_FINDING_REVIEW_ENABLED = 'true';

  const legacy = await errorOf(() =>
    submitAnalysisReview(yahoo, { organisationId: fx.PILOT, userId: fx.YAHOO, role: 'COMPLIANCE_MANAGER', runId: run1.runId, decision: 'ACCEPTED', acceptedClaimIndexes: [1], rejectedClaimIndexes: [] }),
  );
  check(legacy?.message === 'uc_ri_005_acceptance_suspended', 'whole-run Accept for UC-RI-005 remains suspended', legacy);

  const sod = await errorOf(() => submitFindingReview(gmail, params(fx.GMAIL, run1.runId, decisions(run1))));
  check(sod?.message === 'segregation_of_duties', 'Gmail (AI requester) cannot review their own run', sod);
  const incomplete = await errorOf(() => submitFindingReview(yahoo, params(fx.YAHOO, run1.runId, decisions(run1).slice(1))));
  check(incomplete?.name === 'RiValidationError' && incomplete.message === 'finding_decisions_incomplete', 'every finding needs a decision', incomplete);
  const fabricated = await errorOf(() =>
    submitFindingReview(yahoo, params(fx.YAHOO, run1.runId, decisions(run1, { 1: { quotation: 'A PSP must notify the payer of the delay within one hour of receipt.' } }))),
  );
  check(fabricated?.message === 'finding_quotation_not_found_on_page:2', 'quotation not on the cited PDF page refused', fabricated);
  const wrongPage = await errorOf(() => submitFindingReview(yahoo, params(fx.YAHOO, run1.runId, decisions(run1, { 3: { quotationPage: 9 } }))));
  check(wrongPage?.message === 'finding_quotation_not_found_on_page:4', 'genuine quotation attributed to the wrong cited page refused', wrongPage);
  const c0 = await counts(run1.runId);
  check(c0.reviews === 0 && c0.obligations === 0 && c0.verifications === 0 && c0.status === 'HUMAN_REVIEW_REQUIRED', 'refused submissions persisted nothing', c0);

  const result = await submitFindingReview(yahoo, { ...params(fx.YAHOO, run1.runId, decisions(run1)), notes: 'UAT per-finding review' });
  check(result.ok && result.decision === 'PARTIALLY_ACCEPTED' && result.evidencePathway === 'human_verified_uat', 'Yahoo per-finding review succeeds (PARTIALLY_ACCEPTED, human_verified_uat)', result);
  check(JSON.stringify(result.materialised.map((m) => m.findingId)) === JSON.stringify([run1.ids[1], run1.ids[3]]), 'DRAFT obligations created for the binding findings 2 and 4 only (guidance finding 3 not converted)');
  const obls = (await db.query(`select obligation_statement s, citation, status, metadata from regulatory_obligations where ai_analysis_run_id = $1 order by (metadata->>'claimIndex')::int`, [run1.runId])).rows;
  check(
    obls.length === 2 &&
      obls[0].metadata.sourceQuotation === fx.QUOTES.notify &&
      obls[0].s === fx.FINDINGS[1].text &&
      obls[0].metadata.regulatoryClassificationCode === 'UK' &&
      obls[1].metadata.regulatoryClassificationCode === 'R' &&
      obls[1].citation === 'PDF p.16' &&
      obls.every((o) => o.status === 'DRAFT'),
    'obligation text, normalised quotation and citations follow the selected findings',
    obls.map((o) => ({ s: o.s.slice(0, 40), c: o.citation, q: o.metadata.sourceQuotation.slice(0, 40) })),
  );
  const c1 = await counts(run1.runId);
  check(c1.verifications === 2, 'one server-side quotation verification per materialised finding', c1);

  const again = await errorOf(() => submitFindingReview(yahoo, params(fx.YAHOO, run1.runId, decisions(run1))));
  check(again?.message === 'already_reviewed', 'duplicate submission refused', again);
  check((await counts(run1.runId)).obligations === 2, 'no duplicate obligations after resubmission');

  const after = await getFindingReview(yahoo, fx.PILOT, run1.runId);
  check(
    after.decisions.length === 5 &&
      after.decisions.filter((d) => d.obligation_id).length === 2 &&
      after.decisions.find((d) => d.claim_index === 2)?.skip_reason === 'not_converted:SUPPORTING_INFORMATION' &&
      after.decisions.find((d) => d.claim_index === 4)?.skip_reason === 'not_converted:ARCHIVE' &&
      after.classificationPolicy?.policyVersion === 1 &&
      Object.values(after.queueCounts ?? {}).reduce((a, b) => a + b, 0) === 5,
    'review view returns the recorded per-finding decisions',
    after.decisions.map((d) => [d.claim_index, d.decision, d.skip_reason]),
  );

  const benchmarkAfter = await outputMd5(run1.runId);
  check(benchmarkBefore.h === benchmarkAfter.h && benchmarkBefore.c === benchmarkAfter.c, 'AI output and citations of the reviewed run unchanged');

  // Failure in the database function after PDF verification: nothing but the verification facts remain.
  await db.query(`
    create function public.test_fail_materialisation() returns trigger language plpgsql as $$
    begin raise exception 'test_injected_failure'; end $$;
    create trigger test_fail_materialisation before insert on public.ai_claim_materialisations
      for each row execute function public.test_fail_materialisation();`);
  const injected = await errorOf(() => submitFindingReview(yahoo, params(fx.YAHOO, run2.runId, decisions(run2))));
  await db.query(`drop trigger test_fail_materialisation on public.ai_claim_materialisations; drop function public.test_fail_materialisation();`);
  const c2 = await counts(run2.runId);
  check(/ai_finding_review_failed:test_injected_failure/.test(injected?.message ?? ''), 'database failure surfaces as an internal error', injected);
  check(c2.reviews === 0 && c2.obligations === 0 && c2.status === 'HUMAN_REVIEW_REQUIRED', 'rollback: run 2 remains unreviewed with no obligations', c2);
  const retry = await submitFindingReview(yahoo, params(fx.YAHOO, run2.runId, decisions(run2)));
  check(retry.ok && retry.materialised.length === 2, 'review can be resubmitted after a rolled-back failure', retry.materialised.length);

  // Autonomy guard: the draft action is narrowly scoped; approvals remain blocked.
  for (const action of ['approve_obligation', 'approve_change']) {
    const e = await errorOf(() => assertNotAutonomousAiAction(action));
    check(e?.message === 'AI_AUTONOMOUS_ACTION_BLOCKED', `${action} remains blocked for AI`, e);
  }
  const guardCases = [
    [{ action: 'approve_obligation', reviewerUserId: fx.YAHOO, requestedByUserId: fx.GMAIL, targetStatus: 'DRAFT' }, 'AI_AUTONOMOUS_ACTION_BLOCKED'],
    [{ action: HUMAN_REVIEWED_DRAFT_MATERIALISATION, reviewerUserId: null, requestedByUserId: fx.GMAIL, targetStatus: 'DRAFT' }, 'AI_AUTONOMOUS_ACTION_BLOCKED'],
    [{ action: HUMAN_REVIEWED_DRAFT_MATERIALISATION, reviewerUserId: fx.YAHOO, requestedByUserId: fx.GMAIL, targetStatus: 'OPEN' }, 'AI_AUTONOMOUS_ACTION_BLOCKED'],
    [{ action: HUMAN_REVIEWED_DRAFT_MATERIALISATION, reviewerUserId: fx.GMAIL, requestedByUserId: fx.GMAIL, targetStatus: 'DRAFT' }, 'segregation_of_duties'],
    [{ action: HUMAN_REVIEWED_DRAFT_MATERIALISATION, reviewerUserId: fx.YAHOO, requestedByUserId: fx.GMAIL, targetStatus: 'DRAFT' }, null],
  ];
  for (const [input, expected] of guardCases) {
    const e = await errorOf(() => assertHumanReviewedDraftMaterialisation(input));
    check((e?.message ?? null) === expected, `draft guard ${input.action}/${input.targetStatus}/${input.reviewerUserId ?? 'no reviewer'} → ${expected ?? 'allowed'}`, e);
  }
} catch (e) {
  failures += 1;
  console.error('FAIL: unexpected error', e);
} finally {
  await db.end().catch(() => {});
  await harness.stopEmbedded(embedded);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
