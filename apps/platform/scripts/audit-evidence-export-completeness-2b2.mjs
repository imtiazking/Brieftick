#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTHENTIC_CORPUS_B1_DIR, EVIDENCE_PACKS_DIR, REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { loadEvidencePacksFromDir } from '../lib/ri/semantic/semantic-retrieval-eval.mjs';
import { auditPackTextCoverage, normalizePackForFullSemanticIndex } from '../lib/ri/semantic/evidence-pack-full-text.mjs';
import { buildChunksFromEvidencePack } from '../lib/ri/semantic/chunk-regulatory-evidence.mjs';
import { AutoTokenizer } from '@xenova/transformers';
import { GTE_SMALL_HF_ID } from '../lib/ri/semantic/gte-small-config.mjs';

const OUT = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-evidence-export-completeness-audit.json');

const dirs = [
  { label: 'frozen_core', dir: EVIDENCE_PACKS_DIR },
  { label: 'authentic_b1', dir: AUTHENTIC_CORPUS_B1_DIR },
];

const report = {
  generatedAt: new Date().toISOString(),
  corpora: [],
  totals: { packs: 0, packsWithSampleGap: 0, packsFullAfterNormalize: 0 },
};

const tokenizer = await AutoTokenizer.from_pretrained(GTE_SMALL_HF_ID);

for (const { label, dir } of dirs) {
  const packs = loadEvidencePacksFromDir(dir);
  const rows = [];
  for (const { file, pack } of packs) {
    pack.packFile = file;
    const before = auditPackTextCoverage(pack);
    const normalized = normalizePackForFullSemanticIndex(pack);
    const after = auditPackTextCoverage({ ...normalized, packFile: file });
    const chunks = await buildChunksFromEvidencePack(normalized, tokenizer, {});
    const indexedChars = chunks.reduce((a, c) => a + (c.chunkText?.length || 0), 0);
    rows.push({
      ...before,
      afterNormalize: after,
      indexedChunkCount: chunks.length,
      indexedChars,
      sampleLimitedExport: before.missingBlocks > 0,
      indexUsesFullBlocks: after.fullExport,
    });
    report.totals.packs += 1;
    if (before.missingBlocks > 0) report.totals.packsWithSampleGap += 1;
    if (after.fullExport) report.totals.packsFullAfterNormalize += 1;
  }
  report.corpora.push({ label, dir, packs: rows });
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    ok: true,
    packs: report.totals.packs,
    sampleGaps: report.totals.packsWithSampleGap,
    fullAfterNormalize: report.totals.packsFullAfterNormalize,
  }),
);
