import { CHUNK_ABSOLUTE_MAX_TOKENS, CHUNK_INDEX_MAX_TOKENS } from './gte-small-config.mjs';
import { tokenLength } from './chunk-regulatory-evidence.mjs';

/**
 * Decide whether a chunk may enter the authoritative semantic index.
 */
export async function validateChunkForAuthoritativeIndex(tokenizer, chunkText, stats = {}) {
  const tok = await tokenLength(tokenizer, chunkText, { addSpecialTokens: true });
  if (tok > CHUNK_ABSOLUTE_MAX_TOKENS) {
    stats.pageBoundaryViolations = (stats.pageBoundaryViolations || 0) + 1;
    return { ok: false, tok, reason: 'exceeds_absolute_model_limit' };
  }
  if (tok > CHUNK_INDEX_MAX_TOKENS) {
    stats.oversizedChunksRejected = (stats.oversizedChunksRejected || 0) + 1;
    return { ok: false, tok, reason: 'exceeds_index_max_450' };
  }
  return { ok: true, tok, reason: null };
}
