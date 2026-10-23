import { getState } from './store.js';
import { routeForRecord } from './relationships.js';

export function getRegulatorySource(id) {
  return getState().regulatorySources?.find((s) => s.id === id);
}

export function getConnector(id) {
  return getState().sourceConnectors?.find((c) => c.id === id);
}

export function getIngestionRun(id) {
  return getState().ingestionRuns?.find((r) => r.id === id);
}

export function getRawSourceItem(id) {
  return getState().rawSourceItems?.find((r) => r.id === id);
}

export function getSourceDocument(id) {
  return getState().sourceDocumentCatalog?.find((d) => d.id === id);
}

export function getSourceSection(id) {
  return getState().sourceSections?.find((s) => s.id === id);
}

export function getChangeCandidate(id) {
  return getState().changeCandidates?.find((c) => c.id === id);
}

export function getDocumentsForPublication(pubId) {
  return (getState().sourceDocumentCatalog || []).filter((d) => d.publicationId === pubId);
}

export function getSectionsForDocument(docId) {
  return (getState().sourceSections || []).filter((s) => s.documentId === docId).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getRawItemsForRun(runId) {
  return (getState().rawSourceItems || []).filter((r) => r.ingestionRunId === runId);
}

export function getCandidatesForPublication(pubId) {
  return (getState().changeCandidates || []).filter((c) => c.publicationId === pubId);
}

export function provenanceChainForChange(changeId) {
  const s = getState();
  const ch = s.changes.find((c) => c.id === changeId);
  if (!ch) return [];
  const pub = s.publications.find((p) => p.id === ch.publicationId);
  const section = ch.sourceSectionId ? getSourceSection(ch.sourceSectionId) : null;
  const doc = section ? getSourceDocument(section.documentId) : pub?.sourceDocumentId ? getSourceDocument(pub.sourceDocumentId) : null;
  const raw = doc ? getRawSourceItem(doc.rawSourceItemId) : pub?.ingestionProvenance?.rawSourceItemId ? getRawSourceItem(pub.ingestionProvenance.rawSourceItemId) : null;
  const run = raw?.ingestionRunId ? getIngestionRun(raw.ingestionRunId) : null;
  const connector = run ? getConnector(run.connectorId) : pub?.ingestionProvenance?.connectorId ? getConnector(pub.ingestionProvenance.connectorId) : null;
  const source = connector ? getRegulatorySource(connector.sourceId) : null;
  const chain = [];
  if (source) chain.push({ type: 'Regulatory Source', id: source.id, label: source.name, href: '#/admin/sources' });
  if (connector) chain.push({ type: 'Connector', id: connector.id, label: connector.name, href: '#/admin/sources' });
  if (run) chain.push({ type: 'Ingestion Run', id: run.id, label: run.id, href: `#/ingestion/run/${run.id}` });
  if (raw) chain.push({ type: 'Raw Source Item', id: raw.id, label: raw.referenceRaw || raw.id, href: `#/ingestion/item/${raw.id}` });
  if (doc) chain.push({ type: 'Source Document', id: doc.id, label: `${doc.documentReference} v${doc.documentVersion}`, href: `#/source-document/${doc.id}` });
  if (section) chain.push({ type: 'Source Section', id: section.id, label: section.citation, href: `#/publication/${ch.publicationId}/source/${section.citationSlug}` });
  if (pub) chain.push({ type: 'Publication', id: pub.id, label: pub.title, href: routeForRecord('Publication', pub.id) });
  chain.push({ type: 'Regulatory Change', id: ch.id, label: ch.title, href: routeForRecord('Regulatory Change', ch.id) });
  return chain;
}

export function renderProvenanceList(chain) {
  if (!chain?.length) return '<p class="ri-muted">No ingestion provenance linked.</p>';
  return `<ol class="ri-provenance">${chain
    .map((l) => `<li><span class="ri-muted">${l.type}</span> <a href="${l.href}">${l.label}</a> <code>${l.id}</code></li>`)
    .join('')}</ol>`;
}
