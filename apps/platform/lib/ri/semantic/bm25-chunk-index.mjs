/**
 * Okapi BM25 over authoritative regulatory chunks (offline).
 */
import { tokenizeRegulatoryText } from './regulatory-lexical-tokenize.mjs';

const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

/**
 * @param {object[]} chunks — semantic index allChunks
 */
export function buildBm25ChunkIndex(chunks) {
  const N = chunks.length;
  const docFreq = new Map();
  const docs = [];
  let totalLen = 0;

  for (const chunk of chunks) {
    const terms = tokenizeRegulatoryText(chunk.chunkText);
    totalLen += terms.length;
    const tf = new Map();
    for (const t of terms) {
      tf.set(t, (tf.get(t) || 0) + 1);
      if (!docFreq.has(t)) docFreq.set(t, 0);
    }
    for (const t of tf.keys()) docFreq.set(t, docFreq.get(t) + 1);
    docs.push({ chunk, tf, docLen: terms.length });
  }

  const avgdl = N ? totalLen / N : 1;
  const idf = new Map();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
  }

  return { N, avgdl, docs, idf, k1: DEFAULT_K1, b: DEFAULT_B };
}

/**
 * @param {string} query
 * @param {ReturnType<typeof buildBm25ChunkIndex>} index
 */
export function scoreBm25Query(query, index) {
  const qTerms = tokenizeRegulatoryText(query);
  if (!qTerms.length) return [];

  const scores = [];
  for (const doc of index.docs) {
    let score = 0;
    const dl = doc.docLen;
    for (const term of qTerms) {
      const tf = doc.tf.get(term) || 0;
      if (!tf) continue;
      const idf = index.idf.get(term) || 0;
      const denom = tf + index.k1 * (1 - index.b + (index.b * dl) / index.avgdl);
      score += idf * ((tf * (index.k1 + 1)) / denom);
    }
    if (score > 0) scores.push({ chunk: doc.chunk, bm25: score });
  }
  scores.sort((a, b) => b.bm25 - a.bm25);
  return scores;
}

/**
 * Min-max normalise BM25 to [0,1] per query for threshold compatibility.
 * @param {{ chunk: object, bm25: number }[]} ranked
 */
export function normalizeBm25Scores(ranked) {
  if (!ranked.length) return [];
  const max = ranked[0].bm25;
  const min = ranked[ranked.length - 1].bm25;
  const span = max - min || 1;
  return ranked.map((row) => ({
    chunk: row.chunk,
    similarity: Number(((row.bm25 - min) / span).toFixed(6)),
    rawBm25: row.bm25,
  }));
}
