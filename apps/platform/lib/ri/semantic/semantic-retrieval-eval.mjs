import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pipeline, AutoTokenizer } from '@xenova/transformers';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  EMBEDDING_OPTIONS,
  GTE_SMALL_HF_ID,
  MODEL_METADATA,
  CHUNK_MIN_TARGET_TOKENS,
} from './gte-small-config.mjs';
import { buildChunksFromEvidencePack, tokenLength } from './chunk-regulatory-evidence.mjs';
import { buildRegulatoryCatalogueFromPacks } from './build-regulatory-catalogue.mjs';
import { validateExplicitPublicationReferences } from './publication-reference-validation.mjs';
import { decideRetrievalMatch, isSubstantivePassage } from './no-match-detection.mjs';
import { filterAuthoritativeEvidencePacks } from './regulatory-evidence-provenance.mjs';
import { CHUNK_INDEX_MAX_TOKENS } from './gte-small-config.mjs';

function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function tensorToArray(output) {
  if (output?.data) return Float32Array.from(output.data);
  if (output?.tolist) return Float32Array.from(output.tolist().flat());
  return Float32Array.from(output);
}

export function loadEvidencePacksFromDir(packsDir, { requireAuthoritative = true } = {}) {
  const packs = [];
  for (const name of readdirSync(packsDir)) {
    if (!name.endsWith('.json') || name === 'manifest.json' || name === 'catalogue.json') continue;
    const pack = JSON.parse(readFileSync(join(packsDir, name), 'utf8'));
    packs.push({ file: name, pack });
  }
  if (!requireAuthoritative) return packs;
  const { accepted, rejected } = filterAuthoritativeEvidencePacks(packs);
  if (rejected.length) {
    return accepted;
  }
  return accepted;
}

export async function buildSemanticIndex(packsDir, { embedder, tokenizer } = {}) {
  const stats = { truncationAttempts: 0, pageBoundaryViolations: 0, shortChunkExceptions: 0 };
  const tok = tokenizer || (await AutoTokenizer.from_pretrained(GTE_SMALL_HF_ID));
  const embed =
    embedder ||
    (await pipeline('feature-extraction', GTE_SMALL_HF_ID, {
      quantized: EMBEDDING_OPTIONS.quantized,
    }));

  const packs = loadEvidencePacksFromDir(packsDir);
  const catalogue = buildRegulatoryCatalogueFromPacks(packs);
  const allChunks = [];

  for (const { file, pack } of packs) {
    const chunks = await buildChunksFromEvidencePack(pack, tok, stats);
    for (const c of chunks) {
      c.packFile = file;
      c.chunkId = createHash('sha256')
        .update(`${c.publicationId}:${c.extractionRevisionId}:${c.chunkText.slice(0, 80)}`)
        .digest('hex')
        .slice(0, 16);
    }
    allChunks.push(...chunks);
  }

  const tokenCounts = allChunks.map((c) => c.modelTokenCount);
  tokenCounts.sort((a, b) => a - b);

  const chunkVectors = [];
  for (const chunk of allChunks) {
    const out = await embed(chunk.chunkText, {
      pooling: EMBEDDING_OPTIONS.pooling,
      normalize: EMBEDDING_OPTIONS.normalize,
    });
    chunkVectors.push({ chunk, vector: tensorToArray(out) });
  }

  const indexedIds = new Set(allChunks.map((c) => c.publicationId));

  return {
    packs,
    catalogue,
    allChunks,
    chunkVectors,
    indexedPublicationIds: indexedIds,
    tokenizer: tok,
    embedder: embed,
    chunkTokenStats: {
      count: tokenCounts.length,
      min: tokenCounts[0] ?? 0,
      max: tokenCounts[tokenCounts.length - 1] ?? 0,
      mean: tokenCounts.length
        ? Number((tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length).toFixed(2))
        : 0,
      p95: percentile(tokenCounts, 95),
      belowMinTarget: tokenCounts.filter((t) => t < CHUNK_MIN_TARGET_TOKENS).length,
      overHardLimit: tokenCounts.filter((t) => t > 512).length,
      overIndexLimit: tokenCounts.filter((t) => t > CHUNK_INDEX_MAX_TOKENS).length,
      oversizedChunksRejected: stats.oversizedChunksRejected || 0,
      shortChunkExceptions: stats.shortChunkExceptions,
      truncationAttempts: stats.truncationAttempts,
      pageBoundaryViolations: stats.pageBoundaryViolations,
    },
  };
}

async function scoreQuestion(index, question, caseRow, provisionalThreshold) {
  const t0 = performance.now();
  const qVec = tensorToArray(
    await index.embedder(question, {
      pooling: EMBEDDING_OPTIONS.pooling,
      normalize: EMBEDDING_OPTIONS.normalize,
    }),
  );

  let pool = index.chunkVectors;
  const refValidation = validateExplicitPublicationReferences(
    question,
    index.catalogue,
    index.indexedPublicationIds,
  );
  if (refValidation.restrictToPublicationIds?.length === 1) {
    const allow = new Set(refValidation.restrictToPublicationIds);
    pool = pool.filter(({ chunk }) => allow.has(chunk.publicationId));
  }

  const scored = pool
    .map(({ chunk, vector }) => ({
      chunk,
      similarity: cosineSimilarity(qVec, vector),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const byPub = new Map();
  for (const row of scored) {
    const id = row.chunk.publicationId;
    const prev = byPub.get(id);
    if (!prev || row.similarity > prev.maxSimilarity) {
      byPub.set(id, {
        publicationId: id,
        publicationTitle: row.chunk.publicationTitle,
        maxSimilarity: row.similarity,
        topChunk: row.chunk,
      });
    }
  }
  const rankedPubs = [...byPub.values()].sort((a, b) => b.maxSimilarity - a.maxSimilarity);

  const match = decideRetrievalMatch({
    question,
    referenceValidation: refValidation,
    rankedPublications: rankedPubs.map((p) => ({
      ...p,
      maxSimilarity: Number(p.maxSimilarity.toFixed(6)),
    })),
    topChunks: scored.slice(0, 5),
    provisionalThreshold,
  });

  const topPassage = match.selectedChunk?.chunk;
  const substance = isSubstantivePassage(topPassage?.chunkText, topPassage?.modelTokenCount ?? 0);

  return {
    testId: caseRow?.testId,
    question,
    latencyMs: Number((performance.now() - t0).toFixed(2)),
    expectedPublicationIds: caseRow?.expectedPublicationIds || [],
    referenceValidation: refValidation,
    noMatchDecision: match,
    rankedPublications: rankedPubs.slice(0, 5).map((p) => ({
      publicationId: p.publicationId,
      publicationTitle: p.publicationTitle,
      maxSimilarity: Number(p.maxSimilarity.toFixed(6)),
    })),
    topChunks: scored.slice(0, 5).map((s) => ({
      similarity: Number(s.similarity.toFixed(6)),
      publicationId: s.chunk.publicationId,
      title: s.chunk.publicationTitle,
      page: s.chunk.physicalPageNumber,
      section: s.chunk.sectionReference,
      modelTokenCount: s.chunk.modelTokenCount,
      substantive: isSubstantivePassage(s.chunk.chunkText, s.chunk.modelTokenCount).substantive,
      excerpt: s.chunk.chunkText.slice(0, 200),
    })),
    publicationSelected: match.abstain ? null : match.selectedPublication?.publicationId,
    passageRelevant: match.abstain ? false : substance.substantive,
    passageSubstance: substance,
  };
}

function calibrateThreshold(positive, negative) {
  const negativeTopSims = negative.map((n) => n.rankedPublications?.[0]?.maxSimilarity ?? 0);
  const positiveTopSims = positive
    .filter((p) => p.publicationRecallTop1)
    .map((p) => p.rankedPublications?.[0]?.maxSimilarity ?? 0);
  return Number(
    (
      (Math.min(...negativeTopSims, 1) + (percentile(positiveTopSims.sort((a, b) => a - b), 25) || 0)) /
      2
    ).toFixed(4),
  );
}

async function buildIndexFromPackDirs(dirs, { embedder, tokenizer }) {
  const stats = { truncationAttempts: 0, pageBoundaryViolations: 0, shortChunkExceptions: 0 };
  const packs = [];
  const seen = new Set();
  for (const dir of dirs) {
    for (const row of loadEvidencePacksFromDir(dir)) {
      const key = `${row.pack.publicationId}:${row.file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      packs.push(row);
    }
  }

  const catalogue = buildRegulatoryCatalogueFromPacks(packs);
  const allChunks = [];
  const chunkVectors = [];

  for (const { file, pack } of packs) {
    const chunks = await buildChunksFromEvidencePack(pack, tokenizer, stats);
    for (const c of chunks) {
      c.packFile = file;
      c.chunkId = createHash('sha256')
        .update(`${c.publicationId}:${c.extractionRevisionId}:${c.chunkText.slice(0, 80)}`)
        .digest('hex')
        .slice(0, 16);
      const out = await embedder(c.chunkText, {
        pooling: EMBEDDING_OPTIONS.pooling,
        normalize: EMBEDDING_OPTIONS.normalize,
      });
      allChunks.push(c);
      chunkVectors.push({ chunk: c, vector: tensorToArray(out) });
    }
  }

  const tokenCounts = allChunks.map((c) => c.modelTokenCount).sort((a, b) => a - b);
  return {
    packs,
    catalogue,
    allChunks,
    chunkVectors,
    indexedPublicationIds: new Set(allChunks.map((c) => c.publicationId)),
    tokenizer,
    embedder,
    chunkTokenStats: {
      count: tokenCounts.length,
      min: tokenCounts[0] ?? 0,
      max: tokenCounts[tokenCounts.length - 1] ?? 0,
      mean: tokenCounts.length
        ? Number((tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length).toFixed(2))
        : 0,
      p95: percentile(tokenCounts, 95),
      belowMinTarget: tokenCounts.filter((t) => t < CHUNK_MIN_TARGET_TOKENS).length,
      overHardLimit: tokenCounts.filter((t) => t > 512).length,
      overIndexLimit: tokenCounts.filter((t) => t > CHUNK_INDEX_MAX_TOKENS).length,
      oversizedChunksRejected: stats.oversizedChunksRejected || 0,
      shortChunkExceptions: stats.shortChunkExceptions,
      truncationAttempts: stats.truncationAttempts,
      pageBoundaryViolations: stats.pageBoundaryViolations,
    },
  };
}

export async function runCorpusRetrievalEval({
  corpusLabel,
  packsDirs,
  evalSuitePath,
  extraNegativeProbes = [],
}) {
  const dirs = Array.isArray(packsDirs) ? packsDirs : [packsDirs];
  const tokenizer = await AutoTokenizer.from_pretrained(GTE_SMALL_HF_ID);
  const embedder = await pipeline('feature-extraction', GTE_SMALL_HF_ID, {
    quantized: EMBEDDING_OPTIONS.quantized,
  });

  const index = await buildIndexFromPackDirs(dirs, { embedder, tokenizer });

  const suite = JSON.parse(readFileSync(evalSuitePath, 'utf8'));
  const positiveIds = ['EVAL-H-01', 'EVAL-H-02', 'EVAL-H-03', 'EVAL-H-04', 'EVAL-H-05', 'EVAL-A-04'];
  const negativeIds = ['EVAL-I-01', 'EVAL-B-03', 'EVAL-J-03'];

  const calibrationNegative = [];
  const calibrationPositive = [];
  for (const id of negativeIds) {
    const row = suite.cases.find((c) => c.testId === id);
    if (!row) continue;
    const r = await scoreQuestion(index, row.question, row, 0.75);
    calibrationNegative.push(r);
  }
  for (const id of positiveIds) {
    const row = suite.cases.find((c) => c.testId === id);
    if (!row) continue;
    const r = await scoreQuestion(index, row.question, row, 0.75);
    const expected = row.expectedPublicationIds || [];
    calibrationPositive.push({
      ...r,
      publicationRecallTop1: expected.includes(r.rankedPublications[0]?.publicationId),
    });
  }

  const provisionalThreshold = calibrateThreshold(calibrationPositive, calibrationNegative);

  const positive = [];
  for (const id of positiveIds) {
    const row = suite.cases.find((c) => c.testId === id);
    if (!row) continue;
    const result = await scoreQuestion(index, row.question, row, provisionalThreshold);
    const expected = row.expectedPublicationIds || [];
    result.publicationRecallTop1 = result.publicationSelected
      ? expected.includes(result.publicationSelected)
      : false;
    result.publicationRecallTop5 = expected.some((pid) =>
      result.rankedPublications.slice(0, 5).some((p) => p.publicationId === pid),
    );
    positive.push(result);
  }

  const negative = [];
  for (const id of negativeIds) {
    const row = suite.cases.find((c) => c.testId === id);
    if (!row) continue;
  const result = await scoreQuestion(index, row.question, row, provisionalThreshold);
    result.correctlyRejected = result.noMatchDecision.abstain;
    negative.push(result);
  }

  for (const probe of extraNegativeProbes) {
    const result = await scoreQuestion(index, probe.question, { testId: probe.testId }, provisionalThreshold);
    result.correctlyRejected = result.noMatchDecision.abstain;
    negative.push(result);
  }

  const negCorrect = negative.filter((n) => n.correctlyRejected).length;
  const falsePositives = negative.filter((n) => !n.correctlyRejected);
  const falseNegatives = positive.filter((p) => !p.publicationRecallTop1 && !p.noMatchDecision.abstain);

  return {
    corpusLabel,
    packDirs: dirs,
    distinctPublications: index.indexedPublicationIds.size,
    chunkTokenStats: index.chunkTokenStats,
    provisionalThreshold,
    positive,
    negative,
    metrics: {
      publicationRecallTop1: positive.filter((p) => p.publicationRecallTop1).length,
      publicationRecallTop1Denom: positive.length,
      publicationRecallTop5: positive.filter((p) => p.publicationRecallTop5).length,
      passageRelevanceRate: positive.filter((p) => p.passageRelevant).length,
      negativeCorrectRejectionRate: negative.length ? negCorrect / negative.length : 0,
      falsePositiveRate: negative.length ? falsePositives.length / negative.length : 0,
      falseNegativeCount: falseNegatives.length,
      falsePositives: falsePositives.map((f) => ({
        testId: f.testId,
        selected: f.publicationSelected,
        topPublication: f.rankedPublications[0],
        noMatchReasons: f.noMatchDecision.reasons,
      })),
      meanLatencyMs: Number(
        (
          [...positive, ...negative].reduce((a, r) => a + (r.latencyMs || 0), 0) /
          Math.max(1, positive.length + negative.length)
        ).toFixed(2),
      ),
    },
    model: MODEL_METADATA,
  };
}

export async function runStepC2b2Comparison({
  evalSuitePath,
  originalPacksDir,
  expandedPacksDirs,
  extraNegativeProbes,
}) {
  const original = await runCorpusRetrievalEval({
    corpusLabel: 'original_three_publications',
    packsDirs: [originalPacksDir],
    evalSuitePath,
    extraNegativeProbes,
  });
  const expanded = await runCorpusRetrievalEval({
    corpusLabel: 'expanded_with_supplemental',
    packsDirs: expandedPacksDirs,
    evalSuitePath,
    extraNegativeProbes,
  });

  return {
    phase: '2B.2-C-retrieval-hardening',
    generatedAt: new Date().toISOString(),
    embeddingRuntime: {
      ...MODEL_METADATA,
      edgeRuntimeEquivalence: 'UNVERIFIED',
      note: 'Local Transformers.js ONNX only; Supabase Edge equivalence not demonstrated in this step.',
    },
    referenceValidation: {
      module: 'publication-reference-validation.mjs',
      scope: 'offline_indexed_catalogue',
    },
    noMatchStrategy: {
      module: 'no-match-detection.mjs',
      signals: [
        'absolute_similarity',
        'top_candidate_margin',
        'lexical_semantic_agreement',
        'publication_metadata_restriction',
        'passage_substance',
        'explicit_reference_validation',
      ],
    },
    originalCorpus: original,
    expandedCorpus: expanded,
    requiredCases: {
      'EVAL-I-01': original.negative.find((n) => n.testId === 'EVAL-I-01'),
      'EVAL-J-03': original.negative.find((n) => n.testId === 'EVAL-J-03'),
      'EVAL-H-01': original.positive.find((p) => p.testId === 'EVAL-H-01'),
    },
    completionGate: {
      pageBoundaryViolations:
        original.chunkTokenStats.pageBoundaryViolations + expanded.chunkTokenStats.pageBoundaryViolations,
      truncationAttempts: original.chunkTokenStats.truncationAttempts + expanded.chunkTokenStats.truncationAttempts,
      silentTruncation:
        original.chunkTokenStats.overHardLimit === 0 && expanded.chunkTokenStats.overHardLimit === 0,
      runtimeEquivalenceDemonstrated: false,
    },
    readinessForPgvector: {
      recommendation: 'defer_until_edge_equivalence_and_larger_labelled_corpus',
      blockers: [
        'edge_runtime_embedding_equivalence_unverified',
        'staging_extraction_coverage_insufficient_for_production_catalogue',
      ],
    },
  };
}
