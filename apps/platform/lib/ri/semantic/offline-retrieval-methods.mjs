import { performance } from 'node:perf_hooks';
import { validateExplicitPublicationReferences } from './publication-reference-validation.mjs';
import { decideRetrievalMatch, isSubstantivePassage } from './no-match-detection.mjs';
import { evaluateSemanticRetrievalAuthorityGate } from './semantic-retrieval-authority-gate.mjs';
import { buildBm25ChunkIndex, scoreBm25Query, normalizeBm25Scores } from './bm25-chunk-index.mjs';
import { fuseChunkRankingsSemanticLexical } from './reciprocal-rank-fusion.mjs';
import { aggregatePublicationScoresMax } from './publication-rank-aggregate.mjs';
import { applyReportingPeriodHint } from './reporting-period-retrieval.mjs';

function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

function tensorToArray(output) {
  if (output?.data) return Float32Array.from(output.data);
  if (output?.tolist) return Float32Array.from(output.tolist().flat());
  return Float32Array.from(output);
}

export function attachBm25ToIndex(semanticIndex) {
  return {
    ...semanticIndex,
    bm25: buildBm25ChunkIndex(semanticIndex.allChunks),
  };
}

function filterPool(index, refValidation) {
  let pool = index.chunkVectors;
  if (refValidation.restrictToPublicationIds?.length === 1) {
    const allow = new Set(refValidation.restrictToPublicationIds);
    pool = pool.filter(({ chunk }) => allow.has(chunk.publicationId));
  }
  return pool;
}

async function rankSemantic(index, question, pool) {
  const { EMBEDDING_OPTIONS } = await import('./gte-small-config.mjs');
  const qVec = tensorToArray(
    await index.embedder(question, {
      pooling: EMBEDDING_OPTIONS.pooling,
      normalize: EMBEDDING_OPTIONS.normalize,
    }),
  );
  return pool
    .map(({ chunk, vector }) => ({
      chunk,
      similarity: cosineSimilarity(qVec, vector),
      method: 'semantic',
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

function rankBm25(index, question, pool) {
  const chunkSet = new Set(pool.map(({ chunk }) => chunk.chunkId));
  const ranked = scoreBm25Query(question, index.bm25).filter((r) => chunkSet.has(r.chunk.chunkId));
  return normalizeBm25Scores(ranked).map((r) => ({
    chunk: r.chunk,
    similarity: r.similarity,
    rawBm25: r.rawBm25,
    method: 'bm25',
  }));
}

function rankHybrid(semanticRanked, bm25Ranked) {
  const fused = fuseChunkRankingsSemanticLexical(
    semanticRanked.map((r) => ({ chunk: r.chunk, similarity: r.similarity })),
    bm25Ranked.map((r) => ({ chunk: r.chunk, similarity: r.similarity })),
  );
  return fused.map((r) => ({
    chunk: r.chunk,
    similarity: Number(r.rrfScore.toFixed(8)),
    rrfScore: r.rrfScore,
    method: 'hybrid_rrf',
    rankContributions: r.rankContributions,
  }));
}

function buildRankedPublications(scoredChunks) {
  return aggregatePublicationScoresMax(scoredChunks);
}

/**
 * @param {'semantic'|'bm25'|'hybrid'} method
 */
export async function scoreQuestionWithMethod(index, question, caseRow, provisionalThreshold, method = 'semantic') {
  const t0 = performance.now();
  const authorityGate = evaluateSemanticRetrievalAuthorityGate(question, {
    indexedRegulatorIds: ['REG-FCA'],
  });
  if (authorityGate.blockSemanticSelection) {
    return emptyAbstainResult(caseRow, question, t0, authorityGate);
  }

  const refValidation = validateExplicitPublicationReferences(
    question,
    index.catalogue,
    index.indexedPublicationIds,
  );
  if (refValidation.blockSemanticSelection) {
    return emptyAbstainResult(caseRow, question, t0, null, refValidation);
  }

  const pool = filterPool(index, refValidation);
  const semanticRanked = await rankSemantic(index, question, pool);
  let scoredChunks;
  if (method === 'semantic') {
    scoredChunks = semanticRanked;
  } else if (method === 'bm25') {
    if (!index.bm25) throw new Error('bm25_index_missing');
    scoredChunks = rankBm25(index, question, pool);
  } else if (method === 'hybrid') {
    if (!index.bm25) throw new Error('bm25_index_missing');
    const bm25Ranked = rankBm25(index, question, pool);
    scoredChunks = rankHybrid(semanticRanked, bm25Ranked);
  } else {
    throw new Error(`unknown_retrieval_method:${method}`);
  }

  scoredChunks = applyReportingPeriodHint(question, scoredChunks);
  const rankedPubs = buildRankedPublications(scoredChunks);
  const periodAdjusted = rankedPubs.some((p) => p.periodBoostApplied);

  const semanticByChunkId = new Map(semanticRanked.map((s) => [s.chunk.chunkId, s.similarity]));
  const semanticByPub = new Map();
  for (const s of semanticRanked) {
    const id = s.chunk.publicationId;
    if (!semanticByPub.has(id) || s.similarity > semanticByPub.get(id)) {
      semanticByPub.set(id, s.similarity);
    }
  }

  const rankedPubsForDecision = rankedPubs.map((p) => ({
    ...p,
    fusionScore: Number(p.maxSimilarity.toFixed(6)),
    maxSimilarity: Number((semanticByPub.get(p.publicationId) ?? p.maxSimilarity).toFixed(6)),
  }));

  const topChunksForDecision = scoredChunks.slice(0, 5).map((s) => ({
    ...s,
    fusionScore: s.similarity,
    similarity: semanticByChunkId.get(s.chunk.chunkId) ?? s.similarity,
  }));

  const match = decideRetrievalMatch({
    question,
    referenceValidation: refValidation,
    rankedPublications: rankedPubsForDecision,
    topChunks: topChunksForDecision,
    provisionalThreshold,
  });

  const topPassage = match.selectedChunk?.chunk;
  const substance = isSubstantivePassage(topPassage?.chunkText, topPassage?.modelTokenCount ?? 0);

  return {
    testId: caseRow?.testId,
    question,
    retrievalMethod: method,
    latencyMs: Number((performance.now() - t0).toFixed(2)),
    expectedPublicationIds: caseRow?.expectedPublicationIds || [],
    referenceValidation: refValidation,
    authorityGate: authorityGate.blockSemanticSelection ? authorityGate : undefined,
    noMatchDecision: match,
    rankedPublications: rankedPubs.slice(0, 5).map((p) => ({
      publicationId: p.publicationId,
      publicationTitle: p.publicationTitle,
      publicationStatus: p.publicationStatus,
      maxSimilarity: Number(p.maxSimilarity.toFixed(6)),
      fusionScore: Number(p.maxSimilarity.toFixed(6)),
      semanticMaxSimilarity: Number((semanticByPub.get(p.publicationId) ?? 0).toFixed(6)),
      chunkHits: p.chunkHits,
      periodBoostApplied: p.periodBoostApplied || false,
    })),
    topChunks: scoredChunks.slice(0, 5).map((s) => ({
      similarity: Number(s.similarity.toFixed(6)),
      fusionScore: Number(s.similarity.toFixed(6)),
      semanticSimilarity: Number((semanticByChunkId.get(s.chunk.chunkId) ?? 0).toFixed(6)),
      method: s.method,
      publicationId: s.chunk.publicationId,
      title: s.chunk.publicationTitle,
      publicationStatus: s.chunk.publicationStatus,
      page: s.chunk.physicalPageNumber,
      section: s.chunk.sectionReference,
      extractionRevisionId: s.chunk.extractionRevisionId,
      contentSha256: s.chunk.contentSha256,
      modelTokenCount: s.chunk.modelTokenCount,
      substantive: isSubstantivePassage(s.chunk.chunkText, s.chunk.modelTokenCount).substantive,
      excerpt: s.chunk.chunkText.slice(0, 240),
    })),
    publicationSelected: match.abstain ? null : match.selectedPublication?.publicationId,
    passageRelevant: match.abstain ? false : substance.substantive,
    passageSubstance: substance,
    reportingPeriodHint: periodAdjusted,
    allRankedChunks: scoredChunks.slice(0, 48).map((s) => ({
      chunk: s.chunk,
      similarity: Number(s.similarity.toFixed(6)),
      method: s.method,
      semanticSimilarity: Number((semanticByChunkId.get(s.chunk.chunkId) ?? 0).toFixed(6)),
      rrfScore: s.rrfScore ?? null,
    })),
  };
}

function emptyAbstainResult(caseRow, question, t0, authorityGate, refValidation) {
  const expected = caseRow?.expectedPublicationIds || [];
  return {
    testId: caseRow?.testId,
    question,
    retrievalMethod: 'blocked',
    latencyMs: Number((performance.now() - t0).toFixed(2)),
    expectedPublicationIds: expected,
    authorityGate,
    referenceValidation: refValidation || { outcome: authorityGate?.outcome, blockSemanticSelection: true },
    noMatchDecision: {
      abstain: true,
      reasons: [authorityGate?.abstainReason || refValidation?.abstainReason || 'blocked'],
      signals: { authorityGate: Boolean(authorityGate) },
    },
    rankedPublications: [],
    topChunks: [],
    publicationSelected: null,
    passageRelevant: false,
    passageSubstance: { substantive: false, reason: 'blocked' },
    correctlyRejected: !expected.length,
  };
}
