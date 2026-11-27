export const TERMINAL_CORPUS_CODES = new Set([
  'ACCESS_RESTRICTED',
  'AUTH_REQUIRED',
  'HOST_NOT_ALLOWED',
  'URL_NOT_ALLOWED',
  'SSRF_BLOCKED',
  'HTTPS_REQUIRED',
  'ALLOWED_HOSTS_EMPTY',
  'NO_PDF_ATTACHMENT',
  'SOURCE_NOT_APPROVED',
]);

export const MAX_TRANSIENT_ATTEMPTS = 3;

/**
 * @param {import('pg').Client} client
 * @param {string} publicationId
 * @param {{ ok: boolean, code?: string, detail?: string }} result
 */
export async function recordCorpusBackfillOutcome(client, publicationId, result) {
  const res = await client.query(`select provenance from regulatory_publications where id = $1`, [publicationId]);
  const prev = res.rows[0]?.provenance || {};
  const corpus = prev.corpusBackfill && typeof prev.corpusBackfill === 'object' ? { ...prev.corpusBackfill } : {};
  const attempts = Number(corpus.attempts || 0) + 1;
  corpus.attempts = attempts;
  corpus.lastAt = new Date().toISOString();
  corpus.lastCode = result.code || (result.ok ? 'SUCCESS' : 'UNKNOWN');
  if (result.ok) {
    corpus.status = 'complete';
    corpus.terminal = false;
  } else if (TERMINAL_CORPUS_CODES.has(result.code || '')) {
    corpus.status = 'terminal';
    corpus.terminal = true;
    corpus.terminalCode = result.code;
    corpus.detail = result.detail?.slice?.(0, 200) || null;
  } else if (attempts >= MAX_TRANSIENT_ATTEMPTS) {
    corpus.status = 'terminal';
    corpus.terminal = true;
    corpus.terminalCode = result.code || 'MAX_ATTEMPTS';
    corpus.detail = result.detail?.slice?.(0, 200) || null;
  } else {
    corpus.status = 'retry';
    corpus.terminal = false;
  }
  const next = { ...prev, corpusBackfill: corpus };
  await client.query(`update regulatory_publications set provenance = $2::jsonb, updated_at = now() where id = $1`, [
    publicationId,
    JSON.stringify(next),
  ]);
}