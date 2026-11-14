#!/usr/bin/env node
/**
 * Stage C three-state evidence sufficiency matrix (offline) + V2/deterministic policy parity check.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFinalRegulatoryStatus } from '../lib/ri/reasoner/evidence-sufficiency-policy.mjs';
import { enforceStageCCatalogueAnswer } from '../lib/ri/reasoner/enforce-stage-c-catalogue-answer.mjs';
import { renderVerifiedAskRiV2Answer } from '../lib/ri/reasoner/render-verified-answer.mjs';
import { verifyReasonerClaims } from '../lib/ri/reasoner/verify-claims.mjs';
import { buildEmptyReasonerOutput } from '../lib/ri/reasoner/reasoner-output-schema.mjs';
import { mapChunkToEvidenceV2 } from '../lib/ri/reasoner/evidence-chunk-v2.mjs';
import { assembleEvidenceBundle } from '../lib/ri/reasoner/evidence-assembler.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const matrix = {
  sufficient: resolveFinalRegulatoryStatus({
    responseState: 'ANSWERED',
    sufficiencyOverall: 'DIRECT_SUPPORT',
    verifiedClaimCount: 2,
    unresolvedAspects: [],
    questionCoverage: 'KNOWN',
  }),
  partial: resolveFinalRegulatoryStatus({
    responseState: 'PARTIAL_ANSWER',
    sufficiencyOverall: 'PARTIAL_SUPPORT',
    verifiedClaimCount: 1,
    unresolvedAspects: ['scope not fully evidenced'],
    questionCoverage: 'KNOWN',
  }),
  insufficient: resolveFinalRegulatoryStatus({
    responseState: 'INSUFFICIENT_EVIDENCE',
    sufficiencyOverall: 'NO_SUPPORT',
    verifiedClaimCount: 0,
    unresolvedAspects: [],
    questionCoverage: 'KNOWN',
  }),
};

if (matrix.sufficient.status !== 'ANSWERED') fail(`sufficient expected ANSWERED got ${matrix.sufficient.status}`);
else ok('sufficient → ANSWERED');

if (matrix.partial.status !== 'PARTIAL_ANSWER') fail(`partial expected PARTIAL_ANSWER got ${matrix.partial.status}`);
else ok('partial → PARTIAL_ANSWER');

if (matrix.insufficient.status !== 'INSUFFICIENT_EVIDENCE') fail(`insufficient expected INSUFFICIENT_EVIDENCE`);
else ok('insufficient → INSUFFICIENT_EVIDENCE');

const cataloguePartial = enforceStageCCatalogueAnswer({
  status: 'ANSWERED',
  citations: [{ id: '1' }],
  execution: { mustNotPresentAsBindingObligation: true },
});
if (cataloguePartial.status !== 'PARTIAL_ANSWER') fail('catalogue partial binding posture');
else ok('deterministic catalogue path partial when mustNotBind');

const chunk = mapChunkToEvidenceV2(
  {
    chunkId: 'matrix-chunk-1',
    publicationId: '4d05b49b-a4a4-4101-8c87-7d3983315f25',
    publicationTitle: 'Matrix test',
    publicationStatus: 'binding_rules',
    extractionRevisionId: 'rev-matrix',
    chunkText: 'The rule requires documented outsourcing arrangements.',
    extractionProfile: 'pdf_primary_v1',
    physicalPageNumber: 4,
  },
  { pack: { publicationTitle: 'Matrix test', canonicalUrl: 'https://example.invalid/test' } },
);
const bundle = assembleEvidenceBundle({ packs: [] }, [{ chunk: { ...chunk, chunkText: chunk.verbatimText, chunkId: chunk.evidenceChunkId }, similarity: 1 }]);
bundle.evidenceChunks = [chunk];
bundle.chunkById = new Map([[chunk.evidenceChunkId, chunk]]);
bundle.questionCoverage = 'KNOWN';

const modelDirect = {
  ...buildEmptyReasonerOutput(),
  responseState: 'ANSWERED',
  sufficiencyAssessment: {
    overall: 'DIRECT_SUPPORT',
    explanation: 'test',
    publicationsConsidered: [chunk.publicationId],
    publicationsAnswering: [chunk.publicationId],
  },
  narrativeSummary: 'Direct support test.',
  claims: [
    {
      claimId: 'c-direct',
      claimText: 'Documented outsourcing arrangements.',
      classification: 'verified_fact',
      regulatoryStatusOfSource: 'binding_rules',
      evidenceConfidence: 'high',
      humanReviewRequired: false,
      citations: [
        {
          evidenceChunkId: chunk.evidenceChunkId,
          publicationId: chunk.publicationId,
          extractionRevisionId: chunk.extractionRevisionId,
          physicalPageNumber: 4,
          sectionReference: null,
          excerptStartOffset: 0,
          excerptEndOffset: 49,
          verbatimExcerpt: 'The rule requires documented outsourcing arrangements.',
        },
      ],
    },
  ],
};
const vDirect = verifyReasonerClaims(modelDirect, bundle);
const rDirect = renderVerifiedAskRiV2Answer(vDirect, modelDirect, bundle);
if (!vDirect.ok || rDirect.status !== 'ANSWERED') fail('V2 render sufficient path');
else ok('V2 render sufficient (ANSWERED)');

const modelNo = {
  ...buildEmptyReasonerOutput(),
  responseState: 'INSUFFICIENT_EVIDENCE',
  sufficiencyAssessment: {
    overall: 'NO_SUPPORT',
    explanation: 'test',
    publicationsConsidered: [],
    publicationsAnswering: [],
  },
};
const rNo = renderVerifiedAskRiV2Answer({ ok: true, verifiedClaims: [] }, modelNo, bundle);
if (rNo.status !== 'INSUFFICIENT_EVIDENCE') fail('V2 render insufficient path');
else ok('V2 render insufficient');

const pipelineSrc = readFileSync(join(platformRoot, 'lib', 'ri', 'reasoner', 'run-ask-ri-v2-pipeline.mjs'), 'utf8');
const prodSrc = readFileSync(join(platformRoot, 'lib', 'ri', 'ask-ri', 'run-ask-ri-production.mjs'), 'utf8');
if (!pipelineSrc.includes('renderVerifiedAskRiV2Answer') || !prodSrc.includes('runAskRiV2Pipeline')) {
  fail('V2 production execution path wiring');
} else ok('V2 production path uses renderVerifiedAskRiV2Answer');

const out = {
  ok: failures.length === 0,
  programmePass: false,
  matrix: {
    sufficient: matrix.sufficient.status,
    partial: matrix.partial.status,
    insufficient: matrix.insufficient.status,
  },
  v2Render: { direct: rDirect.status, insufficient: rNo.status },
  note: 'Matrix is policy-level; live Anthropic accuracy not proven here.',
};
console.log(JSON.stringify(out, null, 2));
process.exit(failures.length ? 1 : 0);