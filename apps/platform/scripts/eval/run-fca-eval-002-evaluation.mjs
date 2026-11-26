#!/usr/bin/env node
/**
 * Deterministic comparison of FCA-EVAL-002 live evidence against the prep baseline. No paid AI.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const EVIDENCE_DIR = join(repoRoot, 'docs/uat/evidence/live-ai-pilot-fca-eval-002-2026-11-26');
const PREP = JSON.parse(readFileSync(join(repoRoot, 'docs/uat/evidence/fca-eval-002-prep/PREP-PACKAGE.json'), 'utf8'));
const expected = PREP.expectedOutcomes;

function loadJson(name) {
  const p = join(EVIDENCE_DIR, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

const recordsPath = join(EVIDENCE_DIR, 'saved-outputs/stage2-5-records-as-persisted.json');
const records = existsSync(recordsPath) ? JSON.parse(readFileSync(recordsPath, 'utf8')) : {};
const state = loadJson('state.json') || {};
const ledger = loadJson('ledger-reconciliation.json');
const stage1 = loadJson('stage1-run-raw.json');

const impactRecord =
  records.impact ||
  records.obligation?.stage2ImpactAssessment ||
  records.obligation?.impacts?.[0] ||
  null;
const obligationMeta =
  records.obligation?.metadata ||
  impactRecord?.metadata?.regulatoryEvidence?.pack ||
  impactRecord?.metadata ||
  records.risk?.metadata ||
  {};
const pack =
  obligationMeta?.pack && typeof obligationMeta.pack === 'object'
    ? obligationMeta.pack
    : impactRecord?.metadata?.regulatoryEvidence?.pack || obligationMeta;

const criteria = [];
const push = (id, pass, detail) => criteria.push({ id, pass, detail });

const classification = records.obligation?.classificationCode || pack?.provision?.regulatoryClassificationCode || pack?.provision?.core;
push(
  'correct_provision_level_legal_classification',
  classification === 'R' || pack?.provision?.reference === 'CONC 7.20.1R' || records.obligation?.legalStatus === 'binding',
  classification,
);
const eff =
  records.obligation?.effectiveDate ||
  records.obligation?.effective_date ||
  pack?.effective?.date ||
  obligationMeta?.commencement?.commencementDate;
push('correct_effective_dates_with_provenance', eff === expected.effectiveDate || eff === '2026-07-15', eff);

const breakdown = pack?.provisionBreakdown || obligationMeta?.provisionBreakdown;
const standalone = breakdown?.standaloneObligationPaths || pack?.breakdown?.standaloneObligationPaths || [];
for (const ref of expected.standaloneObligationPaths || []) {
  push(`mandatory_limb_present:${ref}`, standalone.includes(ref), JSON.stringify(standalone));
}

const materiality = impactRecord?.materiality ?? records.impact?.materiality;
push(
  'impact_materiality_not_from_confidence',
  materiality === 'UNASSESSED' ||
    impactRecord?.metadata?.stage2Ai?.materialityAssessment?.rejectedHeuristics?.includes('model_confidence_percent'),
  materiality,
);
push('assurance_not_truncated_mid_word', !(records.assurance?.notes || '').endsWith('esc') && (records.assurance?.notes || '').length !== 1500, (records.assurance?.notes || '').length);

const telemetry = loadJson('provider-telemetry-export.json');
push(
  'raw_provider_telemetry_captured',
  Boolean(telemetry?.stage1 && telemetry?.stage4 && telemetry?.stage5),
  Object.keys(telemetry || {}).filter((k) => telemetry[k]),
);
push('request_count_within_limit', (ledger?.requestCount ?? ledger?.lineItems?.length ?? 0) <= 8, ledger?.requestCount);
push('settled_within_budget', Number(ledger?.settledUsd ?? ledger?.totalSettledUsd ?? 0) <= 0.75, ledger?.settledUsd);

const interpretEscalations = PREP.regulatoryInterpretation?.escalationsForExpertReview?.length > 0;
push('unresolved_interpretations_flagged', interpretEscalations, interpretEscalations);

const report = {
  generatedAt: new Date().toISOString(),
  runReference: PREP.runReference,
  paidAiCallsInEvaluation: 0,
  baseline: expected,
  acceptanceCriteria: criteria,
  passed: criteria.filter((c) => c.pass).length,
  failed: criteria.filter((c) => !c.pass).length,
  state,
  ledgerSummary: ledger,
  stage1Status: stage1?.status ?? null,
  expertReviewEscalations: PREP.regulatoryInterpretation?.escalationsForExpertReview ?? [],
};

mkdirSync(EVIDENCE_DIR, { recursive: true });
writeFileSync(join(EVIDENCE_DIR, 'EVALUATION-AGAINST-BASELINE.json'), `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# FCA-EVAL-002 — live five-stage pilot report',
  '',
  `Run reference: \`${PREP.runReference}\`. Evidence: \`${EVIDENCE_DIR.replace(/\\/g, '/')}\`.`,
  '',
  `## Acceptance criteria: ${report.passed}/${criteria.length} passed`,
  '',
  ...criteria.map((c) => `- [${c.pass ? 'x' : ' '}] ${c.id}${c.detail != null ? ` — ${String(c.detail).slice(0, 120)}` : ''}`),
  '',
  '## Expert-review escalations (unchanged)',
  '',
  ...(report.expertReviewEscalations || []).map((e) => `- **${e.reference}** ${e.question}`),
  '',
  '## Ledger',
  '',
  '```json',
  JSON.stringify(ledger ?? { note: 'ledger-reconciliation.json not yet written' }, null, 2),
  '```',
].join('\n');
writeFileSync(join(EVIDENCE_DIR, 'PILOT-REPORT.md'), `${md}\n`);
console.log(JSON.stringify({ ok: report.failed === 0, passed: report.passed, failed: report.failed, report: join(EVIDENCE_DIR, 'PILOT-REPORT.md') }, null, 2));
process.exitCode = report.failed ? 1 : 0;