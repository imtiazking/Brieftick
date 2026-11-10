#!/usr/bin/env node
/**
 * Offline acceptance — eligibility, verifier, schema (no Anthropic calls).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, EVAL_SUITE_V21_PATH } from '../lib/ri/eval/eval-paths.mjs';
import { selectRunnableCases } from '../lib/ri/eval/validate-eval-suite.mjs';
import { buildPublicEvalAllowlist, classifyQuestionEligibility } from '../lib/ri/reasoner/public-question-eligibility.mjs';
import { validateReasonerOutput, buildEmptyReasonerOutput } from '../lib/ri/reasoner/reasoner-output-schema.mjs';
import { verifyReasonerClaims, canonicalizeExcerptText } from '../lib/ri/reasoner/verify-claims.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';
import { mapChunkToEvidenceV2 } from '../lib/ri/reasoner/evidence-chunk-v2.mjs';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const suite = JSON.parse(readFileSync(EVAL_SUITE_V21_PATH, 'utf8'));
const cases = selectRunnableCases(suite, { includeOperatorHeldOut: false });
const allow = buildPublicEvalAllowlist(cases);

if (allow.blocked.length !== 7) fail(`expected 7 blocked tenant/hybrid cases, got ${allow.blocked.length}`);
else ok('eligibility blocks 7 tenant-scoped cases');

const g04 = classifyQuestionEligibility(cases.find((c) => c.testId === 'EVAL-G-04'));
if (g04.eligible || g04.classification !== 'TENANT_CONTEXT_REQUIRED') fail('EVAL-G-04 must block tenant');
else ok('EVAL-G-04 blocked (tenant)');

const c01 = classifyQuestionEligibility(cases.find((c) => c.testId === 'EVAL-C-01'));
if (!c01.eligible) fail('EVAL-C-01 must be public eligible');
else ok('EVAL-C-01 public eligible');

const empty = buildEmptyReasonerOutput();
if (!validateReasonerOutput(empty).ok) fail('empty reasoner output schema');
else ok('empty reasoner schema');

const chunk = mapChunkToEvidenceV2(
  {
    chunkId: 'abc123',
    publicationId: '4d05b49b-a4a4-4101-8c87-7d3983315f25',
    publicationTitle: 'Test CP',
    publicationStatus: 'consultation',
    extractionRevisionId: 'rev-1',
    chunkText: 'Firms should consider financial crime systems.',
    extractionProfile: 'pdf_primary_v1',
    physicalPageNumber: 3,
  },
  { pack: { publicationTitle: 'Test CP', canonicalUrl: 'https://fca.org.uk/cp26-38' } },
);

const bundle = assembleEvidenceBundle({ packs: [] }, [{ chunk: { ...chunk, chunkText: chunk.verbatimText, chunkId: chunk.evidenceChunkId }, similarity: 1 }]);
bundle.evidenceChunks = [chunk];
bundle.chunkById = new Map([[chunk.evidenceChunkId, chunk]]);

const modelOut = {
  schemaVersion: 'forgeniq.ask-ri.reasoner-output.v1',
  responseState: 'ANSWERED',
  sufficiencyAssessment: {
    overall: 'DIRECT_SUPPORT',
    explanation: 'test',
    publicationsConsidered: [chunk.publicationId],
    publicationsAnswering: [chunk.publicationId],
  },
  narrativeSummary: 'Summary',
  claims: [
    {
      claimId: 'c1',
      claimText: 'Crime systems mentioned.',
      classification: 'consultation_proposal',
      regulatoryStatusOfSource: 'consultation',
      evidenceConfidence: 'high',
      humanReviewRequired: true,
      citations: [
        {
          evidenceChunkId: chunk.evidenceChunkId,
          publicationId: chunk.publicationId,
          extractionRevisionId: chunk.extractionRevisionId,
          physicalPageNumber: 3,
          sectionReference: null,
          excerptStartOffset: 0,
          excerptEndOffset: 45,
          verbatimExcerpt: 'Firms should consider financial crime systems.',
        },
      ],
    },
  ],
  citations: [],
  unresolvedAspects: [],
  humanReviewRequired: true,
  uncertaintyNotes: [],
  verificationStatus: 'PASSED',
};

if (!validateReasonerOutput(modelOut).ok) fail('sample model output schema');
else ok('sample model output schema');

const ver = verifyReasonerClaims(modelOut, bundle);
if (!ver.ok) fail(`verifier should pass sample, got ${ver.failures.map((f) => f.check).join(',')}`);
else ok('verifier passes aligned excerpt');

const bad = { ...modelOut, claims: [{ ...modelOut.claims[0], citations: [{ ...modelOut.claims[0].citations[0], verbatimExcerpt: 'invented text' }] }] };
const verBad = verifyReasonerClaims(bad, bundle);
if (verBad.ok) fail('verifier must fail bad excerpt');
else ok('verifier rejects excerpt mismatch');

if (canonicalizeExcerptText('a  b') !== 'a b') fail('canonicalize whitespace');
else ok('canonicalize whitespace');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, allowed: allow.allowedTestIds.length, blocked: allow.blocked.length }));
