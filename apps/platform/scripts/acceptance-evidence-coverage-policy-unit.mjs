#!/usr/bin/env node
/**
 * Isolated Stage C policy + coverage unit tests (no mock provider integration).
 */
import { resolveFinalRegulatoryStatus } from '../lib/ri/reasoner/evidence-sufficiency-policy.mjs';
import {
  assessEvidenceQuestionCoverage,
  refineCoverageAfterVerification,
} from '../lib/ri/reasoner/assess-evidence-question-coverage.mjs';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);

const unknownAbstain = resolveFinalRegulatoryStatus({
  responseState: 'ANSWERED',
  sufficiencyOverall: 'DIRECT_SUPPORT',
  verifiedClaimCount: 1,
  questionCoverage: 'UNKNOWN',
});
if (unknownAbstain.status !== 'INSUFFICIENT_EVIDENCE') failures.push('UNKNOWN must fail-closed');
else ok('UNKNOWN coverage fail-closed with verified claims');

const knownAnswered = resolveFinalRegulatoryStatus({
  responseState: 'ANSWERED',
  sufficiencyOverall: 'DIRECT_SUPPORT',
  verifiedClaimCount: 1,
  questionCoverage: 'KNOWN',
});
if (knownAnswered.status !== 'ANSWERED') failures.push('KNOWN+DIRECT_SUPPORT should ANSWERED');
else ok('KNOWN coverage allows ANSWERED');

const absentSource = assessEvidenceQuestionCoverage({
  question: 'Summarise FCA Policy Statement PS99/99 on cryptoassets.',
  bundle: { evidenceChunks: [], publicationsRepresented: [] },
  retrieval: { allRankedChunks: [], referenceValidation: { blockSemanticSelection: true } },
  productionMode: true,
});
if (absentSource.questionCoverage !== 'UNKNOWN') failures.push('absent source must stay UNKNOWN');
else ok('absent authoritative source → UNKNOWN (production, no eval metadata)');

const downgrade = refineCoverageAfterVerification(
  { questionCoverage: 'KNOWN', reasons: ['test'] },
  { ok: false },
  { evidenceChunks: [] },
);
if (downgrade.questionCoverage !== 'UNKNOWN') failures.push('verification failure must downgrade');
else ok('refineCoverage never upgrades; downgrades on verify fail');

const hybridStrongSemantic = assessEvidenceQuestionCoverage({
  question: 'Under PRIN, what expectations apply to honesty?',
  bundle: {
    evidenceChunks: [
      {
        evidenceChunkId: 'c1',
        verbatimText: 'A firm must act with honesty and integrity. High-level expectations under PRIN 2.1 apply to all firms.',
        sectionReference: 'PRIN 2.1',
        publicationTitle: 'Principles for Businesses',
        publicationReference: 'PRIN',
        publicationStatus: 'handbook',
      },
    ],
  },
  retrieval: {
    retrievalMethod: 'hybrid',
    allRankedChunks: [{ similarity: 0.03, semanticSimilarity: 0.85, method: 'hybrid_rrf' }],
  },
  productionMode: true,
});
if (hybridStrongSemantic.questionCoverage !== 'KNOWN') {
  failures.push(`hybrid must use semanticSimilarity for strength got ${hybridStrongSemantic.questionCoverage}`);
} else ok('hybrid retrieval strength uses semanticSimilarity not RRF');

const weakSemantic = assessEvidenceQuestionCoverage({
  question: 'Under PRIN, what expectations apply to honesty?',
  bundle: {
    evidenceChunks: [
      { evidenceChunkId: 'c1', verbatimText: 'unrelated marketing text about holidays', publicationStatus: 'guidance' },
    ],
  },
  retrieval: {
    allRankedChunks: [{ similarity: 0.03, semanticSimilarity: 0.12, method: 'hybrid_rrf' }],
  },
  productionMode: true,
});
if (weakSemantic.questionCoverage !== 'UNKNOWN') failures.push('weak semantic must stay UNKNOWN');
else ok('weak semantic similarity stays UNKNOWN');

const cobsAbsent = assessEvidenceQuestionCoverage({
  question: 'What does COBS require for suitability assessments?',
  bundle: {
    evidenceChunks: [
      {
        evidenceChunkId: 'x1',
        verbatimText: 'PS22/9 discusses COBS 9.2.1R cross references for retail.',
        publicationStatus: 'policy_statement',
        publicationTitle: 'PS22/9',
      },
    ],
  },
  retrieval: {
    allRankedChunks: [{ similarity: 0.03, semanticSimilarity: 0.85, method: 'hybrid_rrf' }],
  },
  productionMode: true,
});
if (cobsAbsent.questionCoverage !== 'UNKNOWN') failures.push('COBS cross-ref in PS must not yield KNOWN');
else ok('COBS absent handbook — cross-refs do not establish KNOWN');

console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);