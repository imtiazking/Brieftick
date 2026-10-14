/**
 * Regulatory ingestion — identity, fingerprints, normalisation, duplicate rules (mock, deterministic).
 */

export const PIPELINE_STAGES = [
  'Detected',
  'Retrieved',
  'Normalised',
  'Version Checked',
  'Parsed',
  'Analysed',
  'Changes Extracted',
  'Ready for Triage',
];

export function mockChecksum(input) {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `CHK-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

export function documentIdentityKey({ sourceId, reference, documentType, externalIdMock }) {
  return [sourceId || '', (reference || '').trim().toUpperCase(), (documentType || '').trim(), externalIdMock || ''].join('|');
}

export function classifyIngestionMatch(existingDoc, incoming) {
  const key = documentIdentityKey(incoming);
  const existingKey = documentIdentityKey({
    sourceId: existingDoc.sourceId,
    reference: existingDoc.documentReference,
    documentType: existingDoc.documentType,
    externalIdMock: existingDoc.externalIdMock,
  });
  if (key !== existingKey) return { type: 'new', reason: 'No matching regulatory document identity' };
  if (existingDoc.contentHash && incoming.contentHash) {
    if (existingDoc.contentHash === incoming.contentHash) {
      return { type: 'exact_duplicate', reason: 'Matching identity and SHA-256 content fingerprint' };
    }
    return {
      type: 'version_update',
      reason: 'Same regulatory document identity with changed SHA-256 fingerprint',
      previousDocumentId: existingDoc.id,
    };
  }
  if (existingDoc.checksumMock && incoming.checksumMock && existingDoc.checksumMock === incoming.checksumMock) {
    return { type: 'exact_duplicate', reason: 'Matching reference and content fingerprint' };
  }
  return {
    type: 'version_update',
    reason: 'Same regulatory document identity with changed content fingerprint',
    previousDocumentId: existingDoc.id,
  };
}

export function normalizeFcaItem(raw) {
  const meta = raw.rawMetadata || {};
  return {
    regulator: 'FCA',
    title: (raw.titleRaw || meta.title || '').trim(),
    reference: (raw.referenceRaw || meta.reference || '').trim(),
    publicationType: mapFcaContentType(raw.contentTypeRaw || meta.contentType),
    publicationDate: raw.publicationDateRaw || meta.publicationDate || null,
    effectiveDate: meta.effectiveDate || null,
    consultationDeadline: meta.consultationDeadline || null,
    jurisdiction: 'United Kingdom',
    topic: meta.topic || 'General',
    sourceUrl: raw.sourceUrlMock,
    language: 'en',
  };
}

export function normalizePraItem(raw) {
  const meta = raw.rawMetadata || {};
  return {
    regulator: 'PRA',
    title: (raw.titleRaw || meta.title || '').trim(),
    reference: (raw.referenceRaw || meta.reference || '').trim(),
    publicationType: mapPraContentType(raw.contentTypeRaw || meta.contentType),
    publicationDate: raw.publicationDateRaw || meta.publicationDate || null,
    effectiveDate: meta.effectiveDate || null,
    consultationDeadline: meta.consultationDeadline || null,
    jurisdiction: 'United Kingdom',
    topic: meta.topic || 'Prudential',
    sourceUrl: raw.sourceUrlMock,
    language: 'en',
  };
}

function mapFcaContentType(raw) {
  const m = {
    policy_statement: 'Policy Statement',
    consultation_paper: 'Consultation Paper',
    finalised_guidance: 'Finalised Guidance',
    letter: 'Letter',
    handbook: 'Handbook Rule',
    news: 'Publication',
  };
  return m[raw] || raw || 'Publication';
}

function mapPraContentType(raw) {
  const m = {
    policy_statement: 'Policy Statement',
    consultation_paper: 'Consultation Paper',
    supervisory_statement: 'Supervisory Statement',
    letter: 'Letter',
    communication: 'Publication',
  };
  return m[raw] || raw || 'Publication';
}

export function normalizeRawItem(raw, source) {
  if (source?.shortName === 'PRA') return normalizePraItem(raw);
  return normalizeFcaItem(raw);
}

export function connectorHealth(connector, source) {
  if (!connector.enabled) return 'Disabled';
  if (connector.healthStatus) return connector.healthStatus;
  if (connector.status === 'Failed' || ((connector.errorsLastRun || 0) > 0 && connector.lastRunStatus === 'Failed')) {
    return 'Failed';
  }
  if ((connector.errorsLastRun || 0) > 0 || connector.lastRunStatus === 'Completed with warnings') return 'Degraded';
  if (connector.executionMode === 'live-verification' && !connector.lastSuccessAt) return 'Not Verified';
  return 'Healthy';
}

export function ingestionMetrics(state) {
  const runs = state.ingestionRuns || [];
  const raw = state.rawSourceItems || [];
  const pubs = state.publications || [];
  const periodStart = '2026-10-01';
  const recentRuns = runs.filter((r) => (r.startedAt || '').slice(0, 10) >= periodStart);
  const detected = recentRuns.reduce((n, r) => n + (r.detectedCount || 0), 0);
  const newCount = recentRuns.reduce((n, r) => n + (r.newCount || 0), 0);
  const updated = recentRuns.reduce((n, r) => n + (r.updatedCount || 0), 0);
  const dup = recentRuns.reduce((n, r) => n + (r.duplicateCount || 0), 0);
  const failed = recentRuns.reduce((n, r) => n + (r.failedCount || 0), 0);
  const awaitingTriage = pubs.filter((p) => ['New', 'AI Analysed', 'Review Required'].includes(p.triageStatus)).length;
  const reanalysis = (state.sourceDocumentCatalog || []).filter((d) => d.reanalysisRequired).length;
  return {
    sourcesMonitored: (state.regulatorySources || []).filter((s) => s.enabled).length,
    connectorHealthy: (state.sourceConnectors || []).filter((c) => connectorHealth(c) === 'Healthy').length,
    publicationsDetected: detected,
    newPublications: newCount,
    updatedPublications: updated,
    duplicatesSuppressed: dup,
    processingFailures: failed,
    awaitingTriage,
    reanalysisRequired: reanalysis,
  };
}
