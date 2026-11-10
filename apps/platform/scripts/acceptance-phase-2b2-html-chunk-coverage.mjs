#!/usr/bin/env node
import { AutoTokenizer } from '@xenova/transformers';
import { GTE_SMALL_HF_ID, CHUNK_INDEX_MAX_TOKENS } from '../lib/ri/semantic/gte-small-config.mjs';
import {
  buildChunksFromEvidencePack,
  reconcileSectionTextCoverage,
  splitHtmlSectionToTokenBudget,
  tokenLength,
} from '../lib/ri/semantic/chunk-regulatory-evidence.mjs';

const tokenizer = await AutoTokenizer.from_pretrained(GTE_SMALL_HF_ID);

function assert(name, ok, detail) {
  if (!ok) {
    console.error(`FAIL: ${name}`, detail || '');
    process.exit(1);
  }
  console.log(`PASS: ${name}`);
}

const longSection = `${'The FCA expects firms to monitor customer outcomes and assess fair value. '.repeat(80)}`;
const split = await splitHtmlSectionToTokenBudget(tokenizer, longSection, 'Fair value monitoring');
assert('oversized html section splits', split.length > 1, { parts: split.length });
for (const part of split) {
  const tok = await tokenLength(tokenizer, part.chunkText, { addSpecialTokens: true });
  assert('each part within index max', tok <= CHUNK_INDEX_MAX_TOKENS, { tok });
}
const cov = reconcileSectionTextCoverage(longSection, split.map((p) => p.chunkText));
assert('no silent text loss on split', cov.fullCoverage, cov);

const pack = {
  publicationId: '00000000-0000-4000-8000-000000000099',
  extractionRevisionId: '11111111-1111-4111-8111-111111111111',
  publicationTitle: 'Synthetic acceptance pack',
  canonicalUrl: 'https://www.fca.org.uk/example/test',
  regulatoryStatus: 'test',
  verifiedTextSamples: [
    { sectionReference: 'Oversized section', extractedText: longSection, documentEvidenceId: 'acc1' },
  ],
};
const stats = { sectionAudits: [] };
const chunks = await buildChunksFromEvidencePack(pack, tokenizer, stats);
assert('indexed chunks produced', chunks.length >= split.length, { chunks: chunks.length });
assert('zero excluded sections', (stats.eligibleSectionsExcluded || 0) === 0, stats);
assert('all indexed chunks <= 450', chunks.every((c) => c.modelTokenCount <= CHUNK_INDEX_MAX_TOKENS));

console.log(JSON.stringify({ ok: true, acceptance: 'phase-2b2-html-chunk-coverage' }));
