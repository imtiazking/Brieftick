/**
 * Publication-level score aggregation from chunk rankings (mitigate chunk-count dominance).
 */

/**
 * Max score per publication (default for semantic/BM25/hybrid).
 * @param {Array<{ chunk: object, similarity: number }>} scoredChunks
 */
export function aggregatePublicationScoresMax(scoredChunks) {
  const byPub = new Map();
  for (const row of scoredChunks) {
    const id = row.chunk.publicationId;
    const prev = byPub.get(id);
    if (!prev || row.similarity > prev.maxSimilarity) {
      byPub.set(id, {
        publicationId: id,
        publicationTitle: row.chunk.publicationTitle,
        publicationStatus: row.chunk.publicationStatus,
        maxSimilarity: row.similarity,
        topChunk: row.chunk,
        chunkHits: (prev?.chunkHits || 0) + 1,
        periodBoostApplied: Boolean(row.periodBoostApplied),
      });
    } else {
      prev.chunkHits += 1;
      prev.periodBoostApplied = prev.periodBoostApplied || Boolean(row.periodBoostApplied);
    }
  }
  return [...byPub.values()].sort((a, b) => b.maxSimilarity - a.maxSimilarity);
}

/**
 * Max with mild sqrt dampening when a publication has many tying chunks (diagnostic alternative).
 */
export function aggregatePublicationScoresMaxSqrtDamped(scoredChunks) {
  const maxAgg = aggregatePublicationScoresMax(scoredChunks);
  return maxAgg.map((p) => ({
    ...p,
    maxSimilarity: Number((p.maxSimilarity / Math.sqrt(1 + Math.log1p(p.chunkHits))).toFixed(6)),
  })).sort((a, b) => b.maxSimilarity - a.maxSimilarity);
}
