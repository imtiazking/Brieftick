/**
 * Fail-closed validation for mandatory FCA HTML source snapshots.
 * @param {{ contentHash?: string, evidenceCapture?: object | null }} doc
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validateSnapshotEvidence(doc) {
  const ec = doc.evidenceCapture;
  if (!ec) {
    return { ok: false, code: 'snapshot_evidence_missing', message: 'evidenceCapture required' };
  }
  const raw = ec.rawBody;
  const rawLen = Buffer.isBuffer(raw) ? raw.length : raw ? Buffer.byteLength(String(raw)) : 0;
  if (!rawLen) {
    return { ok: false, code: 'snapshot_raw_content_missing', message: 'raw response body empty' };
  }
  if (!doc.contentHash || typeof doc.contentHash !== 'string') {
    return { ok: false, code: 'snapshot_fingerprint_missing', message: 'contentHash required' };
  }
  const fpHash = ec.fingerprint?.hash;
  if (!fpHash || fpHash !== doc.contentHash) {
    return {
      ok: false,
      code: 'snapshot_fingerprint_mismatch',
      message: 'evidence fingerprint must match document contentHash',
    };
  }
  if (!ec.rawSha256 || !ec.normalisedHtmlSha256 || !ec.normalisedTextSha256) {
    return { ok: false, code: 'snapshot_digest_missing', message: 'SHA-256 digests required' };
  }
  if (!String(ec.contentType || '').toLowerCase().includes('html')) {
    return { ok: false, code: 'snapshot_not_html_evidence', message: 'HTML evidence required' };
  }
  return { ok: true };
}
