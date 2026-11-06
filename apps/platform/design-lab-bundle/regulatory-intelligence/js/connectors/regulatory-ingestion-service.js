/**
 * Connector orchestration — discovery → retrieval → identity → persistence (Design Lab).
 */
import { getConnectorById, resolveConnectorMode, liveVerificationAllowed } from './connector-registry.js';
import { CONNECTOR_MODES } from './connector-base.js';
import { buildDocumentIdentity } from './document-identity.js';
import { fingerprintContent } from './fingerprint.js';
import { classifyIngestionMatch, normalizeRawItem } from '../ingestion-helpers.js';
import { isPublicationWorthy } from './publication-types.js';
import { beginCorrelation } from '../platform/platform-correlation.js';
import { PARSER_VERSION } from './document-parser.js';
import { DEMO_TODAY } from '../workflow-helpers.js';

export async function runConnectorIngestion(state, { connectorId, triggeredBy, scenario, limit, modeOverride, liveImport = false }) {
  const connectorRec = state.sourceConnectors?.find((c) => c.id === connectorId);
  if (!connectorRec || !connectorRec.enabled) return { ok: false, error: 'Connector disabled or missing' };

  const connector = getConnectorById(connectorId);
  if (!connector) return { ok: false, error: 'Connector implementation missing' };

  const mode = modeOverride || resolveConnectorMode(state.platformConfig, connectorRec);
  const correlationId = beginCorrelation('ING');
  const liveAllowed = liveVerificationAllowed(state.platformConfig) && mode === CONNECTOR_MODES.LIVE_VERIFICATION;

  const run = createRun(state, connectorRec, triggeredBy, mode);
  state.ingestionRuns.unshift(run);

  const discover = await connector.discover({
    mode,
    liveAllowed,
    limit: limit || (mode === CONNECTOR_MODES.LIVE_VERIFICATION ? 3 : 10),
    scenario,
    checkpoint: connectorRec.checkpoint,
    correlationId,
    lookbackDays: connectorRec.lookbackDays || 7,
  });

  if (!discover.ok) {
    finalizeRun(run, connectorRec, 'Failed', discover);
    return { ok: false, error: discover.message, code: discover.code, runId: run.id };
  }

  run.detectedCount = discover.items.length;
  const itemResults = [];
  for (const item of discover.items) {
    const r = await processDiscoveryItem(state, {
      connector,
      connectorRec,
      discoveryItem: item,
      run,
      mode,
      liveAllowed,
      correlationId,
      promotePublication: liveImport || mode === CONNECTOR_MODES.FIXTURE,
    });
    itemResults.push(r);
  }

  const failed = itemResults.filter((x) => x.status === 'failed').length;
  const dup = itemResults.filter((x) => x.status === 'duplicate').length;
  const updated = itemResults.filter((x) => x.status === 'version_update').length;
  const newCount = itemResults.filter((x) => x.status === 'new').length;
  run.duplicateCount = dup;
  run.updatedCount = updated;
  run.newCount = newCount;
  run.failedCount = failed;
  run.status = failed && failed === itemResults.length ? 'Failed' : failed ? 'Completed with warnings' : 'Completed';
  run.completedAt = new Date().toISOString();
  if (discover.checkpoint) {
    run.checkpointAfter = JSON.stringify(discover.checkpoint).slice(0, 120);
    connectorRec.checkpoint = run.checkpointAfter;
  }
  connectorRec.lastRunAt = run.completedAt;
  connectorRec.lastRunStatus = run.status;
  connectorRec.documentsDetectedLastRun = run.detectedCount;
  connectorRec.errorsLastRun = failed;
  if (run.status === 'Completed' || run.status === 'Completed with warnings') {
    connectorRec.lastSuccessfulRunAt = run.completedAt;
    connectorRec.lastSuccessAt = run.completedAt;
  }
  connectorRec.healthStatus = deriveConnectorHealth(connectorRec, run);
  connectorRec.parserVersion = connector.parserVersion;
  connectorRec.connectorVersion = connector.connectorVersion;

  const src = state.regulatorySources?.find((s) => s.id === connectorRec.sourceId);
  if (src) {
    src.lastSuccessfulCheck = run.completedAt;
    src.lastCheckStatus = run.status;
  }
  return { ok: true, runId: run.id, results: itemResults };
}

export async function processDiscoveryItem(state, ctx) {
  const { discoveryItem, connector, connectorRec, run, mode, correlationId, promotePublication } = ctx;
  if (!isPublicationWorthy(discoveryItem.publicationType) && mode !== CONNECTOR_MODES.FIXTURE) {
    return { status: 'skipped', reason: 'not publication-worthy' };
  }

  const identity = buildDocumentIdentity({
    sourceId: connectorRec.sourceId,
    reference: discoveryItem.reference,
    canonicalUrl: discoveryItem.canonicalUrl,
    externalSourceId: discoveryItem.externalSourceId,
    publicationType: discoveryItem.publicationType,
  });

  const retrieved = await connector.retrieve(discoveryItem, {
    mode,
    liveAllowed: ctx.liveAllowed,
    correlationId,
  });
  if (!retrieved.ok) {
    recordException(state, discoveryItem, retrieved, run.id);
    return { status: 'failed', code: retrieved.code };
  }

  if (retrieved.parsed && retrieved.parsed.ok === false) {
    connectorRec.lastWarning = retrieved.parsed.message;
    connectorRec.healthStatus = 'Degraded';
    recordException(state, discoveryItem, retrieved.parsed, run.id);
    return { status: 'failed', code: retrieved.parsed.code };
  }

  const bodyForHash = retrieved.bodyText || (retrieved.body ? new TextDecoder().decode(retrieved.body) : '');
  const fp = retrieved.fingerprint || (await fingerprintContent(bodyForHash));

  const existingRaw = findRawByIdentity(state, identity.key);
  const rawId = existingRaw?.id || nextId(state, 'RAW-LIVE', 'rawSourceItems');
  const raw = existingRaw || {
    id: rawId,
    sourceId: connectorRec.sourceId,
    connectorId: connectorRec.id,
    ingestionRunId: run.id,
    titleRaw: discoveryItem.title,
    referenceRaw: discoveryItem.reference,
    publicationDateRaw: discoveryItem.publishedAt,
    contentTypeRaw: discoveryItem.publicationType,
    sourceUrlMock: discoveryItem.canonicalUrl,
    externalIdMock: discoveryItem.externalSourceId,
    checksumMock: fp.checksumMock,
    contentHash: fp.hash,
    fingerprintAlgorithm: fp.algorithm,
    identityKey: identity.key,
    processingStatus: 'Detected',
    retrievalStatus: 'Pending',
    dataOrigin: discoveryItem.dataOrigin || mode,
    sourceTrust: discoveryItem.sourceTrust,
    untrustedContentTag: 'UNTRUSTED_SOURCE_CONTENT',
    correlationId,
    discoveredAt: discoveryItem.discoveredAt,
    lastSeenAt: discoveryItem.discoveredAt,
  };
  if (discoveryItem.relevanceStatus) {
    raw.relevanceStatus = discoveryItem.relevanceStatus;
    raw.relevanceReason = discoveryItem.relevanceReason;
    raw.matchedSignals = discoveryItem.matchedSignals || [];
  }
  if (discoveryItem.sourceMetadata?.authorityType) {
    raw.authorityType = discoveryItem.sourceMetadata.authorityType;
    raw.sourceRole = discoveryItem.sourceMetadata.sourceRole;
    raw.authority = discoveryItem.sourceMetadata.authority || 'HM Treasury';
  }
  if (!existingRaw) state.rawSourceItems.unshift(raw);
  raw.retrievalStatus = 'Retrieved';
  raw.processingStatus = 'Retrieved';

  const artifactId = nextId(state, 'ART', 'sourceArtifacts');
  if (!state.sourceArtifacts) state.sourceArtifacts = [];
  state.sourceArtifacts.push({
    id: artifactId,
    rawSourceItemId: raw.id,
    url: discoveryItem.canonicalUrl,
    mediaType: retrieved.mediaType,
    retrievedAt: new Date().toISOString(),
    checksum: fp.hash,
    sizeBytes: bodyForHash.length,
    storageMode: retrieved.storageMode || 'metadata-only',
    fixturePath: retrieved.fixturePath || null,
    retrievalStatus: 'Retrieved',
    correlationId,
  });
  raw.latestArtifactId = artifactId;
  raw.lastFingerprintHash = fp.hash;

  const source = state.regulatorySources.find((s) => s.id === connectorRec.sourceId);
  const norm = normalizeRawItem(raw, source);
  raw.normalized = norm;
  raw.processingStatus = 'Normalised';

  const matchInput = {
    sourceId: connectorRec.sourceId,
    reference: norm.reference,
    documentType: norm.publicationType,
    externalIdMock: raw.externalIdMock,
    checksumMock: fp.checksumMock,
    contentHash: fp.hash,
  };
  const existingDoc = (state.sourceDocumentCatalog || []).find(
    (d) => d.isCurrentVersion && documentIdentityKey(d) === identity.key
  );
  const match = existingDoc
    ? classifyIngestionMatch(existingDoc, matchInput)
    : { type: 'new' };

  if (match.type === 'exact_duplicate') {
    raw.processingStatus = 'Duplicate';
    raw.duplicateClassification = 'Exact Duplicate';
    raw.lastSeenAt = new Date().toISOString();
    run.duplicateCount = (run.duplicateCount || 0) + 1;
    return { status: 'duplicate', rawId: raw.id };
  }

  if (match.type === 'version_update') {
    return handleVersionUpdate(state, { raw, norm, existingDoc, match, fp, connectorRec, run, promotePublication });
  }

  if (!promotePublication) {
    if (!state.liveVerificationStaging) state.liveVerificationStaging = [];
    state.liveVerificationStaging.unshift({ rawId: raw.id, discoveryItem, at: new Date().toISOString() });
    raw.processingStatus = 'Ready for Import';
    return { status: 'staged', rawId: raw.id };
  }

  return promoteToDocument(state, { raw, norm, fp, connectorRec, run, parsed: retrieved.parsed });
}

function handleVersionUpdate(state, ctx) {
  const { existingDoc, raw, norm, fp, connectorRec, run, promotePublication } = ctx;
  existingDoc.isCurrentVersion = false;
  existingDoc.superseded = true;
  const newVersion = (existingDoc.documentVersion || 1) + 1;
  const docId = nextId(state, 'DOC-VER', 'sourceDocumentCatalog');
  const doc = buildSourceDocument(docId, ctx.raw, norm, fp, connectorRec, run, {
    documentVersion: newVersion,
    previousVersionId: existingDoc.id,
    reanalysisRequired: true,
    versionChangeSummary: { checksumChanged: true, previousChecksum: existingDoc.contentHash || existingDoc.checksumMock },
  });
  state.sourceDocumentCatalog.push(doc);
  raw.linkedSourceDocumentId = docId;
  raw.processingStatus = 'Version Update';
  raw.versionDiffSummary = doc.versionChangeSummary;
  markPublicationReanalysis(state, existingDoc.publicationId);
  triggerAssuranceStaleness(state, existingDoc.publicationId);
  run.updatedCount = (run.updatedCount || 0) + 1;
  return { status: 'version_update', rawId: raw.id, documentId: docId };
}

function promoteToDocument(state, { raw, norm, fp, connectorRec, run, parsed }) {
  const docId = nextId(state, 'DOC-ING', 'sourceDocumentCatalog');
  const doc = buildSourceDocument(docId, raw, norm, fp, connectorRec, run, { parsed });
  state.sourceDocumentCatalog.push(doc);
  raw.linkedSourceDocumentId = docId;
  raw.processingStatus = 'Parsed';

  if (parsed?.ok) {
    const sections = buildSectionsFromParse(parsed, docId, null);
    sections.forEach((s) => state.sourceSections.push(s));
    doc.sectionCount = sections.length;
  }
  run.newCount = (run.newCount || 0) + 1;
  return { status: 'new', rawId: raw.id, documentId: docId };
}

function buildSourceDocument(docId, raw, norm, fp, connectorRec, run, extra = {}) {
  return {
    id: docId,
    sourceId: raw.sourceId,
    rawSourceItemId: raw.id,
    title: norm.title,
    documentReference: norm.reference,
    documentType: norm.publicationType,
    externalIdMock: raw.externalIdMock,
    sourceUrlMock: norm.sourceUrl,
    retrievedAt: new Date().toISOString(),
    publishedAt: norm.publicationDate,
    checksumMock: fp.checksumMock,
    contentHash: fp.hash,
    fingerprintAlgorithm: fp.algorithm,
    documentVersion: extra.documentVersion || 1,
    previousVersionId: extra.previousVersionId || null,
    isCurrentVersion: true,
    superseded: false,
    processingStatus: 'Parsed',
    parserVersion: PARSER_VERSION,
    connectorVersion: connectorRec.connectorVersion,
    textExtractionStatus: extra.parsed?.parseQuality || 'Complete',
    reanalysisRequired: extra.reanalysisRequired || false,
    versionChangeSummary: extra.versionChangeSummary || null,
    dataOrigin: raw.dataOrigin,
    sourceTrust: raw.sourceTrust,
    provenance: {
      connectorId: connectorRec.id,
      ingestionRunId: run.id,
      discoveryMethod: raw.normalized?.discoveryMethod,
      untrustedContentTag: 'UNTRUSTED_SOURCE_CONTENT',
      liveOrFixture: raw.dataOrigin,
    },
    ...extra,
  };
}

function buildSectionsFromParse(parsed, documentId, publicationId) {
  return (parsed.sections || []).map((sec, i) => ({
    id: `SRCSEC-${documentId}-${i + 1}`,
    documentId,
    publicationId,
    heading: sec.heading,
    sectionNumber: sec.sectionNumber,
    citation: sec.citationLabel || (sec.sectionNumber ? `§${sec.sectionNumber}` : `§${i + 1}`),
    citationSlug: sec.sectionNumber || String(i + 1),
    text: (sec.paragraphs || []).join('\n\n'),
    order: sec.ordinal || i + 1,
    untrustedContentTag: 'UNTRUSTED_SOURCE_CONTENT',
  }));
}

function documentIdentityKey(doc) {
  return buildDocumentIdentity({
    sourceId: doc.sourceId,
    reference: doc.documentReference,
    canonicalUrl: doc.sourceUrlMock,
    externalSourceId: doc.externalIdMock,
    publicationType: doc.documentType,
  }).key;
}

function findRawByIdentity(state, key) {
  return (state.rawSourceItems || []).find((r) => r.identityKey === key);
}

function nextId(state, prefix, collection) {
  const n = (state._idSeq = (state._idSeq || 0) + 1);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

function createRun(state, connectorRec, triggeredBy, mode) {
  const n = (state.mockIngestionRunCounter = (state.mockIngestionRunCounter || 0) + 1);
  return {
    id: `RUN-${DEMO_TODAY}-${mode.slice(0, 3)}${String(n).padStart(2, '0')}`,
    connectorId: connectorRec.id,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'Running',
    detectedCount: 0,
    newCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    connectorMode: mode,
    triggeredBy,
  };
}

function finalizeRun(run, connectorRec, status, err) {
  run.status = status;
  run.completedAt = new Date().toISOString();
  run.errorSummary = err?.message || null;
  connectorRec.lastRunStatus = status;
  connectorRec.healthStatus = 'Failed';
}

function recordException(state, item, err, runId) {
  if (!state.ingestionExceptions) state.ingestionExceptions = [];
  state.ingestionExceptions.unshift({
    id: `EXC-${Date.now()}`,
    severity: 'Error',
    type: err.code || 'INGESTION_ERROR',
    message: err.message,
    rawSourceItemId: item.externalSourceId,
    timestamp: new Date().toISOString(),
    ingestionRunId: runId,
  });
}

function deriveConnectorHealth(connectorRec, run) {
  if (!connectorRec.enabled) return 'Disabled';
  if (run.status === 'Failed') return 'Failed';
  if (connectorRec.lastWarning || run.status === 'Completed with warnings') return 'Degraded';
  if (connectorRec.executionMode === 'live-verification' && !connectorRec.lastSuccessAt) return 'Not Verified';
  return 'Healthy';
}

function markPublicationReanalysis(state, publicationId) {
  if (!publicationId) return;
  const pub = state.publications?.find((p) => p.id === publicationId);
  if (pub) pub.reanalysisRequired = true;
}

function triggerAssuranceStaleness(state, publicationId) {
  const ch = state.changes?.find((c) => c.publicationId === publicationId);
  if (ch?.id && state.markAssuranceStaleForChange) return;
}

export function clearLiveVerificationData(state) {
  state.liveVerificationStaging = [];
  state.rawSourceItems = (state.rawSourceItems || []).filter((r) => r.dataOrigin !== 'live-verification');
  state.sourceArtifacts = (state.sourceArtifacts || []).filter((a) => {
    const raw = state.rawSourceItems.find((r) => r.id === a.rawSourceItemId);
    return raw;
  });
}

export async function importStagedLiveItem(state, rawId) {
  const raw = state.rawSourceItems?.find((r) => r.id === rawId);
  if (!raw || raw.dataOrigin !== 'live-verification') return { ok: false, error: 'Not a staged live item' };
  return await processDiscoveryItem(state, {
    connector: getConnectorById(raw.connectorId),
    connectorRec: state.sourceConnectors.find((c) => c.id === raw.connectorId),
    discoveryItem: {
      title: raw.titleRaw,
      reference: raw.referenceRaw,
      canonicalUrl: raw.sourceUrlMock,
      externalSourceId: raw.externalIdMock,
      publicationType: raw.contentTypeRaw,
      publishedAt: raw.publicationDateRaw,
      dataOrigin: 'live-verification',
    },
    run: { id: raw.ingestionRunId, newCount: 0, updatedCount: 0, duplicateCount: 0 },
    mode: CONNECTOR_MODES.LIVE_VERIFICATION,
    liveAllowed: true,
    correlationId: raw.correlationId,
    promotePublication: true,
    forceRetrieve: true,
  });
}
