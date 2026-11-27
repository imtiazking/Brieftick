import { getConnectorForSource } from '../connector-registry.mjs';

/** FCA HTML pilot — snapshot capture scope for 8C.1b */
export const FCA_PUBLICATIONS_SOURCE_ID = 'SRC-FCA-PUBLICATIONS-RSS';

/**
 * Whether this document falls under mandatory HTML snapshot retention (source policy).
 * FCA remains fail-closed; other approved connectors snapshot when HTML evidence was retrieved.
 *
 * @param {{ sourceId?: string, contentType?: string | null, evidenceCapture?: object | null }} doc
 */
export function isSnapshotPolicyEnabled(doc) {
  const ct = String(doc.contentType || doc.evidenceCapture?.contentType || '').toLowerCase();
  const hasHtmlEvidence =
    Boolean(doc.evidenceCapture?.rawBody?.length) &&
    (!ct || ct.includes('html') || ct.includes('xml') || ct.includes('text'));

  if (doc.sourceId === FCA_PUBLICATIONS_SOURCE_ID) {
    if (ct && !ct.includes('html')) return false;
    return true;
  }

  if (!hasHtmlEvidence) return false;
  return Boolean(getConnectorForSource(doc.sourceId));
}

/**
 * @deprecated Use isSnapshotPolicyEnabled — same semantics after 8C.1b hardening.
 * @param {object} doc
 */
export function isSnapshotCaptureRequired(doc) {
  return isSnapshotPolicyEnabled(doc);
}
