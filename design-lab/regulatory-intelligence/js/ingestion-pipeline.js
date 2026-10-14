/**
 * Deterministic mock ingestion processing (no external network).
 */
import {
  mockChecksum,
  normalizeRawItem,
  classifyIngestionMatch,
  connectorHealth,
} from './ingestion-helpers.js';
import { syncLegacySourceDocuments } from './ingestion-seed.js';
import { DEMO_TODAY } from './workflow-helpers.js';

export function runMockIngestion(state, triggeredBy = 'Manual mock run') {
  state.mockIngestionRunCounter = (state.mockIngestionRunCounter || 0) + 1;
  const runSeq = state.mockIngestionRunCounter;
  const connector = state.sourceConnectors.find((c) => c.id === 'CONN-FCA-001' && c.enabled);
  if (!connector) {
    return { ok: false, error: 'FCA connector is disabled' };
  }

  const runId = `RUN-${DEMO_TODAY}-M${String(runSeq).padStart(2, '0')}`;
  const started = `${DEMO_TODAY}T12:00:00Z`;
  const run = {
    id: runId,
    connectorId: connector.id,
    startedAt: started,
    completedAt: null,
    status: 'Running',
    detectedCount: 0,
    newCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    checkpointBefore: connector.checkpoint,
    checkpointAfter: connector.checkpoint,
    errorSummary: null,
    triggeredBy,
  };
  state.ingestionRuns.unshift(run);
  pushIngestAudit(state, started, 'Connector run started', 'Ingestion Run', runId, null, 'Running', triggeredBy);

  const pendingId = state.mockIngestionPendingRawId || 'RAW-ING-PENDING-001';
  const pending = state.rawSourceItems.find((r) => r.id === pendingId);
  if (pending && pending.processingStatus === 'Detected') {
    processPendingNewItem(state, pending, run, connector);
  } else {
    run.detectedCount = 0;
    run.status = 'Completed';
    run.completedAt = `${DEMO_TODAY}T12:05:00Z`;
    connector.lastRunAt = run.completedAt;
    connector.lastRunStatus = 'Completed';
    connector.documentsDetectedLastRun = 0;
    pushIngestAudit(state, run.completedAt, 'Connector run completed', 'Ingestion Run', runId, 'Running', 'Completed', 'No new items in mock queue');
  }

  const src = state.regulatorySources.find((s) => s.id === connector.sourceId);
  if (src) {
    src.lastSuccessfulCheck = run.completedAt || started;
    src.lastCheckStatus = run.status;
  }
  syncLegacySourceDocuments(state);
  return { ok: true, runId };
}

function processPendingNewItem(state, raw, run, connector) {
  run.detectedCount = 1;
  const source = state.regulatorySources.find((s) => s.id === raw.sourceId);
  const norm = normalizeRawItem(raw, source);
  raw.retrievalStatus = 'Retrieved';
  raw.processingStatus = 'Retrieved';
  raw.ingestionRunId = run.id;
  pushIngestAudit(state, `${DEMO_TODAY}T12:01:00Z`, 'Source item detected', 'Raw Source Item', raw.id, null, 'Detected', norm.reference);

  raw.processingStatus = 'Normalised';
  const pubId = 'PUB-019';
  let pub = state.publications.find((p) => p.id === pubId);
  if (!pub) {
    pub = {
      id: pubId,
      scenario: 'op-resilience',
      regulator: norm.regulator,
      title: norm.title,
      reference: norm.reference,
      publicationType: norm.publicationType,
      topic: norm.topic,
      publishedDate: norm.publicationDate,
      effectiveDate: norm.effectiveDate,
      consultationDeadline: norm.consultationDeadline,
      priority: 'High',
      aiClassification: 'Likely Applicable',
      workflowStatus: 'New',
      applicabilityDecision: 'Not Assessed',
      applicabilityConfidence: 0,
      unreviewed: true,
      triageStatus: 'AI Analysed',
      detectedAt: DEMO_TODAY,
      triageSlaDue: '2026-10-14',
      aiPriority: 'High',
      aiRelevanceScore: 82,
      intakeAccepted: false,
      changeIds: [],
    };
    state.publications.push(pub);
    run.newCount = 1;
  }

  const docId = 'DOC-FCA-FG27-3-V1';
  const doc = {
    id: docId,
    sourceId: raw.sourceId,
    rawSourceItemId: raw.id,
    publicationId: pubId,
    title: norm.title,
    documentReference: norm.reference,
    documentType: norm.publicationType,
    externalIdMock: raw.externalIdMock,
    sourceUrlMock: raw.sourceUrlMock,
    retrievedAt: `${DEMO_TODAY}T12:02:00Z`,
    publishedAt: norm.publicationDate,
    effectiveDate: norm.effectiveDate,
    consultationDeadline: norm.consultationDeadline,
    mimeTypeMock: 'application/pdf',
    language: 'en',
    checksumMock: raw.checksumMock,
    documentVersion: 1,
    previousVersionId: null,
    supersedesDocumentId: null,
    isCurrentVersion: true,
    superseded: false,
    processingStatus: 'Ready for Triage',
    pipelineStage: 'Ready for Triage',
    parserVersion: 'MOCK-PARSER-1.2',
    textExtractionStatus: 'Complete',
    pageCountMock: 18,
    sectionCount: 1,
    paragraphCount: 4,
    extractionWarnings: [],
    reanalysisRequired: false,
    provenance: { connectorId: connector.id, ingestionRunId: run.id },
  };
  state.sourceDocumentCatalog.push(doc);

  const secId = 'SRCSEC-PENDING-001';
  state.sourceSections.push({
    id: secId,
    documentId: docId,
    publicationId: pubId,
    heading: '2.1 Customer communications (mock)',
    sectionNumber: '2.1',
    citation: 'FG27/3 §2.1',
    citationSlug: '2.1',
    text: 'DEMO: Firms should communicate clearly with customers during operational incidents.',
    pageMock: 4,
    order: 1,
  });

  raw.linkedSourceDocumentId = docId;
  raw.linkedPublicationId = pubId;
  raw.processingStatus = 'Published to Intake';
  pub.sourceDocumentId = docId;
  pub.sourceDocumentIds = [docId];
  pub.ingestionProvenance = {
    sourceId: raw.sourceId,
    connectorId: raw.connectorId,
    rawSourceItemId: raw.id,
    ingestionRunId: run.id,
  };

  const cand = state.changeCandidates.find((c) => c.id === 'CC-ING-001');
  if (cand) {
    cand.publicationId = pubId;
    cand.status = 'Review Required';
    cand.sourceSectionIds = [secId];
  }

  if (!state.publicationAnalysis) state.publicationAnalysis = {};
  state.publicationAnalysis[pubId] = {
    whatChanged: 'DEMO: Mock finalised guidance on operational incident customer communications.',
    whyItMatters: 'DEMO: Payments and digital channels may need updated communications playbooks.',
    confidence: 78,
    reasoning: cand?.reasoning || 'DEMO: Operational resilience communications expectations.',
    citation: 'FG27/3 §2.1',
    citationSection: '2.1',
    sourceSectionId: secId,
  };

  pushIngestAudit(state, `${DEMO_TODAY}T12:03:00Z`, 'Document parsed', 'Source Document', docId, null, 'Parsed', 'MOCK-PARSER-1.2');
  pushIngestAudit(state, `${DEMO_TODAY}T12:04:00Z`, 'AI analysis generated', 'Publication', pubId, null, 'Complete', 'Publication-level analysis');
  pushIngestAudit(state, `${DEMO_TODAY}T12:04:30Z`, 'Candidate changes generated', 'Publication', pubId, null, '1 candidate', 'CC-ING-001');

  run.status = 'Completed';
  run.completedAt = `${DEMO_TODAY}T12:05:00Z`;
  run.checkpointAfter = 'fca-fg27-3';
  connector.checkpoint = 'fca-fg27-3';
  connector.lastRunAt = run.completedAt;
  connector.lastSuccessfulRunAt = run.completedAt;
  connector.lastRunStatus = 'Completed';
  connector.documentsDetectedLastRun = 1;
  connector.errorsLastRun = 0;
  pushIngestAudit(state, run.completedAt, 'Connector run completed', 'Ingestion Run', run.id, 'Running', 'Completed', `New publication ${pubId}`);
}

export function retryRawItemProcessing(state, rawId, userName) {
  const raw = state.rawSourceItems.find((r) => r.id === rawId);
  if (!raw || !raw.retryEligible) return { ok: false };
  const prev = raw.processingStatus;
  pushIngestAudit(state, new Date().toISOString(), 'Retry processing', 'Raw Source Item', rawId, prev, 'Retrying', userName);

  raw.retrievalStatus = 'Retrieved';
  raw.checksumMock = mockChecksum('FG26/99-recovered-mock');
  raw.processingStatus = 'Duplicate';
  raw.duplicateClassification = 'Exact Duplicate';
  raw.duplicateReason = 'Recovered document matches archived mock reference — suppressed';
  raw.failureReason = null;
  pushIngestAudit(state, new Date().toISOString(), 'Retry completed', 'Raw Source Item', rawId, 'Failed', 'Duplicate', 'No Publication created');
  return { ok: true };
}

export function acceptChangeCandidate(state, candidateId, userName, modifications = null) {
  const cand = state.changeCandidates.find((c) => c.id === candidateId);
  if (!cand || !cand.publicationId) return { ok: false };
  const pub = state.publications.find((p) => p.id === cand.publicationId);
  if (!pub) return { ok: false };

  const changeId = `CHG-ING-${candidateId.split('-').pop()}`;
  let ch = state.changes.find((c) => c.id === changeId);
  const title = modifications?.title || cand.proposedTitle;
  const description = modifications?.description || cand.proposedDescription;
  if (!ch) {
    ch = {
      id: changeId,
      publicationId: cand.publicationId,
      scenario: pub.scenario,
      title,
      description,
      summary: description,
      sourceCitation: 'FG27/3 §2.1',
      sourceSection: '2.1',
      sourceSectionId: cand.sourceSectionIds?.[0] || 'SRCSEC-PENDING-001',
      topic: cand.topic,
      materiality: cand.materialityRecommendation,
      effectiveDate: pub.effectiveDate,
      status: 'New',
      applicabilityRecommendation: cand.applicabilityRecommendation,
      applicabilityConfidence: cand.confidence,
      applicabilityDecision: 'Review Required',
      applicabilityReasoning: cand.reasoning,
      aiGovernance: {
        humanReviewStatus: modifications ? 'Human modified' : 'Human accepted',
        humanDecision: cand.applicabilityRecommendation,
        justification: modifications?.justification || 'Accepted from ingestion candidate review',
      },
      decisionMeta: {
        user: userName,
        at: new Date().toISOString(),
        justification: modifications?.justification || 'Accepted AI-generated candidate',
      },
      fromIngestionCandidateId: candidateId,
    };
    state.changes.push(ch);
    pub.changeIds = [...(pub.changeIds || []), changeId];
  }
  cand.status = modifications ? 'Modified' : 'Accepted';
  cand.reviewedBy = userName;
  cand.reviewedAt = new Date().toISOString();
  cand.acceptedChangeId = changeId;
  pushIngestAudit(
    state,
    cand.reviewedAt,
    modifications ? 'Candidate modified' : 'Candidate accepted',
    'Change Candidate',
    candidateId,
    'Review Required',
    cand.status,
    `Regulatory Change ${changeId}`
  );
  return { ok: true, changeId };
}

export function rejectChangeCandidate(state, candidateId, userName, justification) {
  const cand = state.changeCandidates.find((c) => c.id === candidateId);
  if (!cand) return { ok: false };
  cand.status = 'Rejected';
  cand.reviewedBy = userName;
  cand.reviewedAt = new Date().toISOString();
  pushIngestAudit(state, cand.reviewedAt, 'Candidate rejected', 'Change Candidate', candidateId, cand.status, 'Rejected', justification || userName);
  return { ok: true };
}

export function toggleConnectorEnabled(state, connectorId, enabled) {
  const c = state.sourceConnectors.find((x) => x.id === connectorId);
  if (!c) return;
  c.enabled = enabled;
  c.status = enabled ? 'Active' : 'Disabled';
}

function pushIngestAudit(state, timestamp, action, recordType, recordId, previousValue, newValue, comments) {
  state.auditEvents.unshift({
    id: `AUD-ING-${recordId}-${action.replace(/\s/g, '-')}-${timestamp}`,
    timestamp,
    user: 'FORGENIQ Ingestion',
    action,
    recordType,
    recordId,
    previousValue,
    newValue,
    comments,
    relatedIds: [recordId],
  });
}

export { connectorHealth };
