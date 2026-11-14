#!/usr/bin/env node
/**
 * Stage D — scoring-evidence reconstruction for 10-theme regression suite (offline mock provider).
 * Scoring reconstruction ≠ regulatory reasoning accuracy (programmePass stays false).
 */
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { AUTHENTIC_CORPUS_B2_DIR, EVAL_SUITE_V21_PATH, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { assessScoringReconstructionInputs } from '../lib/ri/eval/eval-scoring-reconstruction.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { scoreEvalCase } from '../lib/ri/eval/score-eval-case.mjs';
import { classifyV2HarnessOutcome } from '../lib/ri/reasoner/anthropic-provider-diagnostics.mjs';
import {
  buildScoringEvidenceRecord,
  reconstructScoringFromEvidence,
  compareScoringRecords,
  verifyScoringEvidenceIntegrity,
  compareSufficiencyToExpectation,
  writeScoringEvidenceLocalBundle,
  writeScoringEvidenceMetadataManifest,
  loadScoringEvidenceBundle,
} from '../lib/ri/eval/scoring-evidence-export.mjs';
import {
  MOCK_ANTHROPIC_API_KEY,
  createMockAnthropicReasonerFetch,
} from '../lib/ri/reasoner/mock-anthropic-reasoner-fetch.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const THEME_CASES = [
  { theme: 'accurate_evidence_backed', testId: 'EVAL-B-01' },
  { theme: 'insufficient_evidence', testId: 'EVAL-B-03' },
  { theme: 'conflicting_evidence', testId: 'EVAL-C-02' },
  { theme: 'partial_evidence', testId: 'EVAL-C-03' },
  { theme: 'guidance_vs_binding_law', testId: 'EVAL-D-02' },
  { theme: 'incorrect_source_citations', testId: 'EVAL-C-04' },
  { theme: 'missing_source_material', testId: 'EVAL-I-01' },
  { theme: 'unsupported_obligations', testId: 'EVAL-E-01' },
  { theme: 'cross_document_reasoning', testId: 'EVAL-G-02' },
  { theme: 'abstention_regulatory_interpretation', testId: 'EVAL-H-01' },
];

const failures = [];
const deviations = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const caseById = new Map((suite.cases || []).map((c) => [c.testId, c]));

const historicalReport = join(
  REPO_ROOT,
  'docs/eval/runs/phase-2c2-ask-ri-v2-eval-live-claude-haiku-5-5-2026-11-10T22-17-34-994Z.json',
);
if (existsSync(historicalReport)) {
  const hist = JSON.parse(readFileSync(historicalReport, 'utf8'));
  const row = (hist.results || []).find((r) => r.testId === 'EVAL-H-04');
  const audit = assessScoringReconstructionInputs(row, caseById.get('EVAL-H-04') || null);
  if (audit.reconstructable) fail('historical sanitised report must remain NOT_RECONSTRUCTABLE');
  else ok(`historical live report preserved as ${audit.status}`);
}

const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const bm25Index = attachBm25ToIndex(index);

const workDir = mkdtempSync(join(tmpdir(), 'forgeniq-scoring-evidence-'));
const localPath = join(workDir, 'stage-d-themes-mock-local.json');
const manifestPath = join(REPO_ROOT, 'docs/eval/scoring-evidence/baselines/stage-d-themes-mock-v1-manifest.json');
const records = [];

for (const { theme, testId } of THEME_CASES) {
  const caseRow = caseById.get(testId);
  if (!caseRow) {
    fail(`suite case missing ${testId}`);
    continue;
  }

  const retrieval = await scoreQuestionWithMethod(bm25Index, caseRow.question, caseRow, 0.28, 'hybrid');
  const ranked = retrieval.allRankedChunks || [];
  const mockBundle = ranked.length ? assembleEvidenceBundle(bm25Index, ranked, {}) : null;
  const mockFetch = mockBundle ? createMockAnthropicReasonerFetch(mockBundle) : null;

  const engineResult = await runAskRiV2Pipeline(bm25Index, caseRow.question, caseRow, {
    dryRun: !mockFetch,
    bm25Attached: Boolean(mockFetch),
    providerDeps: mockFetch
      ? {
          skipExecutionGuard: true,
          apiKeyOverride: MOCK_ANTHROPIC_API_KEY,
          fetchFn: mockFetch,
        }
      : undefined,
  });

  if (engineResult.v2ExecutionStatus === 'BLOCKED_UNEXPECTED') {
    deviations.push({ theme, testId, issue: 'blocked_unexpected' });
  }

  const scored = scoreEvalCase(caseRow, engineResult, { simulateCatalogueAttach: false, evidenceAvailable: true });
  scored.harnessOutcome = classifyV2HarnessOutcome(engineResult);

  const record = buildScoringEvidenceRecord(caseRow, scored, engineResult, { dryRun: !mockFetch, model: null });
  records.push(record);

  const integrity = verifyScoringEvidenceIntegrity(record);
  if (!integrity.ok) fail(`${testId} evidence integrity: ${integrity.issues.join(',')}`);
  else ok(`${testId} (${theme}) evidence integrity`);

  const rescored = reconstructScoringFromEvidence(record, caseRow);
  const cmp = compareScoringRecords(
    {
      outcome: record.actual.outcome,
      dimensions: record.actual.dimensions,
      criticalFailures: record.actual.criticalFailures,
    },
    rescored,
  );
  if (!cmp.match) {
    fail(`${testId} reconstruction mismatch: ${JSON.stringify(cmp.mismatches.slice(0, 2))}`);
  } else {
    ok(`${testId} scoring reconstruction match (outcome=${record.actual.outcome})`);
  }

  const suff = compareSufficiencyToExpectation(caseRow, record);
  if (suff.matchesIdealState === false) {
    deviations.push({
      theme,
      testId,
      issue: 'ideal_response_state_mismatch',
      expected: suff.expectedResponseState,
      actual: suff.actualEngineStatus,
      note: 'Mock offline path — not regulatory accuracy',
    });
  }

  if (mockFetch && (!engineResult.citations?.length && record.actual.citationCount < 1)) {
    deviations.push({ theme, testId, issue: 'mock_expected_citations_missing' });
  }
}

writeScoringEvidenceLocalBundle(localPath, records);
writeScoringEvidenceMetadataManifest(manifestPath, records);

const bundle = loadScoringEvidenceBundle(localPath);
if (bundle?.recordCount !== THEME_CASES.length) {
  fail(`expected ${THEME_CASES.length} records, got ${bundle?.recordCount}`);
}

const gitignoredLocal = join(REPO_ROOT, 'docs/eval/scoring-evidence/local/stage-d-themes-mock-v1.json');
mkdirSync(dirname(gitignoredLocal), { recursive: true });
writeFileSync(gitignoredLocal, JSON.stringify(bundle, null, 2));
ok(`local bundle written (gitignored): docs/eval/scoring-evidence/local/stage-d-themes-mock-v1.json`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (JSON.stringify(manifest).includes('"answer"')) fail('manifest must not contain full answer');
else ok('sanitised manifest committed');

rmSync(workDir, { recursive: true, force: true });

const summary = {
  ok: failures.length === 0,
  programmePass: false,
  regulatoryReasoningPass: false,
  themeCount: THEME_CASES.length,
  reconstructionVerified: records.length,
  scoringDeviations: deviations,
  manifestPath: 'docs/eval/scoring-evidence/baselines/stage-d-themes-mock-v1-manifest.json',
  failures,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(failures.length ? 1 : 0);