#!/usr/bin/env node
/**
 * Step G — detailed miss analysis from semantic baseline (phase-2b2-b2-retrieval-report.json).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { DEVELOPMENT_RETRIEVAL_PROBES_STEP_B2_V3 } from '../lib/ri/eval/eval-paths.mjs';

const SEMANTIC_REPORT = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-b2-retrieval-report.json');
const OUT_JSON = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-g-miss-analysis.json');
const OUT_MD = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-g-miss-analysis.md');
const ADJUDICATION = join(REPO_ROOT, 'docs', 'eval', 'development-retrieval-adjudication-2b2-step-g-v1.json');

const probes = JSON.parse(readFileSync(DEVELOPMENT_RETRIEVAL_PROBES_STEP_B2_V3, 'utf8'));
const probeById = new Map(probes.probes.map((p) => [p.testId, p]));
const report = JSON.parse(readFileSync(SEMANTIC_REPORT, 'utf8'));

const MISS_IDS = new Set([
  'DEV-B2-FG24-01',
  'DEV-B2-FG24-02',
  'DEV-B2-WHL-02',
  'DEV-B2-CASH24-01',
  'DEV-TEMP-CASH-03',
]);

/** Frozen suite miss from B2 corpus metrics (5/6) — identify via suite re-run label in report */
const frozenMissNote = {
  source: 'frozen_eval_suite_v2.1_on_b2_corpus',
  recallTop1: report.b2Corpus?.metrics?.publicationRecallTop1,
  denom: report.b2Corpus?.metrics?.publicationRecallTop1Denom,
  falseNegativeCount: report.b2Corpus?.metrics?.falseNegativeCount,
};

function strictTop1(result, expected) {
  if (!expected?.length) return false;
  return expected.includes(result.publicationSelected);
}

function classifyMiss(probe, result) {
  const selected = result.publicationSelected;
  const expected = probe.expectedPublicationIds || [];
  const top5 = result.rankedPublications || [];
  const expectedInTop5 = expected.some((id) => top5.some((p) => p.publicationId === id));

  if (probe.testId === 'DEV-ORIG-01') {
    if (expected.includes(selected)) {
      return {
        classification: 'VALID_ALTERNATIVE_SOURCE',
        rootCause: 'Probe lists multiple acceptable publications; retrieval selected FG22/5 fair-value monitoring evidence — valid under multi-source expectation.',
      };
    }
  }

  if (probe.testId === 'DEV-B2-FG24-01' && expectedInTop5) {
    return {
      classification: 'GENUINE_MISS',
      rootCause: 'FG24/6 ranked in top-5 chunks but CP26/38 financial crime PDF volume wins max-pool publication score (chunk-count / semantic overlap on payments fraud).',
    };
  }

  if (probe.testId === 'DEV-B2-FG24-02') {
    return {
      classification: 'GENUINE_MISS',
      rootCause: 'Lexical overlap on “calibrated controls” routed to Fair value consumer finance supervisory examples instead of FG24/6 payments guidance.',
    };
  }

  if (probe.testId === 'DEV-B2-WHL-02') {
    return {
      classification: 'GENUINE_MISS',
      rootCause: 'AML/sanctions vocabulary matches CP26/38 crime guide chunks more strongly than wholesale Insights 3 HTML (large competing corpus).',
    };
  }

  if (probe.testId === 'DEV-B2-CASH24-01' || probe.testId === 'DEV-TEMP-CASH-03') {
    return {
      classification: 'GENUINE_MISS',
      rootCause: 'Reporting period not encoded in embeddings; 2025 H1 and 2024 H2 cash coverage pages are semantically near-duplicates — recency bias toward 2025 H1.',
    };
  }

  return {
    classification: 'GENUINE_MISS',
    rootCause: 'Expected publication not ranked first; see ranked publications and passages.',
  };
}

function passageAddressesQuestion(excerpt, question) {
  const qTokens = question.toLowerCase().match(/[a-z]{4,}/g) || [];
  const ex = String(excerpt || '').toLowerCase();
  const hits = qTokens.filter((t) => ex.includes(t));
  return { overlapTerms: hits.slice(0, 12), substantivelyRelated: hits.length >= 2 };
}

const analyses = [];
for (const result of report.developmentProbesV3?.results || []) {
  const probe = probeById.get(result.testId);
  if (!probe) continue;
  const expected = probe.expectedPublicationIds || [];
  const isPositive = expected.length > 0;
  const top1Ok = strictTop1(result, expected);
  if (isPositive && top1Ok && !MISS_IDS.has(result.testId)) continue;
  if (!isPositive) continue;
  if (top1Ok && result.testId !== 'DEV-ORIG-01') continue;

  const topPassage = result.topChunks?.[0];
  const cls = classifyMiss(probe, result);
  analyses.push({
    testId: result.testId,
    question: result.question,
    category: probe.category,
    expectedPublicationIds: expected,
    actualTop5Publications: result.rankedPublications,
    topSimilarityScores: result.rankedPublications?.map((p) => p.maxSimilarity),
    retrievedPassages: result.topChunks,
    publicationTypes: result.rankedPublications?.map((p) => ({
      publicationId: p.publicationId,
      title: p.publicationTitle,
      status: p.publicationStatus,
    })),
    passageSubstanceCheck: passageAddressesQuestion(topPassage?.excerpt, result.question),
    passageSubstantivelyAddressesQuestion: topPassage?.substantive && cls.classification !== 'PROBE_DEFECT',
    classification: cls.classification,
    rootCause: cls.rootCause,
    publicationSelected: result.publicationSelected,
    publicationRecallTop5: result.publicationRecallTop5,
  });
}

const adjudication = {
  adjudicationVersion: 'development-retrieval-adjudication-2b2-step-g-v1',
  createdAt: new Date().toISOString(),
  scope: 'offline_development_only_not_frozen_eval',
  notes: [
    'Does not modify frozen probe expectedPublicationIds.',
    'VALID_ALTERNATIVE entries require independent evidence in retrieved passages.',
  ],
  frozenSuiteOnB2Corpus: frozenMissNote,
  alternativeSources: analyses
    .filter((a) => a.classification === 'VALID_ALTERNATIVE_SOURCE')
    .map((a) => ({
      testId: a.testId,
      acceptedPublicationIds: [a.publicationSelected].filter(Boolean),
      justification: a.rootCause,
      evidenceExcerpt: a.retrievedPassages?.[0]?.excerpt,
    })),
  classifications: analyses.map((a) => ({
    testId: a.testId,
    classification: a.classification,
    rootCause: a.rootCause,
  })),
};

writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), analyses, frozenMissNote }, null, 2));
writeFileSync(ADJUDICATION, JSON.stringify(adjudication, null, 2));
writeFileSync(
  OUT_MD,
  [
    '# Phase 2B.2 Step G — retrieval miss analysis',
    '',
    `Analysed ${analyses.length} strict-recall misses / multi-source cases.`,
    '',
    ...analyses.map(
      (a) =>
        `## ${a.testId}\n- **Class:** ${a.classification}\n- **Root cause:** ${a.rootCause}\n- **Selected:** ${a.publicationSelected}\n- **Expected:** ${a.expectedPublicationIds.join(', ')}\n`,
    ),
  ].join('\n'),
);

console.log(JSON.stringify({ ok: true, missCount: analyses.length, out: OUT_JSON }));
