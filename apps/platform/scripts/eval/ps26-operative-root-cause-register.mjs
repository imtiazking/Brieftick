#!/usr/bin/env node
/** Root-cause taxonomy for 17 outstanding PS26 operative provisions (no paid API). */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';

const taxonomy = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/FCA-PS26-OUTSTANDING-TAXONOMY-2026-11-23.json'), 'utf8'));
const trace = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/FCA-PS26-OPERATIVE-TRACE-2026-11-23.json'), 'utf8'));
const hist = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/eval/fixtures/PS26-HISTORICAL-RUNS-SNAPSHOT-2026-11-23.json'), 'utf8'));

const operative = (taxonomy.provisions || []).filter((p) => p.operativeBinding && p.instrumentClass === 'operative_binding_requirement');

function classify(p) {
  const reasons = [];
  if (!p.humanInstrumentVerified) reasons.push('missing_source_evidence');
  if (p.amendmentOrTransitional === 'AMENDMENT_MARKUP_UNCERTAIN') reasons.push('pdf_markup_uncertainty');
  if (p.deterministicCompletenessSignal && !p.liveAiStructuredRecall) reasons.push('ai_extraction_omission');
  if (p.aiExtractionFinding === 'ai_extraction_omission_candidate') reasons.push('historical_run_gap');
  const traceRow = (trace.trace || []).find((t) => t.core === p.core);
  if (traceRow?.crossPageNote) reasons.push('cross_page');
  if (traceRow && traceRow.heuristicOperativeCandidate && (traceRow.aiHits || []).every((h) => !h.provisionReference)) {
    reasons.push('missing_provision_reference_inference');
  }
  const primary = reasons.includes('ai_extraction_omission')
    ? 'AI_EXTRACTION_FAILURE'
    : reasons.includes('cross_page')
      ? 'PDF_PARSING_COVERAGE'
      : reasons.includes('pdf_markup_uncertainty')
        ? 'PDF_PARSING_COVERAGE'
        : 'CLASSIFICATION_OR_POSTPROCESS';
  return { core: p.core, primary, reasons, liveAiStructuredRecall: p.liveAiStructuredRecall };
}

const classified = operative.map(classify);
const byPrimary = classified.reduce((a, c) => ((a[c.primary] = (a[c.primary] || 0) + 1), a), {});

const OUT = join(REPO_ROOT, 'docs/eval/FCA-PS26-OPERATIVE-ROOT-CAUSE-REGISTER-2026-11-23.json');
writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      operativeCount: classified.length,
      byPrimary,
      provisions: classified,
      historicalRunCount: hist.runs?.length,
      remediationWithoutPaidApi: [
        'Provision inventory + cross-page deterministic candidates (7.20.1R pattern)',
        'Output preflight + batch sizing',
        'Regulatory guards + provision reference parse fixes',
        'Hosted re-extract only when authorised',
      ],
      independentlyVerifiedRegulatoryTruth: 'FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json',
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ out: OUT, byPrimary }, null, 2));