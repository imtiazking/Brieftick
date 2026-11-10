#!/usr/bin/env node
import { tokenizeRegulatoryText } from '../lib/ri/semantic/regulatory-lexical-tokenize.mjs';
import { buildBm25ChunkIndex, scoreBm25Query } from '../lib/ri/semantic/bm25-chunk-index.mjs';

const toks = tokenizeRegulatoryText('PS22/9 Consumer Duty PRIN 2A vulnerable customers APP fraud');
if (!toks.includes('ps22/9') && !toks.some((t) => t.includes('ps22'))) {
  throw new Error('regulatory_ref_token_missing');
}

const chunks = [
  {
    chunkId: 'a',
    publicationId: 'p1',
    publicationTitle: 'Test',
    chunkText: 'FG24/6 enables a risk-based approach to payments and APP fraud controls.',
  },
  {
    chunkId: 'b',
    publicationId: 'p2',
    publicationTitle: 'Other',
    chunkText: 'Fair value monitoring for consumer finance outcomes only.',
  },
];
const idx = buildBm25ChunkIndex(chunks);
const ranked = scoreBm25Query('APP fraud risk-based approach to payments', idx);
if (ranked[0].chunk.chunkId !== 'a') throw new Error('bm25_rank_wrong');

console.log(JSON.stringify({ ok: true, tests: ['tokenize', 'bm25_rank'] }));
