/**
 * Reciprocal Rank Fusion (RRF) for offline hybrid retrieval.
 * https://plg.uwaterloo.ca/~gvcormac/cormacnn/cormacnn.htm — standard k=60.
 */

const DEFAULT_RRF_K = 60;

/**
 * Fuse multiple ranked lists of chunk ids.
 * @param {Array<{ chunkId: string, chunk: object, rankLists: { name: string, rank: number }[] }>} entries
 * @param {{ k?: number }} [opts]
 */
export function fuseReciprocalRanks(rankListsByChunk, { k = DEFAULT_RRF_K } = {}) {
  const fused = [];
  for (const [chunkId, row] of rankListsByChunk) {
    let score = 0;
    for (const { rank } of row.lists) {
      score += 1 / (k + rank);
    }
    fused.push({
      chunkId,
      chunk: row.chunk,
      rrfScore: score,
      similarity: score,
      rankContributions: row.lists,
    });
  }
  fused.sort((a, b) => b.rrfScore - a.rrfScore);
  return fused;
}

/**
 * @param {Array<{ chunk: object, similarity: number }>} semanticRanked
 * @param {Array<{ chunk: object, similarity: number }>} lexicalRanked
 */
export function fuseChunkRankingsSemanticLexical(semanticRanked, lexicalRanked, opts = {}) {
  const byId = new Map();
  const addList = (list, name) => {
    list.forEach((row, idx) => {
      const id = row.chunk.chunkId || row.chunk.documentEvidenceId || `${row.chunk.publicationId}:${idx}`;
      const prev = byId.get(id) || { chunk: row.chunk, lists: [] };
      prev.lists.push({ name, rank: idx + 1 });
      byId.set(id, prev);
    });
  };
  addList(semanticRanked, 'semantic');
  addList(lexicalRanked, 'bm25');
  return fuseReciprocalRanks(byId, opts);
}
