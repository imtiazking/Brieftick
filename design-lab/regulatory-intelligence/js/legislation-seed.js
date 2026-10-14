import { LEGISLATION_TARGET_MAP, canonicalLegislationUrl, LEGISLATION_AUTHORITY } from './connectors/legislation-constants.js';
import { LEGISLATION_VERIFICATION_EVIDENCE } from './legislation-verification-evidence-data.js';
import { COVERAGE_STATUSES } from './landscape-helpers.js';

export function applyLegislationSeed(state) {
  state.legislationRecords = buildLegislationRecords();
  state.legislationStaging = buildLegislationStaging();
  state.legislationSourceChanges = buildLegislationSourceChanges();
  state.legislationSource = buildLegislationSourceMeta(state);
  applyLegislationCoverage(state, state.legislationVerificationEvidence || LEGISLATION_VERIFICATION_EVIDENCE);
  return state;
}

function buildLegislationRecords() {
  return LEGISLATION_TARGET_MAP.map((t) => ({
    id: t.recordId,
    frameworkId: t.frameworkId,
    officialIdentifier: t.path,
    legislationType: t.legislationType,
    title: t.title,
    year: t.year,
    number: String(t.number),
    canonicalUri: canonicalLegislationUrl(t.path),
    authority: LEGISLATION_AUTHORITY,
    sourceId: 'SRC-LEG',
    monitoringStatus: 'CONFIGURED',
    sourceStatus: 'NOT_CHECKED',
    liveMonitoring: false,
    sourceHash: null,
    lastChecked: null,
    sectorIds: sectorIdsForFramework(t.frameworkId),
    frameworkIds: [t.frameworkId],
    complianceThemeIds: [],
  }));
}

function buildLegislationStaging() {
  return [
    {
      id: 'LEG-STAGE-001',
      title: 'The Financial Services (Example) Regulations 2026',
      officialIdentifier: 'uksi/2026/9999-fixture',
      legislationType: 'UKSI',
      status: 'REVIEW_REQUIRED',
      relevanceStatus: 'POTENTIALLY_RELEVANT',
      relevanceReason: 'Mapped by configuration (fixture LEG-004)',
      canonicalUri: 'https://www.legislation.gov.uk/uksi/2026/1080/made',
      detectedAt: '2026-10-13T18:00:00Z',
      reviewStatus: 'REVIEW_REQUIRED',
      autoChangeCreated: false,
      autoObligationCreated: false,
    },
  ];
}

function buildLegislationSourceChanges() {
  return [
    {
      changeEventId: 'LEG-CHG-001',
      legislationRecordId: 'LEG-UKSI-2017-752',
      previousHash: 'fixture-prev-hash-psr',
      newHash: 'fixture-new-hash-psr',
      detectedAt: '2026-10-12T10:00:00Z',
      changeType: 'SOURCE_UPDATED',
      reviewStatus: 'REVIEW_REQUIRED',
      reviewer: null,
      rationale: 'Source snapshot hash changed — regulatory significance not confirmed',
      linkedRiChangeId: null,
      legalChangeConfirmed: false,
    },
  ];
}

function buildLegislationSourceMeta(state) {
  const ev = state.legislationVerificationEvidence || LEGISLATION_VERIFICATION_EVIDENCE;
  return {
    sourceId: 'SRC-LEG',
    sourceName: 'UK Legislation',
    authority: LEGISLATION_AUTHORITY,
    canonicalUrl: 'https://www.legislation.gov.uk/',
    sourceType: 'OFFICIAL_GOVERNMENT_LEGISLATION_SOURCE',
    mode: 'LIVE OFFICIAL SOURCE',
    sourceStatus: ev.status || 'NOT_CHECKED',
    lastSuccessfulRetrieval: ev.lastVerifiedAt,
    lastFailure: ev.lastFailure || null,
    feedStatus: ev.feedProbe?.ok ? 'AVAILABLE' : 'NOT_CHECKED',
    verifiedRecordCount: (ev.verifiedRecordIds || []).length,
    provenance: 'legislation.gov.uk',
  };
}

function sectorIdsForFramework(frameworkId) {
  const map = {
    'FWK-BANK-ACT': ['SEC-001'],
    'FWK-CCA': ['SEC-006'],
    'FWK-INS-ACT': ['SEC-004'],
    'FWK-PSR': ['SEC-008'],
    'FWK-EMR': ['SEC-008'],
    'FWK-PENS-1995': ['SEC-011'],
    'FWK-PENS-2004': ['SEC-011'],
  };
  return map[frameworkId] || [];
}

const LEGISLATION_BASELINE = {
  'FWK-BANK-ACT': { coverageStatus: COVERAGE_STATUSES.REFERENCE_ONLY, liveMonitoring: false, riSourceId: null, riSourceLabel: 'UK legislation (reference)' },
  'FWK-CCA': { coverageStatus: COVERAGE_STATUSES.REFERENCE_ONLY, liveMonitoring: false, riSourceId: null, riSourceLabel: 'UK legislation (reference)' },
  'FWK-INS-ACT': { coverageStatus: COVERAGE_STATUSES.REFERENCE_ONLY, liveMonitoring: false, riSourceId: null, riSourceLabel: 'UK legislation (reference)' },
  'FWK-PSR': { coverageStatus: COVERAGE_STATUSES.PARTIAL_COVERAGE, liveMonitoring: false, riSourceId: 'SRC-FCA', riSourceLabel: 'FCA publications (related)' },
  'FWK-EMR': { coverageStatus: COVERAGE_STATUSES.REFERENCE_ONLY, liveMonitoring: false, riSourceId: null, riSourceLabel: 'UK legislation (reference)' },
  'FWK-PENS-1995': { coverageStatus: COVERAGE_STATUSES.REFERENCE_ONLY, liveMonitoring: false, riSourceId: null, riSourceLabel: 'UK legislation (reference)' },
  'FWK-PENS-2004': { coverageStatus: COVERAGE_STATUSES.REFERENCE_ONLY, liveMonitoring: false, riSourceId: null, riSourceLabel: 'UK legislation (reference)' },
};

export function applyLegislationCoverage(state, evidence) {
  state.legislationVerificationEvidence = evidence;
  const verified = new Set(evidence.verifiedFrameworkIds || []);
  const live = evidence.status === 'LIVE_VERIFIED';
  if (!live) {
    LEGISLATION_TARGET_MAP.forEach((t) => {
      const fw = (state.regulatoryFrameworks || []).find((f) => f.id === t.frameworkId);
      const base = LEGISLATION_BASELINE[t.frameworkId];
      const rec = (state.legislationRecords || []).find((r) => r.id === t.recordId);
      if (fw && base) {
        Object.assign(fw, base);
        fw.legislationRecordId = rec?.id || null;
        fw.lastChecked = evidence.lastVerifiedAt || fw.lastChecked;
      }
      if (rec) {
        rec.sourceStatus = evidence.status === 'SOURCE_UNAVAILABLE' ? 'LIVE SOURCE UNAVAILABLE' : 'NOT_CHECKED';
        rec.liveMonitoring = false;
        if (!live) rec.sourceHash = rec.sourceHash;
      }
    });
  }
  (state.regulatoryFrameworks || []).forEach((fw) => {
    if (!verified.has(fw.id)) return;
    if (!live) return;
    const rec = (state.legislationRecords || []).find((r) => r.frameworkId === fw.id);
    fw.coverageStatus = COVERAGE_STATUSES.LIVE_SOURCE;
    fw.liveMonitoring = true;
    fw.riSourceId = 'SRC-LEG';
    fw.riSourceLabel = 'legislation.gov.uk (official)';
    fw.primaryAuthority = LEGISLATION_AUTHORITY;
    fw.lastChecked = evidence.lastVerifiedAt;
    fw.legislationRecordId = rec?.id || null;
    fw.missingSource = null;
    if (rec) {
      rec.sourceStatus = 'LIVE_VERIFIED';
      rec.liveMonitoring = true;
      rec.lastChecked = evidence.lastVerifiedAt;
      const target = (evidence.targetRecords || []).find((t) => t.frameworkId === fw.id);
      if (target?.sourceHash) rec.sourceHash = target.sourceHash;
    }
  });
  if (state.legislationSource) {
    state.legislationSource.sourceStatus = evidence.status;
    state.legislationSource.lastSuccessfulRetrieval = evidence.lastVerifiedAt;
    state.legislationSource.verifiedRecordCount = (evidence.verifiedRecordIds || []).length;
    state.legislationSource.feedStatus = evidence.feedProbe?.ok ? 'AVAILABLE' : state.legislationSource.feedStatus;
  }
}
