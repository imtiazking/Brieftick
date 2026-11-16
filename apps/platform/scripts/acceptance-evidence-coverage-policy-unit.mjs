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

const notInSuite = assessEvidenceQuestionCoverage({
  question: 'PS99/99',
  caseRow: { evidenceAvailability: 'NOT_IN_SUITE', requiredAnswerThemes: ['missing'] },
  bundle: { evidenceChunks: [{ evidenceChunkId: 'x', verbatimText: 'noise' }], publicationsRepresented: ['p'] },
});
if (notInSuite.questionCoverage !== 'UNKNOWN') failures.push('NOT_IN_SUITE must stay UNKNOWN');
else ok('NOT_IN_SUITE → UNKNOWN coverage');

const downgrade = refineCoverageAfterVerification(
  { questionCoverage: 'KNOWN', reasons: ['test'] },
  { ok: false },
  { evidenceChunks: [] },
);
if (downgrade.questionCoverage !== 'UNKNOWN') failures.push('verification failure must downgrade');
else ok('refineCoverage never upgrades; downgrades on verify fail');

console.log(JSON.stringify({ ok: failures.length === 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);