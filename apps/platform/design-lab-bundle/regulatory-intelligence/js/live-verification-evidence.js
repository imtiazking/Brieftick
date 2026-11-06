/**
 * Persisted live FCA/PRA verification snapshot for Design Lab UI (not runtime polling state).
 * Updated by scripts/interim-live-fca-pra-verification.mjs after each live run.
 */
import { LIVE_VERIFICATION_EVIDENCE } from './live-verification-evidence-data.js';
import { safeExternalLink, sanitizeHref } from './platform/safe-link.js';
import { esc, badge, formatDate, formatDateTime } from './components.js';

export function getLiveVerificationEvidence() {
  return LIVE_VERIFICATION_EVIDENCE;
}

function evidenceBlock(regulatorKey) {
  const ev = getLiveVerificationEvidence();
  if (regulatorKey === 'FCA') return ev?.fca;
  if (regulatorKey === 'PRA') return ev?.pra;
  if (regulatorKey === 'HMT') return ev?.hmt;
  return null;
}

export function isLiveVerified(regulatorKey) {
  const block = evidenceBlock(regulatorKey);
  return block?.connection === 'PASS' && (block?.items?.length || block?.itemsDiscovered) > 0;
}

export function liveVerifiedSummary(regulatorKey) {
  const ev = getLiveVerificationEvidence();
  const block = evidenceBlock(regulatorKey);
  if (!block || block.connection !== 'PASS') {
    return {
      verified: false,
      label: regulatorKey === 'HMT' ? 'Not live verified' : 'Not live verified',
      lastVerifiedAt: null,
      detected: 0,
      health: block?.connection === 'FAIL' ? 'Verification Failed' : 'Not Verified',
      connection: block?.connection || null,
    };
  }
  return {
    verified: true,
    label: 'LIVE VERIFIED',
    lastVerifiedAt: block.lastVerifiedAt || ev.completedAt,
    detected: block.items?.length ?? block.itemsDiscovered ?? 0,
    health: block.connectorHealth || 'Healthy',
    connection: block.connection,
    authorityType: block.authorityType || (regulatorKey === 'HMT' ? 'Government / Policy' : null),
    sourceRole: block.sourceRole || (regulatorKey === 'HMT' ? 'Horizon Scanning' : null),
    sourceTrust: block.sourceTrust || (regulatorKey === 'HMT' ? 'Official Government Source' : null),
  };
}

export function renderLiveVerificationBadge(verified) {
  if (verified) return `<span class="ri-badge ri-badge--ok" title="Real network verification completed">LIVE VERIFIED</span>`;
  return `<span class="ri-badge ri-badge--muted" title="Fixture/demo only">Fixture / Demo</span>`;
}

export function renderOfficialSourceLink(url, label = 'View official source') {
  const safe = sanitizeHref(url);
  if (!safe || safe === '#') return `<span class="ri-muted">Official URL unavailable</span>`;
  return `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
}

export function renderLiveItemDetail(item, sectionLabel) {
  if (!item) return '';
  return `
    <article class="ri-panel ri-live-item">
      <p class="ri-live-banner"><strong>LIVE SOURCE VERIFICATION</strong> · ${esc(sectionLabel)}</p>
      <h3>${esc(item.title)}</h3>
      <dl class="ri-dl ri-dl--compact">
        <dt>Authority</dt><dd>${esc(item.authority || item.regulator || '—')}</dd>
        ${item.authorityType ? `<dt>Authority type</dt><dd>${esc(item.authorityType)}</dd>` : ''}
        ${item.sourceRole ? `<dt>Source role</dt><dd>${esc(item.sourceRole)}</dd>` : ''}
        ${item.relevanceReason ? `<dt>Relevance</dt><dd>${esc(item.relevanceStatus)} — ${esc(item.relevanceReason)}</dd>` : ''}
        ${item.matchedSignals?.length ? `<dt>Matched signals</dt><dd>${esc(item.matchedSignals.join(', '))}</dd>` : ''}
        <dt>Publication date</dt><dd>${item.publicationDate ? formatDate(item.publicationDate) : '—'}</dd>
        <dt>Type</dt><dd>${esc(item.publicationType || '—')}</dd>
        <dt>Official URL</dt><dd>${renderOfficialSourceLink(item.canonicalUrl)}</dd>
        <dt>Retrieved</dt><dd>${item.retrievedAt ? formatDateTime(item.retrievedAt) : '—'}</dd>
        <dt>Feed / discovery</dt><dd class="ri-mono">${esc(item.discoveryFeedUrl || '—')}</dd>
        <dt>dataOrigin</dt><dd>${esc(item.dataOrigin)}</dd>
        <dt>Source trust</dt><dd>${esc(item.sourceTrust)}</dd>
        <dt>Connector</dt><dd>${esc(item.connectorVersion || '—')}</dd>
        <dt>Parser</dt><dd>${esc(item.parserVersion || '—')}</dd>
        <dt>Content-Type</dt><dd>${esc(item.httpContentType || '—')}</dd>
        <dt>Fingerprint</dt><dd>${item.contentHash ? `${esc(item.fingerprintAlgorithm)} · <span class="ri-mono">${esc(item.contentHash.slice(0, 16))}…</span>` : '—'}</dd>
        <dt>External ID</dt><dd>${esc(item.externalId || '—')}</dd>
        <dt>Provenance</dt><dd>${esc(item.provenanceStatus || 'Staged')}</dd>
      </dl>
      <p class="ri-muted">${item.contentExtractStored
        ? esc(item.contentExtractPreview)
        : 'Source content was retrieved during verification but the full body was not retained in the Design Lab evidence snapshot.'}</p>
      <p>${renderOfficialSourceLink(item.canonicalUrl, 'View official source')}</p>
    </article>`;
}
