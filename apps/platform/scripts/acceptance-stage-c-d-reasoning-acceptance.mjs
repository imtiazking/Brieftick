#!/usr/bin/env node
/**
 * Stage C/D reasoning theme coverage (offline dry-run). Does NOT grant regulatory accuracy PASS.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHENTIC_CORPUS_B2_DIR, EVAL_SUITE_V21_PATH } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { scoreEvalCase } from '../lib/ri/eval/score-eval-case.mjs';

const THEME_CASES = [
  { theme: 'accurate_evidence_to_claim', testId: 'EVAL-B-01' },
  { theme: 'correct_source_citations', testId: 'EVAL-C-04' },
  { theme: 'partial_answer_handling', testId: 'EVAL-C-03' },
  { theme: 'insufficient_evidence_abstention', testId: 'EVAL-B-03' },
  { theme: 'binding_law_vs_guidance', testId: 'EVAL-D-02' },
  { theme: 'contradictory_regulatory_evidence', testId: 'EVAL-C-02' },
  { theme: 'multi_document_reasoning', testId: 'EVAL-G-02' },
  { theme: 'unsupported_regulatory_conclusions', testId: 'EVAL-E-01' },
  { theme: 'missing_evidence_handling', testId: 'EVAL-I-01' },
  { theme: 'abstention_regulatory_interpretation', testId: 'EVAL-H-01' },
];

const failures = [];
const themeNotes = [];
const ok = (m) => console.log(`OK: ${m}`);

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const caseById = new Map((suite.cases || []).map((c) => [c.testId, c]));
const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);

for (const { theme, testId } of THEME_CASES) {
  const caseRow = caseById.get(testId);
  if (!caseRow) {
    failures.push(`${testId} missing from suite`);
    continue;
  }
  const engineResult = await runAskRiV2Pipeline(index, caseRow.question, caseRow, { dryRun: true });
  const scored = scoreEvalCase(caseRow, engineResult, { simulateCatalogueAttach: false, evidenceAvailable: true });

  const ideal = caseRow.expectedIdealResult?.responseState || null;
  const status = engineResult.status || engineResult.v2ExecutionStatus;
  const blockedUnexpected = engineResult.v2ExecutionStatus === 'BLOCKED_UNEXPECTED';
  if (blockedUnexpected) failures.push(`${testId} BLOCKED_UNEXPECTED`);

  const smeDims = ['D05', 'D06', 'D07', 'D10', 'D11'].filter((d) => scored.dimensions?.[d] === 'AWAITING_SME_REVIEW');
  const note = {
    theme,
    testId,
    idealResponseState: ideal,
    engineStatus: status,
    outcome: scored.outcome,
    sufficiency: engineResult.sufficiency?.classification || engineResult.sufficiency?.status || null,
    smePendingDimensions: smeDims,
    dryRunOnly: true,
    regulatoryAccuracyPass: false,
  };
  themeNotes.push(note);
  ok(`${theme} — structural dry-run scored (${scored.outcome})`);
}

const summary = {
  ok: failures.length === 0,
  programmePass: false,
  regulatoryAccuracyDeclaration: 'NOT_GRANTED — mock/dry-run structural scoring only; SME review required',
  themeCoverage: themeNotes,
  failures,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(failures.length ? 1 : 0);