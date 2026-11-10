#!/usr/bin/env node
/**
 * Phase 2B.2 Step F — section-level chunk coverage audit (offline, read-only packs).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AutoTokenizer } from '@xenova/transformers';
import { AUTHENTIC_CORPUS_B1_DIR, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { GTE_SMALL_HF_ID } from '../lib/ri/semantic/gte-small-config.mjs';
import { buildChunksFromEvidencePack, tokenLength } from '../lib/ri/semantic/chunk-regulatory-evidence.mjs';
import { loadEvidencePacksFromDir } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { CHUNK_INDEX_MAX_TOKENS } from '../lib/ri/semantic/gte-small-config.mjs';

const OUT = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-f-chunk-coverage-audit.json');

const tokenizer = await AutoTokenizer.from_pretrained(GTE_SMALL_HF_ID);
const packs = loadEvidencePacksFromDir(AUTHENTIC_CORPUS_B1_DIR);
const report = {
  phase: '2B.2-F-chunk-coverage',
  generatedAt: new Date().toISOString(),
  corpusDir: AUTHENTIC_CORPUS_B1_DIR,
  publications: [],
  totals: {
    sections: 0,
    excludedFromIndex: 0,
    incompleteCoverage: 0,
    overIndexMax: 0,
  },
};

let totalChunks = 0;
const priorExcludedSections = [];

for (const { file, pack } of packs) {
  const stats = { sectionAudits: [], oversizedChunksRejected: 0, eligibleSectionsExcluded: 0 };
  const chunks = await buildChunksFromEvidencePack(pack, tokenizer, stats);
  totalChunks += chunks.length;
  let overMax = 0;
  for (const c of chunks) {
    if (c.modelTokenCount > CHUNK_INDEX_MAX_TOKENS) overMax += 1;
  }
  const badSections = (stats.sectionAudits || []).filter((s) => !s.fullCoverage || s.excludedFromIndex);
  report.publications.push({
    packFile: file,
    publicationId: pack.publicationId,
    publicationTitle: pack.publicationTitle,
    chunkCount: chunks.length,
    sectionAudits: stats.sectionAudits || [],
    oversizedChunksRejected: stats.oversizedChunksRejected || 0,
    eligibleSectionsExcluded: stats.eligibleSectionsExcluded || 0,
    chunksOverIndexMax: overMax,
  });
  report.totals.sections += stats.sectionAudits?.length || 0;
  report.totals.incompleteCoverage += badSections.filter((s) => !s.fullCoverage).length;
  report.totals.excludedFromIndex += stats.eligibleSectionsExcluded || 0;
  report.totals.overIndexMax += overMax;
}

report.totals.indexedChunks = totalChunks;
report.totals.priorStepE_pageBoundarySignals = 6;
report.note =
  'Prior Step E reported six build-time HTML sections >512 tokens excluded at filter; corrected splitter uses splitToMaxTokens per section.';

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    ok: report.totals.excludedFromIndex === 0 && report.totals.overIndexMax === 0,
    indexedChunks: totalChunks,
    sections: report.totals.sections,
    excluded: report.totals.excludedFromIndex,
  }),
);
