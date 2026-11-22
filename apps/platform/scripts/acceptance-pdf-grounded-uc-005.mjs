#!/usr/bin/env node
/**
 * Offline acceptance: PDF-grounded context + candidates→claims normalisation (staging DB read).
 */
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './staging/load-platform-env.mjs';
import { buildPdfGroundedAnalysisContext } from '../lib/ri/ai/build-pdf-grounded-analysis-context.mjs';
import { normalizeAnalysisStructuredOutput } from '../lib/ri/ai/normalize-structured-ai-output.mjs';

const FG22 = 'a761cacc-8742-493d-b200-eb5d9a3ab884';
const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  failMsg('supabase admin credentials missing');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const ctx = await buildPdfGroundedAnalysisContext({ publicationId: FG22, adminSupabase: admin });
if (!ctx.ok) {
  failMsg(`pdf context: ${ctx.code}`);
  process.exit(1);
}
pass(`pdf context sections=${ctx.sourceSections.length} pages cited`);
if (ctx.grounding?.obligationGradeSuitable === true) {
  failMsg('unexpected obligationGradeSuitable=true on FG22');
} else {
  pass('obligation-grade gate preserved (obligationGradeSuitable not true)');
}

const allowed = ctx.allowedSectionIds;
const fakeId = allowed[0];
const normalized = normalizeAnalysisStructuredOutput(
  {
    confidence: 72,
    candidates: [
      {
        statement: 'Synthetic acceptance candidate',
        sourceSectionIds: [fakeId],
        bindingNature: 'guidance',
        citation: 'PDF test',
        sourceQuotation: ctx.sourceSections[0].text.slice(0, 40),
      },
      { statement: 'Unsupported', bindingNature: 'unknown' },
    ],
  },
  'ObligationExtractionResult',
  allowed,
);
if (!Array.isArray(normalized.claims) || normalized.claims.length < 2) {
  failMsg('normalize did not emit claims');
} else {
  pass('candidates normalised to claims');
}
const supported = normalized.claims.filter((c) => (c.sourceSectionIds || []).length);
if (supported.length !== 1) failMsg(`expected 1 supported claim got ${supported.length}`);
else pass('unsupported candidate has no sourceSectionIds');

if (supported[0].sourceSectionIds?.[0] === fakeId) pass('supported claim references pdf evidence id');
else failMsg('supported claim missing expected evidence id');

// PS26/1 through the UC-RI-005 instrument path, from the stored staging revision (no AI call).
const PS26_1 = '829c5472-953a-40ff-9628-947afbfe4e7a';
const PS26_1_REVISION = 'e3f3991b-6b6e-41d6-9fa8-331784f2bc3b';
const PS26_1_PAGES = [19, 21, 29, 40, 66, 68, 81, 86, 87, 88, 90, 91, 92, 93, 94, 95, 96, 97];
const PS26_1_OMITTED = ['TP 13.5G', '16.1.6R', '2.7.7FG', '2.7.19GG', '2.7.19HG', '2.8.6CG', '8.12.11AG'];
const ps = await buildPdfGroundedAnalysisContext({ publicationId: PS26_1, adminSupabase: admin, useCaseId: 'UC-RI-005' });
if (!ps.ok) {
  failMsg(`PS26/1 pdf context: ${ps.code}`);
} else {
  const sel = ps.grounding.selection;
  const status = (core) => ps.grounding.sectionCatalog.flatMap((s) => (s.provisionTextStatus?.[core] ? [s.provisionTextStatus[core]] : []));
  if (ps.grounding.extractionRevisionId === PS26_1_REVISION) pass('PS26/1 context built from the staging pdf_primary_v1 revision');
  else failMsg(`PS26/1 revision ${ps.grounding.extractionRevisionId}`);
  if (sel.strategy === 'instrument_priority_v1' && sel.instrumentStartPage === 61) pass('PS26/1 legal instrument detected at p.61');
  else failMsg(`PS26/1 selection ${sel.strategy} start ${sel.instrumentStartPage}`);
  if (JSON.stringify(sel.selectedPages) === JSON.stringify(PS26_1_PAGES) && ps.sourceSections.length === 18) pass('PS26/1 selection matches the pre-flight (18 sections)');
  else failMsg(`PS26/1 pages ${JSON.stringify(sel.selectedPages)}`);
  if (sel.scope === 'PARTIAL_DOCUMENT' && JSON.stringify(sel.instrumentProvisionsOmitted.map((o) => o.provision)) === JSON.stringify(PS26_1_OMITTED)) {
    pass('PS26/1 coverage recorded as partial with the seven omitted instrument provisions');
  } else failMsg(`PS26/1 scope ${sel.scope} omitted ${JSON.stringify(sel.instrumentProvisionsNotSupplied)}`);
  if (status('7.20.1R').join() === 'NEW_TEXT' && status('4.8.2R').join() === 'AMENDMENT_MARKUP_UNCERTAIN') {
    pass('PS26/1 provision text status: inserted CONC 7.20 live, amended CONC 4.8.2R uncertain');
  } else failMsg(`PS26/1 text status 7.20.1R=${status('7.20.1R')} 4.8.2R=${status('4.8.2R')}`);
  console.log(`INFO: PS26/1 obligationGradeSuitable=${ps.grounding.obligationGradeSuitable === true} (evidence pathway taken from the stored revision)`);
}

console.log(JSON.stringify({ pass: fail === 0, fail, publicationIds: [FG22, PS26_1] }, null, 2));
process.exit(fail === 0 ? 0 : 1);