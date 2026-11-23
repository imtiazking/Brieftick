#!/usr/bin/env node
/**
 * Trace operative binding candidates + human-verified 7.20.1R(2) vs live AI runs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { runAs, STAGING_ORIGIN } from '../uat/staging-user-sessions.mjs';
import { extractProvisionScopedExcerpt } from '../../lib/ri/ai/deterministic-provision-candidates.mjs';
import { hasDutyLanguage } from '../../lib/ri/classification/provision-eligibility.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import {
  analyseInstrumentProvisionText,
  buildProvisionPagesIndex,
  detectLegalInstrumentStartPage,
  mergeInstrumentBlocksByPage,
} from '../../lib/ri/classification/provision-eligibility.mjs';

const OUT = join(REPO_ROOT, 'docs/eval/FCA-PS26-OPERATIVE-TRACE-2026-11-23.json');
const RUNS = ['2c840c0b-0534-4429-a02d-6db8850a3f91', '6f05a9eb-8984-4a2b-8b78-2e7effbf8892'];
const TARGETS = ['4.2A.3R', '4.2A.6R', '4.2A.7R', '7.20.3R', '7.20.1R'];

const humanVerified = [
  {
    core: '7.20.1R',
    subParagraph: '(2)',
    evidence: 'docs/eval/PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json',
    uatApprovedConversion: true,
    exclusionFromHeuristicListReason:
      'Full core heuristic used hasDutyLanguage on truncated parser excerpt "7.20.1R or"; (2) duty on p.95 verified separately — RI-CLS-009 cross-page',
  },
];

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: 'trace', extractionRevisionId: 'trace', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const byPage = mergeInstrumentBlocksByPage(blocks, start);
const index = buildProvisionPagesIndex(blocks, start);
analyseInstrumentProvisionText(blocks, start);

const authoritative = TARGETS.map((core) => {
  const pages = [...(index.get(core)?.pages || [])];
  const excerpt = extractProvisionScopedExcerpt(byPage, pages, core) || '';
  const p95 =
    core === '7.20.1R'
      ? (byPage.get(95) || '').slice(0, 1200)
      : '';
  const duty = hasDutyLanguage(excerpt) || (core === '7.20.1R' && /\(2\).*must/i.test(p95));
  return {
    core,
    pages,
    authoritativeExcerptHead: excerpt.slice(0, 500),
    hasDutyLanguageInScopedExcerpt: hasDutyLanguage(excerpt),
    crossPageNote: core === '7.20.1R' ? { page95Snippet: p95.slice(0, 400), dutyIn7_20_1R2: /\(2\).*must/i.test(p95) } : null,
    legalEvidenceSupportsOperativeBinding: duty,
    heuristicOperativeCandidate: duty && !core.startsWith('TP '),
  };
});

let aiByCore = {};
await runAs('A', async ({ page }) => {
  for (const runId of RUNS) {
    const run = await (await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}`)).json().catch(() => ({}));
    const o = run.detail?.structured_output || {};
    for (const c of o.candidates || []) {
      const text = [c.provisionReference, c.statement, c.sourceQuotation].filter(Boolean).join('\n');
      for (const core of TARGETS) {
        if (new RegExp(core.replace(/\./g, '\\.'), 'i').test(text)) {
          aiByCore[core] = aiByCore[core] || [];
          aiByCore[core].push({
            runId,
            bindingNature: c.bindingNature,
            provisionReference: c.provisionReference || null,
            sourceQuotationHead: String(c.sourceQuotation || '').slice(0, 200),
            regulatoryGuard: c._forgeniqRegulatoryGuard || null,
          });
        }
      }
    }
  }
});

const trace = authoritative.map((row) => ({
  ...row,
  aiHits: aiByCore[row.core] || [],
  identification: (aiByCore[row.core] || []).length > 0,
  bindingExtracted: (aiByCore[row.core] || []).some(
    (x) => x.bindingNature === 'binding_requirement' || x.bindingNature === 'regulatory_rule',
  ),
  likelyMissReason:
    (aiByCore[row.core] || []).length === 0
      ? row.pages.length
        ? 'not_in_ai_output_for_supplied_pages'
        : 'not_indexed'
      : null,
}));

const payload = {
  generatedAt: new Date().toISOString(),
  metrics: {
    provisionIdentification: {
      tp: trace.filter((t) => t.identification).length,
      fn: trace.filter((t) => !t.identification).length,
    },
    legalClassification: {
      note: 'Uses authoritative duty language on instrument text, not R marker alone',
      legallySupportedOperative: trace.filter((t) => t.legalEvidenceSupportsOperativeBinding).length,
    },
    obligationExtraction: {
      tp: trace.filter((t) => t.legalEvidenceSupportsOperativeBinding && t.bindingExtracted).length,
      fn: trace.filter((t) => t.legalEvidenceSupportsOperativeBinding && !t.bindingExtracted).length,
    },
  },
  humanVerified,
  trace,
  whyOnlyOneOfFourPreviously:
    'Heuristic ground-truth listed 4 cores with hasDutyLanguage on scoped excerpt; 7.20.1R excluded by truncated excerpt; live runs only produced binding-labelled output strongly on 4.2A.3R/4.2A.5R with consultation_proposal/binding mismatch; 4.2A.6R/4.2A.7R/7.20.3R absent from candidates',
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ out: OUT, metrics: payload.metrics }, null, 2));