import { TPR_VERIFICATION_TARGETS, tprCanonicalUrl, TPR_AUTHORITY } from './connectors/tpr-constants.js';
import { TPR_VERIFICATION_EVIDENCE } from './tpr-verification-evidence-data.js';
import { COVERAGE_STATUSES } from './landscape-helpers.js';

const FWK_TPR = 'FWK-TPR-REQ';

export function applyTprSeed(state) {
  state.tprPublicationRecords = buildTprRecords();
  state.tprStaging = buildTprStaging();
  state.tprSourceChanges = buildTprSourceChanges();
  state.tprSource = buildTprSourceMeta(state);
  applyTprCoverage(state, state.tprVerificationEvidence || TPR_VERIFICATION_EVIDENCE);
  return state;
}

function buildTprRecords() {
  return TPR_VERIFICATION_TARGETS.map((t) => ({
    tprRecordId: t.id,
    title: t.title,
    documentType: t.documentType,
    legalSourceType: t.legalSourceType,
    canonicalUrl: tprCanonicalUrl(t.path),
    sourceAuthority: TPR_AUTHORITY,
    codeSection: t.codeSection || null,
    sectorIds: ['SEC-011'],
    frameworkIds: [FWK_TPR, 'FWK-TPR-GCOP'],
    complianceThemeIds: ['THM-PENSION-GOV', 'THM-GOV', 'THM-MEMBER'],
    legalReferences: t.id === 'TPR-TGT-CODE-MODULE'
      ? [{ type: 'PRIMARY_LEGISLATION', recordId: 'LEG-UKPGA-2004-35', label: 'Pensions Act 2004' }]
      : [],
    sourceStatus: 'NOT_CHECKED',
    reviewStatus: 'MAPPED',
    sourceHash: null,
    retrievedAt: null,
    lastVerifiedAt: null,
    monitoringStatus: 'CONFIGURED',
  }));
}

function buildTprStaging() {
  return [
    {
      id: 'TPR-STAGE-001',
      title: 'Statement of strategy consultation',
      documentType: 'TPR_CONSULTATION',
      tprCategory: 'Consultations',
      status: 'REVIEW_REQUIRED',
      relevanceStatus: 'POTENTIALLY_RELEVANT',
      consultationStatus: 'UNKNOWN',
      closingDate: null,
      canonicalUrl: tprCanonicalUrl('/document-library/consultations/statement-of-strategy-consultation'),
      detectedAt: '2026-10-13T19:00:00Z',
      autoChangeCreated: false,
      autoObligationCreated: false,
    },
    {
      id: 'TPR-STAGE-002',
      title: 'Statement of strategy — interim response',
      documentType: 'TPR_CONSULTATION_RESPONSE',
      tprCategory: 'Consultations',
      status: 'REVIEW_REQUIRED',
      linkedConsultationId: 'TPR-STAGE-001',
      canonicalUrl: tprCanonicalUrl('/document-library/consultations/statement-of-strategy-consultation/interim-response'),
      detectedAt: '2026-10-13T19:05:00Z',
      autoChangeCreated: false,
    },
  ];
}

function buildTprSourceChanges() {
  return [
    {
      changeEventId: 'TPR-CHG-001',
      tprRecordId: 'TPR-TGT-CODE-MODULE',
      previousHash: 'fixture-tpr-prev',
      newHash: 'fixture-tpr-new',
      detectedAt: '2026-10-12T14:00:00Z',
      changeType: 'CODE_UPDATED',
      reviewStatus: 'REVIEW_REQUIRED',
      linkedRiChangeId: null,
      regulatoryRequirementChanged: false,
    },
  ];
}

function buildTprSourceMeta(state) {
  const ev = state.tprVerificationEvidence || TPR_VERIFICATION_EVIDENCE;
  return {
    sourceId: 'SRC-TPR',
    sourceName: 'The Pensions Regulator',
    authority: TPR_AUTHORITY,
    canonicalUrl: 'https://www.thepensionsregulator.gov.uk/',
    sourceType: 'OFFICIAL_UK_REGULATOR',
    mode: 'LIVE OFFICIAL SOURCE',
    sourceStatus: ev.status || 'NOT_CHECKED',
    lastSuccessfulRetrieval: ev.lastVerifiedAt,
    verifiedRecordCount: (ev.verifiedRecordIds || []).length,
    sourceFamiliesVerified: ev.sourceFamiliesVerified || [],
  };
}

const TPR_BASELINE = {
  coverageStatus: COVERAGE_STATUSES.SOURCE_PLANNED,
  liveMonitoring: false,
  riSourceId: null,
  riSourceLabel: 'The Pensions Regulator (not connected)',
  missingSource: 'The Pensions Regulator official feed',
  plannedConnector: 'TPR sitemap / Document Library (planned)',
};

export function applyTprCoverage(state, evidence) {
  state.tprVerificationEvidence = evidence;
  const live = evidence.status === 'LIVE_VERIFIED';
  const fw = (state.regulatoryFrameworks || []).find((f) => f.id === FWK_TPR);
  const gcop = (state.regulatoryFrameworks || []).find((f) => f.id === 'FWK-TPR-GCOP');
  if (!live) {
    if (fw) Object.assign(fw, { ...TPR_BASELINE });
    if (gcop && gcop.id) Object.assign(gcop, { ...TPR_BASELINE, name: gcop.name });
    (state.tprPublicationRecords || []).forEach((r) => {
      r.sourceStatus = evidence.status === 'SOURCE_UNAVAILABLE' ? 'LIVE SOURCE UNAVAILABLE' : 'NOT_CHECKED';
      r.liveMonitoring = false;
    });
    const reg = (state.landscapeRegulators || []).find((r) => r.id === 'REG-TPR');
    if (reg) reg.liveConnectorId = null;
  } else {
    if (fw) {
      fw.coverageStatus = COVERAGE_STATUSES.LIVE_SOURCE;
      fw.liveMonitoring = true;
      fw.riSourceId = 'SRC-TPR';
      fw.riSourceLabel = 'thepensionsregulator.gov.uk (official)';
      fw.primaryAuthority = TPR_AUTHORITY;
      fw.lastChecked = evidence.lastVerifiedAt;
      fw.missingSource = null;
      fw.plannedConnector = null;
    }
    if (gcop) {
      gcop.coverageStatus = COVERAGE_STATUSES.LIVE_SOURCE;
      gcop.liveMonitoring = true;
      gcop.riSourceId = 'SRC-TPR';
      gcop.riSourceLabel = 'thepensionsregulator.gov.uk — General Code';
      gcop.lastChecked = evidence.lastVerifiedAt;
    }
    const verified = new Set(evidence.verifiedRecordIds || []);
    (state.tprPublicationRecords || []).forEach((r) => {
      if (!verified.has(r.tprRecordId)) return;
      r.sourceStatus = 'LIVE_VERIFIED';
      r.liveMonitoring = true;
      r.lastVerifiedAt = evidence.lastVerifiedAt;
      const tr = (evidence.targetRecords || []).find((t) => t.tprRecordId === r.tprRecordId);
      if (tr?.sourceHash) r.sourceHash = tr.sourceHash;
    });
    const reg = (state.landscapeRegulators || []).find((r) => r.id === 'REG-TPR');
    if (reg) reg.liveConnectorId = 'SRC-TPR';
  }
  if (state.tprSource) {
    state.tprSource.sourceStatus = evidence.status;
    state.tprSource.lastSuccessfulRetrieval = evidence.lastVerifiedAt;
    state.tprSource.verifiedRecordCount = (evidence.verifiedRecordIds || []).length;
    state.tprSource.sourceFamiliesVerified = evidence.sourceFamiliesVerified || [];
  }
}
