/**
 * Multi-publication evidence assembly with explicit caps and budget accounting.
 */
import { mapChunkToEvidenceV2 } from './evidence-chunk-v2.mjs';

const DEFAULT_TARGET_CHUNKS = 14;
const DEFAULT_MAX_CHUNKS = 16;
const DEFAULT_MAX_PER_PUBLICATION = 6;
const DEFAULT_CHAR_BUDGET = 48_000;

const CONSULTATION_STATUS = /consultation|proposal/i;

function statusPreamble(chunk) {
  if (CONSULTATION_STATUS.test(String(chunk.regulatoryStatus || ''))) {
    const ref = chunk.publicationReference ? ` (${chunk.publicationReference})` : '';
    return `Regulatory status: consultation paper${ref}. Statements describe proposals, not binding rules.`;
  }
  if (/finalised guidance|guidance/i.test(String(chunk.regulatoryStatus || ''))) {
    return 'Regulatory status: finalised guidance / supervisory expectation (not necessarily binding rule text).';
  }
  if (/policy statement|binding/i.test(String(chunk.regulatoryStatus || ''))) {
    return 'Regulatory status: policy statement or binding rule material — check cited passages for modality (must/should).';
  }
  return null;
}

function packByPublicationId(index) {
  const map = new Map();
  for (const row of index.packs || []) {
    const id = row.pack?.publicationId;
    if (id) map.set(id, row);
  }
  return map;
}

/**
 * @param {object} index — semantic index
 * @param {Array<{ chunk, similarity, method? }>} rankedChunks
 */
export function assembleEvidenceBundle(index, rankedChunks, options = {}) {
  const targetChunks = options.targetChunks ?? DEFAULT_TARGET_CHUNKS;
  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const maxPerPub = options.maxPerPublication ?? DEFAULT_MAX_PER_PUBLICATION;
  const charBudget = options.charBudget ?? DEFAULT_CHAR_BUDGET;

  const packMap = packByPublicationId(index);
  const perPubCount = new Map();
  const selected = [];
  const excluded = [];
  let charsUsed = 0;

  for (const row of rankedChunks) {
    if (selected.length >= maxChunks) {
      excluded.push({ chunkId: row.chunk?.chunkId, reason: 'max_chunks_cap' });
      continue;
    }
    const pubId = row.chunk?.publicationId;
    const pubCount = perPubCount.get(pubId) || 0;
    if (pubCount >= maxPerPub) {
      excluded.push({ chunkId: row.chunk?.chunkId, reason: 'max_per_publication_cap' });
      continue;
    }

    const packRow = packMap.get(pubId);
    const scores = {
      semantic: row.semanticSimilarity ?? row.similarity,
      bm25: row.bm25Score ?? null,
      rrf: row.rrfScore ?? (row.method === 'hybrid_rrf' ? row.similarity : null),
      rank: selected.length + 1,
    };
    const ev = mapChunkToEvidenceV2(row.chunk, packRow, scores);
    const addition = ev.verbatimText.length + 120;
    if (charsUsed + addition > charBudget && selected.length >= Math.min(8, targetChunks)) {
      excluded.push({ chunkId: ev.evidenceChunkId, reason: 'char_budget_exceeded' });
      continue;
    }

    selected.push(ev);
    perPubCount.set(pubId, pubCount + 1);
    charsUsed += ev.verbatimText.length;
    if (selected.length >= targetChunks && charsUsed >= charBudget * 0.85) break;
  }

  const statusPreambles = [];
  const seenPub = new Set();
  for (const ev of selected) {
    if (seenPub.has(ev.publicationId)) continue;
    seenPub.add(ev.publicationId);
    const p = statusPreamble(ev);
    if (p) statusPreambles.push({ publicationId: ev.publicationId, text: p });
  }

  const limitation =
    excluded.length > 0
      ? `Context budget excluded ${excluded.length} retrieved chunk(s); answer may be incomplete.`
      : null;

  return {
    evidenceChunks: selected,
    excludedChunks: excluded,
    charBudget,
    charsUsed,
    publicationsRepresented: [...perPubCount.keys()],
    statusPreambles,
    contextLimitationNote: limitation,
    chunkById: new Map(selected.map((c) => [c.evidenceChunkId, c])),
    questionCoverage: options.questionCoverage === 'KNOWN' ? 'KNOWN' : 'UNKNOWN',
  };
}
