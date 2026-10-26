/** FCA HTML pilot — snapshot capture scope for 8C.1b */
export const FCA_PUBLICATIONS_SOURCE_ID = 'SRC-FCA-PUBLICATIONS-RSS';

/**
 * Whether this document falls under mandatory HTML snapshot retention (source policy).
 * Independent of whether evidenceCapture was supplied — FCA article ingest is fail-closed.
 *
 * @param {{ sourceId?: string, contentType?: string | null, evidenceCapture?: object | null }} doc
 */
export function isSnapshotPolicyEnabled(doc) {
  if (doc.sourceId !== FCA_PUBLICATIONS_SOURCE_ID) return false;
  const ct = String(doc.contentType || doc.evidenceCapture?.contentType || '').toLowerCase();
  if (ct && !ct.includes('html')) return false;
  return true;
}

/**
 * @deprecated Use isSnapshotPolicyEnabled — same semantics after 8C.1b hardening.
 * @param {object} doc
 */
export function isSnapshotCaptureRequired(doc) {
  return isSnapshotPolicyEnabled(doc);
}
