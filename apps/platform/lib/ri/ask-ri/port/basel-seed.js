import {
  BASEL_VERIFICATION_TARGETS,
  bisCanonicalUrl,
  BASEL_AUTHORITY,
  BASEL_ORGANISATION,
  BASEL_SOURCE_LAYER,
} from './connectors/basel-constants.js';
import { BASEL_VERIFICATION_EVIDENCE } from './basel-verification-evidence-data.js';
import { COVERAGE_STATUSES } from './landscape-helpers.js';

const FWK_BASEL = 'FWK-BASEL';

export function applyBaselSeed(state) {
  state.baselPublicationRecords = buildBaselRecords();
  state.baselStaging = buildBaselStaging();
  state.baselSourceChanges = buildBaselSourceChanges();
  state.internationalImplementationMappings = buildImplementationMappings();
  state.baselSource = buildBaselSourceMeta(state);
  applyBaselCoverage(state, state.baselVerificationEvidence || BASEL_VERIFICATION_EVIDENCE);
  return state;
}

function buildBaselRecords() {
  return BASEL_VERIFICATION_TARGETS.map((t) => ({
    baselRecordId: t.id,
    officialReference: t.officialReference,
    title: t.title,
    documentType: t.documentType,
    sourceAuthority: BASEL_AUTHORITY,
    sourceOrganisation: BASEL_ORGANISATION,
    sourceLayer: BASEL_SOURCE_LAYER,
    frameworkModule: t.frameworkModule,
    canonicalUrl: bisCanonicalUrl(t.path),
    sectorIds: t.frameworkModule === 'DIS' ? ['SEC-001', 'SEC-005'] : ['SEC-001'],
    frameworkIds: [FWK_BASEL],
    complianceThemeIds: themeForModule(t.frameworkModule),
    versionStatus: 'UNKNOWN',
    effectiveDate: null,
    futureEffectiveDate: null,
    sourceStatus: 'NOT_CHECKED',
    reviewStatus: 'MAPPED',
    sourceHash: null,
    retrievedAt: null,
    lastVerifiedAt: null,
    ukImplementationStatus: 'NO_MAPPING_IDENTIFIED',
    monitoringStatus: 'CONFIGURED',
  }));
}

function themeForModule(mod) {
  const map = {
    CAP: ['THM-CAPITAL'],
    CRE: ['THM-CREDIT'],
    OPE: ['THM-OPRES'],
    SRP: ['THM-GOV', 'THM-CAPITAL'],
    DIS: ['THM-DISCLOSURE'],
  };
  return map[mod] || ['THM-CAPITAL'];
}

function buildBaselStaging() {
  return [
    {
      id: 'BAS-STAGE-001',
      title: 'Revisions to the credit risk framework — consultative document',
      documentType: 'CONSULTATIVE_DOCUMENT',
      status: 'REVIEW_REQUIRED',
      relevanceStatus: 'POTENTIALLY_RELEVANT',
      consultationStatus: 'UNKNOWN',
      closingDate: null,
      versionStatus: 'DRAFT',
      canonicalUrl: bisCanonicalUrl('/publications/basel-iii-monitoring'),
      detectedAt: '2026-10-13T22:00:00Z',
      autoChangeCreated: false,
      autoObligationCreated: false,
    },
    {
      id: 'BAS-STAGE-002',
      title: 'Basel III reforms — future effective chapter (monitoring)',
      documentType: 'INTERNATIONAL_STANDARD',
      status: 'REVIEW_REQUIRED',
      relevanceStatus: 'MAPPED_BY_CONFIGURATION',
      versionStatus: 'FUTURE',
      futureEffectiveDate: null,
      canonicalUrl: bisCanonicalUrl('/committees/bcbs/basel-framework/standard/cre'),
      detectedAt: '2026-10-13T22:05:00Z',
      autoChangeCreated: false,
    },
  ];
}

function buildBaselSourceChanges() {
  return [
    {
      changeEventId: 'BAS-CHG-001',
      baselRecordId: 'BAS-TGT-CAP',
      previousHash: 'fixture-basel-cap-prev',
      newHash: 'fixture-basel-cap-new',
      detectedAt: '2026-10-12T16:00:00Z',
      changeType: 'CHAPTER_UPDATED',
      reviewStatus: 'REVIEW_REQUIRED',
      linkedRiChangeId: null,
      regulatoryRequirementChanged: false,
    },
  ];
}

function buildImplementationMappings() {
  return [
    {
      mappingId: 'BAS-MAP-TRACE-001',
      baselRecordId: 'BAS-TGT-OPE',
      ukSourceId: 'SRC-PRA',
      praPublicationId: 'PUB-003',
      boePublicationId: null,
      ukFramework: 'FWK-PRA-RB',
      mappingType: 'RELATED_IMPLEMENTATION',
      confidence: 'CONFIGURATION',
      reviewStatus: 'REVIEWED',
      reviewer: 'Design Lab — deterministic mapping',
      rationale:
        'Basel operational risk standard is related to UK PRA operational resilience supervisory material — separate sources; human-reviewed traceability demo.',
      linkedRiChangeId: 'CHG-010',
      linkedObligationId: 'OBL-0088',
      linkedImpactAssessmentId: 'IA-0038',
    },
  ];
}

function buildBaselSourceMeta(state) {
  const ev = state.baselVerificationEvidence || BASEL_VERIFICATION_EVIDENCE;
  return {
    sourceId: 'SRC-BASEL',
    sourceName: 'Basel Committee / BIS',
    authority: BASEL_AUTHORITY,
    organisation: BASEL_ORGANISATION,
    canonicalUrl: 'https://www.bis.org/committees/bcbs/basel-framework',
    sourceType: 'INTERNATIONAL_PRUDENTIAL_STANDARD',
    mode: 'LIVE OFFICIAL SOURCE',
    sourceStatus: ev.status || 'NOT_CHECKED',
    lastSuccessfulRetrieval: ev.lastVerifiedAt,
    verifiedRecordCount: (ev.verifiedRecordIds || []).length,
    sourceFamiliesVerified: ev.sourceFamiliesVerified || [],
  };
}

const BASEL_BASELINE = {
  coverageStatus: COVERAGE_STATUSES.REFERENCE_ONLY,
  liveMonitoring: false,
  riSourceId: null,
  riSourceLabel: 'BIS / BCBS (not connected)',
  missingSource: 'Basel Framework official pages',
  plannedConnector: 'BIS BCBS HTML (planned)',
  legalSourceType: 'INTERNATIONAL_PRUDENTIAL_STANDARD',
};

export function applyBaselCoverage(state, evidence) {
  state.baselVerificationEvidence = evidence;
  const live = evidence.status === 'LIVE_VERIFIED';
  const fw = (state.regulatoryFrameworks || []).find((f) => f.id === FWK_BASEL);
  if (!live) {
    if (fw) Object.assign(fw, { ...BASEL_BASELINE, name: fw.name, shortName: fw.shortName });
    (state.baselPublicationRecords || []).forEach((r) => {
      r.sourceStatus = evidence.status === 'SOURCE_UNAVAILABLE' ? 'LIVE SOURCE UNAVAILABLE' : 'NOT_CHECKED';
      r.liveMonitoring = false;
    });
    const reg = (state.landscapeRegulators || []).find((r) => r.id === 'REG-BIS');
    if (reg) reg.liveConnectorId = null;
  } else {
    if (fw) {
      fw.coverageStatus = COVERAGE_STATUSES.LIVE_SOURCE;
      fw.liveMonitoring = true;
      fw.riSourceId = 'SRC-BASEL';
      fw.riSourceLabel = 'bis.org — Basel Framework';
      fw.primaryAuthority = BASEL_AUTHORITY;
      fw.lastChecked = evidence.lastVerifiedAt;
      fw.missingSource = null;
      fw.plannedConnector = null;
      fw.legalSourceType = 'INTERNATIONAL_PRUDENTIAL_STANDARD';
    }
    const verified = new Set(evidence.verifiedRecordIds || []);
    (state.baselPublicationRecords || []).forEach((r) => {
      if (!verified.has(r.baselRecordId)) return;
      r.sourceStatus = 'LIVE_VERIFIED';
      r.liveMonitoring = true;
      r.lastVerifiedAt = evidence.lastVerifiedAt;
      const tr = (evidence.targetRecords || []).find((t) => t.baselRecordId === r.baselRecordId);
      if (tr?.sourceHash) r.sourceHash = tr.sourceHash;
      if (tr?.versionStatus) r.versionStatus = tr.versionStatus;
      if (tr?.effectiveDate) r.effectiveDate = tr.effectiveDate;
    });
    const mapped = new Set((state.internationalImplementationMappings || []).map((m) => m.baselRecordId));
    (state.baselPublicationRecords || []).forEach((r) => {
      if (mapped.has(r.baselRecordId)) r.ukImplementationStatus = 'IDENTIFIED';
    });
    const reg = (state.landscapeRegulators || []).find((r) => r.id === 'REG-BIS');
    if (reg) reg.liveConnectorId = 'SRC-BASEL';
  }
  if (state.baselSource) {
    state.baselSource.sourceStatus = evidence.status;
    state.baselSource.lastSuccessfulRetrieval = evidence.lastVerifiedAt;
    state.baselSource.verifiedRecordCount = (evidence.verifiedRecordIds || []).length;
    state.baselSource.sourceFamiliesVerified = evidence.sourceFamiliesVerified || [];
  }
}
