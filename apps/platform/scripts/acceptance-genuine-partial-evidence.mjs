#!/usr/bin/env node
/**
 * Genuine partial evidence — two material aspects; one verified with citation; one unresolved.
 * Not a missing-handbook negative (contrast EVAL-B-03 MISSING_PRIMARY_HANDBOOK).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO_ROOT, AUTHENTIC_CORPUS_B2_DIR } from '../lib/ri/eval/eval-paths.mjs';
import { buildSemanticIndex } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { attachBm25ToIndex, scoreQuestionWithMethod } from '../lib/ri/semantic/offline-retrieval-methods.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';
import { runAskRiV2Pipeline } from '../lib/ri/reasoner/run-ask-ri-v2-pipeline.mjs';
import { createGenuinePartialMockFetch } from '../lib/ri/eval/mock-reasoner-scenarios.mjs';
import { MOCK_ANTHROPIC_API_KEY } from '../lib/ri/reasoner/mock-anthropic-reasoner-fetch.mjs';

const QUESTION =
  'What should firms document when monitoring fair value outcomes under Consumer Duty guidance, and what consumer harms must they assess before changing product pricing?';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);

const index = await buildSemanticIndex(AUTHENTIC_CORPUS_B2_DIR);
const bm = attachBm25ToIndex(index);
const retrieval = await scoreQuestionWithMethod(bm, QUESTION, {}, 0.28, 'hybrid');
const bundle = assembleEvidenceBundle(bm, retrieval.allRankedChunks || [], {});
const mockFetch = createGenuinePartialMockFetch(bundle);

const engine = await runAskRiV2Pipeline(bm, QUESTION, {}, {
  bm25Attached: true,
  providerDeps: { skipExecutionGuard: true, apiKeyOverride: MOCK_ANTHROPIC_API_KEY, fetchFn: mockFetch },
});

const coverage = engine.coverageAssessment?.questionCoverage;
const status = engine.status;
const code = engine.stageC?.evidenceLimitationCode;
const citations = engine.citations || [];
if (status !== 'PARTIAL_ANSWER') failures.push(`expected PARTIAL_ANSWER got ${status}`);
else ok(`policy PARTIAL_ANSWER (reason ${engine.stageC?.policyReason})`);

if (coverage !== 'KNOWN') failures.push(`genuine partial requires KNOWN coverage got ${coverage}`);
else ok('coverage KNOWN for corpus-supported partial');

if (code !== 'PARTIAL_EVIDENCE_CONFIRMED') failures.push(`expected PARTIAL_EVIDENCE_CONFIRMED diagnostic got ${code}`);
else ok(`diagnostic ${code}`);

if (!citations.length) failures.push('supported claim must include citations');
else {
  ok(`citations=${citations.length}`);
  for (const c of citations) {
    if (!c.evidenceChunkId || !c.excerpt) failures.push('citation missing chunk or excerpt');
  }
}

const answer = String(engine.answer || '');
if (!/unresolved|harm|not established/i.test(answer)) {
  failures.push('answer must disclose unresolved aspects');
} else ok('unresolved aspects disclosed in answer');

const out = join(REPO_ROOT, 'docs/eval/GENUINE-PARTIAL-EVIDENCE-RESULTS.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.genuine-partial-evidence.v1',
      capturedAt: new Date().toISOString(),
      testClass: 'GENUINE_PARTIAL_NOT_MISSING_SOURCE',
      question: QUESTION,
      materialAspects: ['monitoring documentation (FG/Consumer Duty)', 'consumer harm assessment before pricing'],
      supportedAspect: 'monitoring documentation',
      unresolvedAspect: 'consumer harm metrics / pricing change methodology',
      result: {
        policyStatus: status,
        coverage,
        evidenceLimitationCode: code,
        citationCount: citations.length,
        citations,
        policyReason: engine.stageC?.policyReason,
      },
      programmePass: failures.length === 0,
      failures,
      note: 'Mocked provider — not SME regulatory approval',
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({ ok: failures.length === 0, out, failures }, null, 2));
process.exit(failures.length ? 1 : 0);