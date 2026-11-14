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

console.log(JSON.stringify({ pass: fail === 0, fail, publicationId: FG22 }, null, 2));
process.exit(fail === 0 ? 0 : 1);