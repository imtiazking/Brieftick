#!/usr/bin/env node
/** Read-only: FG22 vs binding candidates for materialisation acceptance. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import { buildPdfGroundedAnalysisContext } from '../../lib/ri/ai/build-pdf-grounded-analysis-context.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const OUT = join(platformRoot, 'docs', 'STAGING-BINDING-OBLIGATION-GRADE-CATALOGUE.json');

const CANDIDATES = [
  { id: 'a761cacc-8742-493d-b200-eb5d9a3ab884', label: 'FG22/5 guidance' },
  { id: '56b0beca-d8c3-4267-a794-9079009af661', label: 'Consumer Duty fair value (Org A live AI history)' },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const admin = url && key ? createClient(url, key) : null;
  const rows = [];
  for (const c of CANDIDATES) {
    const ctx = admin
      ? await buildPdfGroundedAnalysisContext({ publicationId: c.id, adminSupabase: admin })
      : { ok: false };
    rows.push({
      publicationId: c.id,
      label: c.label,
      pdfContextOk: ctx.ok === true,
      obligationGradeSuitable: ctx.grounding?.obligationGradeSuitable ?? null,
      primaryClass: ctx.grounding?.regulatoryAnalysis?.publicationClassification?.primaryClass ?? null,
      sectionCount: ctx.sourceSections?.length ?? 0,
      recommendedUse:
        c.id.includes('a761cacc')
          ? 'guidance_probe_only'
          : ctx.grounding?.obligationGradeSuitable === true
            ? 'binding_materialisation_candidate'
            : 'verify_grade_before_materialisation',
    });
  }
  writeFileSync(OUT, JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, rows }, null, 2));
}

await main();