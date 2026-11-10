/**
 * Supabase-aligned gte-small (Transformers.js / ONNX). Pilot only — no production wiring.
 */
export const GTE_SMALL_HF_ID = 'Xenova/gte-small';
export const GTE_SMALL_UPSTREAM_REPO = 'thenlper/gte-small';
export const GTE_SMALL_SUPABASE_ALIAS = 'Supabase/gte-small';

export const CHUNK_MIN_TARGET_TOKENS = 60;
/** Normal authoritative indexing maximum (gte-small input, incl. special tokens). */
export const CHUNK_INDEX_MAX_TOKENS = 450;
export const CHUNK_TARGET_MAX_TOKENS = CHUNK_INDEX_MAX_TOKENS;
/** Model absolute ceiling — chunks must never be emitted above this. */
export const CHUNK_ABSOLUTE_MAX_TOKENS = 512;
export const CHUNK_HARD_MAX_TOKENS = CHUNK_ABSOLUTE_MAX_TOKENS;

export const EMBEDDING_OPTIONS = {
  pooling: 'mean',
  normalize: true,
  quantized: true,
};

export const MODEL_METADATA = {
  modelRepository: GTE_SMALL_HF_ID,
  upstreamRepository: GTE_SMALL_UPSTREAM_REPO,
  supabaseProductName: GTE_SMALL_SUPABASE_ALIAS,
  outputDimensions: 384,
  pooling: 'mean',
  vectorNormalization: 'l2',
  onnxQuantization: 'quantized (Transformers.js default)',
  runtime: 'node_transformers_js',
  edgeRuntimeEquivalence: 'UNVERIFIED',
};
