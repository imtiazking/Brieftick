#!/usr/bin/env node
import { resolveFinalRegulatoryStatus } from '../lib/ri/reasoner/evidence-sufficiency-policy.mjs';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const partialUnknown = resolveFinalRegulatoryStatus({
  responseState: 'PARTIAL_ANSWER',
  sufficiencyOverall: 'PARTIAL_SUPPORT',
  verifiedClaimCount: 2,
  unresolvedAspects: ['handbook module scope'],
  questionCoverage: 'UNKNOWN',
});
if (partialUnknown.status !== 'PARTIAL_ANSWER' || !partialUnknown.regulatoryReview?.required) {
  fail('partial with unknown coverage');
} else ok('partial unknown coverage holds review');

const noInventedAnswer = resolveFinalRegulatoryStatus({
  responseState: 'ANSWERED',
  sufficiencyOverall: 'DIRECT_SUPPORT',
  verifiedClaimCount: 2,
  unresolvedAspects: [],
  questionCoverage: 'UNKNOWN',
});
if (noInventedAnswer.status !== 'INSUFFICIENT_EVIDENCE') fail('unknown coverage must not ANSWERED');
else ok('unknown coverage fail-closed');

const relatedOnly = resolveFinalRegulatoryStatus({
  sufficiencyOverall: 'RELATED_CONTEXT_ONLY',
  verifiedClaimCount: 1,
  questionCoverage: 'KNOWN',
});
if (relatedOnly.status !== 'INSUFFICIENT_EVIDENCE') fail('related only');
else ok('related only insufficient');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, stage: 'C-policy-offline', passed: 4 }));