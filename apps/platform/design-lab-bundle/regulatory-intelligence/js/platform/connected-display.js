/**
 * Connected-mode rendering helpers — use authoritative `display` fields only.
 */
import { getState } from '../store.js';
import { isConnectedChangeWritesEnabled } from './connected-mode.js';
import { formatDate, formatDateTime, esc } from '../components.js';

export const CONNECTED_UNAVAILABLE = '—';

export function connectedIntakeRowCells(p) {
  const d = p.display;
  if (!d) {
    return null;
  }
  const detected = d.detectedAt ? formatDateTime(d.detectedAt) : CONNECTED_UNAVAILABLE;
  const published = p.publishedDate ? formatDate(p.publishedDate) : CONNECTED_UNAVAILABLE;
  const fixtureNote =
    d.catalogueKind === 'synthetic_fixture'
      ? ' <span class="ri-badge ri-badge--warn" title="data_origin=e2e_fixture">Staging fixture</span>'
      : '';
  return {
    reference: d.reference,
    topic: d.topic,
    classification: d.classification,
    aiRelevance: d.aiRelevance,
    aiPriority: d.aiPriority,
    businessAreas: d.businessAreas,
    triage: d.triage,
    sla: d.sla,
    detected,
    published,
    publicationType: d.publicationType,
    fixtureNote,
    reviewer: CONNECTED_UNAVAILABLE,
  };
}

export function connectedReadOnlyWorkBanner() {
  return `<p class="ri-alert ri-alert--readonly" data-connected-readonly="true">Connected read-only mode — tenant regulatory work is loaded from staging. Status transitions and registrations are disabled until <code>RI_LAB_CONNECTED_WRITES_ENABLED=true</code> is set on the platform server (requires Analyst role or above).</p>`;
}

export function connectedWorkModeBanner(state = getState()) {
  const caps = state.platformConfig?.backendSession?.writeCapabilities || {};
  const parts = [];
  if (caps.changeManagement) parts.push('changes');
  if (caps.impactAssessments) parts.push('impact assessments');
  if (caps.obligations) parts.push('obligations');
  if (caps.risks) parts.push('risks');
  if (caps.controls) parts.push('controls');
  if (caps.evidence) parts.push('evidence');
  if (caps.triage) parts.push('intake triage');
  if (caps.findings) parts.push('findings');
  if (parts.length) {
    return `<p class="ri-alert ri-alert--info" data-connected-writes="true">Connected writes enabled for: ${esc(parts.join(', '))}. Mutations persist via <code>/api/ri-lab/*</code> and workflow audit history.</p>`;
  }
  if (isConnectedChangeWritesEnabled(state)) {
    return `<p class="ri-alert ri-alert--info" data-connected-writes="true">Connected change management writes are enabled for your organisation. Status updates persist via <code>/api/ri-lab/changes</code> and are recorded in workflow audit history.</p>`;
  }
  return connectedReadOnlyWorkBanner();
}

/** Normalised haystack for Publications Library client search (connected + demo). */
export function libraryPublicationSearchText(p) {
  const d = p.display;
  return [
    p.regulator,
    p.title,
    p.reference,
    p.publicationType,
    p.topic,
    p.summary,
    d?.reference,
    d?.topic,
    d?.publicationType,
    p.externalDocumentId,
    p.external_document_id,
    p.designLabRegulatorId,
    p.sourceLabel,
  ]
    .filter(Boolean)
    .join(' ');
}

export function connectedLibraryRowCells(p) {
  const d = p.display;
  if (!d) return null;
  return {
    reference: d.reference,
    topic: d.topic,
    publicationType: d.publicationType,
    published: p.publishedDate ? formatDate(p.publishedDate) : CONNECTED_UNAVAILABLE,
    effective: p.effectiveDate ? formatDate(p.effectiveDate) : CONNECTED_UNAVAILABLE,
    version: d.libraryVersion,
    status: d.libraryStatus,
    fixtureNote:
      d.catalogueKind === 'synthetic_fixture'
        ? ' <span class="ri-badge ri-badge--warn">Fixture</span>'
        : '',
  };
}
