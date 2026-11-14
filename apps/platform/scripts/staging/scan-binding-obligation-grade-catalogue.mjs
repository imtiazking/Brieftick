#!/usr/bin/env node
/** Read-only scan: FCA/PRA publications with pdf_primary context and obligation-grade posture. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import { buildPdfGroundedAnalysisContext } from '../../lib/ri/ai/build-pdf-grounded-analysis-context.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);
const OUT = join(platformRoot, 'docs', 'STAGING-BINDING-OBLIGATION-GRADE-SCAN.json');

const PRIORITY_PATTERNS = [/PS\d+/i, /SUP\s*\d+/i, /GEN\s*\d+/i, /PRA\s*RULE/i, /FCA\s*HANDBOOK/i, /COBS/i, /SYSC/i];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    writeFileSync(
      OUT,
      JSON.stringify({ ok: false, error: 'supabase_env_missing', capturedAt: new Date().toISOString() }, null, 2),
    );
    console.log(JSON.stringify({ ok: false, error: 'supabase_env_missing' }));
    process.exit(2);
  }

  const admin = createClient(url, key);
  const { data: pubs, error } = await admin
    .from('regulatory_publications')
    .select(
      'id,title,publication_type,external_document_id,publication_date,regulator:regulators(acronym,name)',
    )
    .order('publication_date', { ascending: false, nullsFirst: false })
    .limit(400);

  if (error) throw new Error(error.message);

  const scanned = [];
  for (const pub of pubs || []) {
    const ctx = await buildPdfGroundedAnalysisContext({ publicationId: pub.id, adminSupabase: admin });
    const regulatorAcronym = pub.regulator?.acronym ?? null;
    if (regulatorAcronym && !['FCA', 'PRA', 'BoE', 'PRA/FCA'].includes(regulatorAcronym)) {
      continue;
    }
    const row = {
      publicationId: pub.id,
      title: pub.title,
      regulator: regulatorAcronym,
      publicationType: pub.publication_type,
      externalReference: pub.external_document_id,
      pdfContextOk: ctx.ok === true,
      obligationGradeSuitable: ctx.grounding?.obligationGradeSuitable ?? false,
      primaryClass: ctx.grounding?.regulatoryAnalysis?.publicationClassification?.primaryClass ?? null,
      regulatoryStatus: ctx.grounding?.regulatoryAnalysis?.regulatoryStatus ?? null,
      sectionCount: ctx.sourceSections?.length ?? 0,
      pdfError: ctx.ok ? null : ctx.code,
    };
    if (ctx.ok) scanned.push(row);
  }

  const bindingCandidates = scanned.filter(
    (r) => r.obligationGradeSuitable === true && r.sectionCount >= 5,
  );
  const priorityBinding = bindingCandidates.filter((r) =>
    PRIORITY_PATTERNS.some((p) => p.test(r.externalReference || '') || p.test(r.title || '')),
  );

  const selected =
    priorityBinding[0] ||
    bindingCandidates.find((r) => r.regulatoryStatus === 'binding_rules') ||
    bindingCandidates[0] ||
    null;

  const fg22 = scanned.find((r) => r.publicationId === 'a761cacc-8742-493d-b200-eb5d9a3ab884');

  const payload = {
    capturedAt: new Date().toISOString(),
    scannedWithPdfContext: scanned.length,
    obligationGradeSuitableCount: bindingCandidates.length,
    selectedBindingPublication: selected,
    guidanceProbeFg22: fg22 || { note: 'FG22/5 not in scan set — run read-only-binding script' },
    prerequisiteIfNone:
      selected == null
        ? 'No publication with obligationGradeSuitable=true and pdf_primary_v1 in catalogue. Requires indexed binding rules PDF + human obligation-grade approval — do not force obligationGradeSuitable.'
        : null,
    topCandidates: bindingCandidates.slice(0, 15),
  };

  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, selected: selected?.publicationId ?? null, bindingCount: bindingCandidates.length }, null, 2));
}

await main();