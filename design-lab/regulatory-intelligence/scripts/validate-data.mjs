/**
 * Design Lab data integrity check (run: node design-lab/regulatory-intelligence/scripts/validate-data.mjs)
 */
import { createFreshState } from '../js/migrate.js';
import { buildWorkQueue, buildNotifications } from '../js/workflow-helpers.js';

const state = createFreshState();
const errors = [];

const COLLECTIONS = {
  publications: () => state.publications,
  changes: () => state.changes,
  assessments: () => state.assessments,
  obligations: () => state.obligations,
  policies: () => state.policies,
  risks: () => state.risks,
  controls: () => state.controls,
  actions: () => state.actions,
  evidence: () => state.evidence,
};

function exists(collection, id, label) {
  if (!id) return;
  const list = COLLECTIONS[collection]?.() || [];
  const ok = list.some((x) => x.id === id);
  if (!ok) errors.push(`${label}: missing ${id}`);
}

function checkIds(arr, collection, label) {
  (arr || []).forEach((id) => exists(collection, id, label));
}

state.publications.forEach((p) => checkIds(p.changeIds, 'changes', `Publication ${p.id} changeIds`));
state.changes.forEach((ch) => {
  exists('publications', ch.publicationId, `Change ${ch.id} publicationId`);
  checkIds(ch.linkedAssessmentIds, 'assessments', `Change ${ch.id} linkedAssessmentIds`);
  checkIds(ch.linkedObligationIds, 'obligations', `Change ${ch.id} linkedObligationIds`);
  checkIds(ch.linkedPolicyIds, 'policies', `Change ${ch.id} linkedPolicyIds`);
  checkIds(ch.linkedRiskIds, 'risks', `Change ${ch.id} linkedRiskIds`);
  checkIds(ch.linkedControlIds, 'controls', `Change ${ch.id} linkedControlIds`);
  checkIds(ch.linkedActionIds, 'actions', `Change ${ch.id} linkedActionIds`);
  checkIds(ch.linkedEvidenceIds, 'evidence', `Change ${ch.id} linkedEvidenceIds`);
  if (ch.sourceSection && ch.publicationId) {
    const sec = state.sourceDocuments?.[ch.publicationId];
    if (sec && !sec.sections?.some((s) => s.id === ch.sourceSection || s.citationSlug === ch.sourceSection)) {
      errors.push(`Change ${ch.id}: sourceSection ${ch.sourceSection} not in sourceDocuments`);
    }
  }
});

state.obligations.forEach((o) => {
  exists('publications', o.publicationId, `Obligation ${o.id}`);
  if (o.changeId) exists('changes', o.changeId, `Obligation ${o.id} changeId`);
  checkIds(o.policyIds, 'policies', `Obligation ${o.id}`);
  checkIds(o.riskIds, 'risks', `Obligation ${o.id}`);
  checkIds(o.controlIds, 'controls', `Obligation ${o.id}`);
  checkIds(o.actionIds, 'actions', `Obligation ${o.id}`);
  checkIds(o.evidenceIds, 'evidence', `Obligation ${o.id}`);
});

state.assessments.forEach((a) => {
  exists('publications', a.publicationId, `IA ${a.id}`);
  if (a.changeId) exists('changes', a.changeId, `IA ${a.id}`);
});

['PUB-001', 'PUB-002', 'PUB-003', 'PUB-004'].forEach((pubId) => {
  state.changes
    .filter((c) => c.publicationId === pubId && c.sourceSection)
    .forEach((c) => {
      const doc = state.sourceDocuments[pubId];
      if (!doc?.sections?.find((s) => s.citationSlug === c.sourceSection || s.id === c.sourceSection)) {
        errors.push(`Citation target missing: ${c.id} → ${pubId}/${c.sourceSection}`);
      }
    });
});

(state.people || []).forEach((p) => {
  if (p.teamId && !state.teams?.some((t) => t.id === p.teamId)) errors.push(`Person ${p.id} invalid teamId`);
});

state.publications.forEach((p) => {
  if (p.assignedReviewerId && !state.people?.some((x) => x.id === p.assignedReviewerId)) {
    errors.push(`Publication ${p.id} invalid assignedReviewerId`);
  }
  if (p.ownerId && !state.people?.some((x) => x.id === p.ownerId)) errors.push(`Publication ${p.id} invalid ownerId`);
});

(state.relatedPublications || []).forEach((r) => {
  exists('publications', r.fromId, 'relatedPublication fromId');
  exists('publications', r.toId, 'relatedPublication toId');
});

if (state.currentDemoUserId && !state.people?.some((p) => p.id === state.currentDemoUserId)) {
  errors.push('Invalid currentDemoUserId');
}

function personOk(id, label) {
  if (!id) return;
  if (!state.people?.some((p) => p.id === id)) errors.push(`${label}: invalid person ${id}`);
}

state.assessments.forEach((a) => {
  personOk(a.ownerId, `IA ${a.id} ownerId`);
  personOk(a.reviewerId, `IA ${a.id} reviewerId`);
  personOk(a.approverId, `IA ${a.id} approverId`);
  personOk(a.accountableExecutiveId, `IA ${a.id} accountableExecutiveId`);
});
state.changes.forEach((c) => {
  personOk(c.ownerId, `Change ${c.id} ownerId`);
  personOk(c.reviewerId, `Change ${c.id} reviewerId`);
  personOk(c.accountableExecutiveId, `Change ${c.id} accountableExecutiveId`);
  if (c.assignedTeamId && !state.teams?.some((t) => t.id === c.assignedTeamId)) {
    errors.push(`Change ${c.id} invalid assignedTeamId`);
  }
});
state.actions.forEach((a) => {
  personOk(a.ownerId, `Action ${a.id} ownerId`);
  if (a.assignedTeamId && !state.teams?.some((t) => t.id === a.assignedTeamId)) {
    errors.push(`Action ${a.id} invalid assignedTeamId`);
  }
});

const entityRoute = {
  Publication: 'publications',
  'Regulatory Change': 'changes',
  'Impact Assessment': 'assessments',
  Obligation: 'obligations',
  Action: 'actions',
  Evidence: 'evidence',
};

buildNotifications(state, 'all').forEach((n) => {
  const col = entityRoute[n.entityType];
  if (col) exists(col, n.entityId, `Notification ${n.id}`);
});

(state.auditEvents || []).forEach((e) => {
  const col = entityRoute[e.recordType] || (e.recordType === 'Publication' ? 'publications' : null);
  if (col) exists(col, e.recordId, `Audit ${e.action} record`);
  (e.relatedIds || []).forEach((rid) => {
    const found =
      state.publications.some((x) => x.id === rid) ||
      state.changes.some((x) => x.id === rid) ||
      state.assessments.some((x) => x.id === rid) ||
      state.obligations.some((x) => x.id === rid) ||
      state.actions.some((x) => x.id === rid) ||
      state.evidence.some((x) => x.id === rid) ||
      state.policies.some((x) => x.id === rid) ||
      state.rawSourceItems?.some((x) => x.id === rid) ||
      state.ingestionRuns?.some((x) => x.id === rid) ||
      state.sourceDocumentCatalog?.some((x) => x.id === rid) ||
      state.assuranceReviews?.some((x) => x.id === rid) ||
      state.assuranceFindings?.some((x) => x.id === rid) ||
      state.assurancePacks?.some((x) => x.id === rid) ||
      state.boardPacks?.some((x) => x.id === rid) ||
      state.reportingPeriods?.some((x) => x.id === rid) ||
      state.managementAttestations?.some((x) => x.id === rid);
    if (!found) errors.push(`Audit relatedId missing: ${rid} (${e.action})`);
  });
});

if (state.orgProfile?.version && state.orgProfile.version !== 'ORG-DEMO-04') {
  errors.push('Unexpected org profile version');
}

if (state.schemaVersion !== 16) {
  errors.push(`Expected schemaVersion 16, got ${state.schemaVersion}`);
}
if ((state.tprPublicationRecords || []).length < 5) {
  errors.push('Expected at least 5 tprPublicationRecords');
}
if ((state.baselPublicationRecords || []).length < 8) {
  errors.push('Expected at least 8 baselPublicationRecords');
}
if ((state.legislationRecords || []).length < 7) {
  errors.push('Expected at least 7 legislationRecords');
}

if ((state.sectors || []).length !== 12) {
  errors.push(`Expected 12 landscape sectors, got ${(state.sectors || []).length}`);
}
(state.sectorFrameworkMappings || []).forEach((m) => {
  if (!state.sectors?.some((s) => s.id === m.sectorId)) errors.push(`Invalid sectorFrameworkMapping sector ${m.sectorId}`);
  if (!state.regulatoryFrameworks?.some((f) => f.id === m.frameworkId)) errors.push(`Invalid sectorFrameworkMapping framework ${m.frameworkId}`);
});

if (!state.platformConfig?.adapterMode) errors.push('Missing platformConfig.adapterMode');
if (!state.tenantContext?.tenantId) errors.push('Missing tenantContext');
if (!state.tenants?.length) errors.push('Missing tenants');
if (!state.aiProviders?.length) errors.push('Missing aiProviders');
if (!state.tenantAiPolicy) errors.push('Missing tenantAiPolicy');
(state.aiExecutions || []).forEach((e) => {
  if (e.analysisId && !state.aiAnalyses?.some((a) => a.id === e.analysisId)) {
    errors.push(`AI execution ${e.id} orphan analysis ${e.analysisId}`);
  }
});

(state.assuranceReviews || []).forEach((r) => {
  personOk(r.reviewerId, `Assurance review ${r.id} reviewer`);
  if (r.methodologyId && !state.assuranceMethodologies?.some((m) => m.id === r.methodologyId)) {
    errors.push(`Assurance review ${r.id} invalid methodology`);
  }
  if (r.changeId) exists('changes', r.changeId, `Assurance review ${r.id} changeId`);
  (r.evidenceIds || []).forEach((eid) => exists('evidence', eid, `Assurance review ${r.id} evidence`));
  (r.controlTestIds || []).forEach((tid) => {
    if (!state.controlTests?.some((t) => t.id === tid)) errors.push(`Assurance review ${r.id} invalid control test ${tid}`);
  });
  (r.exceptionIds || []).forEach((eid) => {
    if (!state.governanceExceptions?.some((e) => e.id === eid)) errors.push(`Assurance review ${r.id} invalid exception ${eid}`);
  });
  (r.attestationIds || []).forEach((aid) => {
    const ok =
      state.attestations?.some((a) => a.id === aid) || state.managementAttestations?.some((a) => a.id === aid);
    if (!ok) errors.push(`Assurance review ${r.id} invalid attestation ${aid}`);
  });
});

(state.assuranceFindings || []).forEach((f) => {
  if (f.assuranceReviewId && !state.assuranceReviews?.some((r) => r.id === f.assuranceReviewId)) {
    errors.push(`Finding ${f.id} invalid review`);
  }
  personOk(f.ownerId, `Finding ${f.id} owner`);
  (f.linkedActionIds || []).forEach((aid) => exists('actions', aid, `Finding ${f.id} action`));
  if (f.linkedRiskId && !state.risks?.some((r) => r.id === f.linkedRiskId)) errors.push(`Finding ${f.id} invalid risk`);
  (f.evidenceIds || []).forEach((eid) => exists('evidence', eid, `Finding ${f.id} evidence`));
});

(state.managementAttestations || []).forEach((a) => {
  personOk(a.attestorId, `Mgmt attestation ${a.id}`);
  (a.supportingReviewIds || []).forEach((rid) => {
    if (!state.assuranceReviews?.some((r) => r.id === rid)) errors.push(`Mgmt attestation ${a.id} invalid review ${rid}`);
  });
  (a.exceptionsDeclared || []).forEach((eid) => {
    if (!state.governanceExceptions?.some((e) => e.id === eid)) errors.push(`Mgmt attestation ${a.id} invalid exception ${eid}`);
  });
});

(state.assurancePacks || []).forEach((p) => {
  if (p.changeId) exists('changes', p.changeId, `Pack ${p.id} change`);
  (p.evidenceIds || []).forEach((eid) => exists('evidence', eid, `Pack ${p.id} evidence`));
  (p.controlTestIds || []).forEach((tid) => {
    if (!state.controlTests?.some((t) => t.id === tid)) errors.push(`Pack ${p.id} invalid test ${tid}`);
  });
});

(state.reportingPeriods || []).forEach((p) => {
  if (p.periodStart > p.periodEnd) errors.push(`Period ${p.id} invalid dates`);
  if (p.previousPeriodId && !state.reportingPeriods.some((x) => x.id === p.previousPeriodId)) {
    errors.push(`Period ${p.id} invalid previousPeriodId`);
  }
});

(state.boardPacks || []).forEach((p) => {
  if (p.reportingPeriodId && !state.reportingPeriods?.some((x) => x.id === p.reportingPeriodId)) {
    errors.push(`Board pack ${p.id} invalid period`);
  }
  if (p.previousVersionId && !state.boardPacks?.some((x) => x.id === p.previousVersionId)) {
    errors.push(`Board pack ${p.id} invalid previousVersionId`);
  }
  (p.significantChangeIds || []).forEach((cid) => exists('changes', cid, `Board pack ${p.id} change`));
  (p.findingIds || []).forEach((fid) => {
    if (!state.assuranceFindings?.some((f) => f.id === fid)) errors.push(`Board pack ${p.id} invalid finding ${fid}`);
  });
});

(state.aiAnalyses || []).forEach((a) => {
  if (a.modelId && !state.aiModels?.some((m) => m.id === a.modelId)) errors.push(`Analysis ${a.id} invalid model`);
  if (a.analysisEngineId && !state.aiEngines?.some((e) => e.id === a.analysisEngineId)) errors.push(`Analysis ${a.id} invalid engine`);
  if (a.promptConfigId && !state.aiPromptConfigs?.some((c) => c.id === a.promptConfigId)) errors.push(`Analysis ${a.id} invalid config`);
  (a.sourceSectionIds || []).forEach((sid) => {
    if (!state.sourceSections?.some((s) => s.id === sid)) errors.push(`Analysis ${a.id} invalid section ${sid}`);
  });
  if (a.supersedesAnalysisId && !state.aiAnalyses.some((x) => x.id === a.supersedesAnalysisId)) errors.push(`Analysis ${a.id} invalid supersedes`);
});
(state.aiClaims || []).forEach((c) => {
  if (!state.aiAnalyses?.some((a) => a.id === c.analysisId)) errors.push(`Claim ${c.id} invalid analysis`);
  (c.sourceSectionIds || []).forEach((sid) => {
    if (sid && !state.sourceSections?.some((s) => s.id === sid)) errors.push(`Claim ${c.id} invalid section ${sid}`);
  });
});
(state.aiReviews || []).forEach((r) => {
  if (!state.aiAnalyses?.some((a) => a.id === r.analysisId)) errors.push(`Review ${r.id} invalid analysis`);
  if (r.reviewerId && !state.people?.some((p) => p.id === r.reviewerId)) errors.push(`Review ${r.id} invalid reviewer`);
});

(state.approvalChains || []).forEach((c) => {
  if (c.policyId && !state.governancePolicies?.some((p) => p.id === c.policyId)) errors.push(`Chain ${c.id} invalid policy`);
  (c.steps || []).forEach((st) => {
    if (st.assigneeId && !state.people?.some((p) => p.id === st.assigneeId)) errors.push(`Step ${st.id} invalid assignee`);
  });
});
(state.attestations || []).forEach((a) => {
  if (a.attestedById && !state.people?.some((p) => p.id === a.attestedById)) errors.push(`Attestation ${a.id} invalid attestor`);
  (a.supportingEvidenceIds || []).forEach((eid) => exists('evidence', eid, `Attestation ${a.id} evidence`));
});
(state.controlTests || []).forEach((t) => {
  exists('controls', t.controlId, `Control test ${t.id}`);
  if (t.testerId && !state.people?.some((p) => p.id === t.testerId)) errors.push(`Control test ${t.id} invalid tester`);
});
(state.governanceExceptions || []).forEach((e) => {
  if (e.requestedById && !state.people?.some((p) => p.id === e.requestedById)) errors.push(`Exception ${e.id} requester`);
  if (e.linkedRiskId && !state.risks?.some((r) => r.id === e.linkedRiskId)) errors.push(`Exception ${e.id} risk`);
});

(state.regulatorySources || []).forEach((src) => {
  (state.sourceConnectors || [])
    .filter((c) => c.sourceId === src.id)
    .forEach((c) => {
      if (!src.id) errors.push('Connector missing sourceId');
    });
});

(state.sourceConnectors || []).forEach((c) => {
  if (!state.regulatorySources?.some((s) => s.id === c.sourceId)) errors.push(`Connector ${c.id} invalid sourceId`);
});

(state.ingestionRuns || []).forEach((r) => {
  if (!state.sourceConnectors?.some((c) => c.id === r.connectorId)) errors.push(`Run ${r.id} invalid connectorId`);
});

(state.rawSourceItems || []).forEach((r) => {
  if (!state.regulatorySources?.some((s) => s.id === r.sourceId)) errors.push(`Raw ${r.id} invalid sourceId`);
  if (!state.sourceConnectors?.some((c) => c.id === r.connectorId)) errors.push(`Raw ${r.id} invalid connectorId`);
  if (r.ingestionRunId && !state.ingestionRuns?.some((x) => x.id === r.ingestionRunId)) errors.push(`Raw ${r.id} invalid ingestionRunId`);
  if (r.linkedSourceDocumentId && !state.sourceDocumentCatalog?.some((d) => d.id === r.linkedSourceDocumentId)) {
    errors.push(`Raw ${r.id} invalid linkedSourceDocumentId`);
  }
  if (r.linkedPublicationId && !state.publications?.some((p) => p.id === r.linkedPublicationId)) {
    errors.push(`Raw ${r.id} invalid linkedPublicationId`);
  }
});

(state.sourceDocumentCatalog || []).forEach((d) => {
  if (!state.regulatorySources?.some((s) => s.id === d.sourceId)) errors.push(`Doc ${d.id} invalid sourceId`);
  if (d.publicationId && !state.publications?.some((p) => p.id === d.publicationId)) errors.push(`Doc ${d.id} invalid publicationId`);
  if (d.previousVersionId && !state.sourceDocumentCatalog?.some((x) => x.id === d.previousVersionId)) {
    errors.push(`Doc ${d.id} invalid previousVersionId`);
  }
});

const sectionIds = new Set();
(state.sourceSections || []).forEach((s) => {
  if (sectionIds.has(s.id)) errors.push(`Duplicate sourceSection id ${s.id}`);
  sectionIds.add(s.id);
  if (!state.sourceDocumentCatalog?.some((d) => d.id === s.documentId)) errors.push(`Section ${s.id} invalid documentId`);
  if (s.publicationId && !state.publications?.some((p) => p.id === s.publicationId)) errors.push(`Section ${s.id} invalid publicationId`);
  if (!s.citationSlug) errors.push(`Section ${s.id} missing citationSlug`);
});

(state.changeCandidates || []).forEach((c) => {
  if (c.publicationId && !state.publications?.some((p) => p.id === c.publicationId)) {
    errors.push(`Candidate ${c.id} invalid publicationId`);
  }
  (c.sourceSectionIds || []).forEach((sid) => {
    if (!state.sourceSections?.some((s) => s.id === sid)) errors.push(`Candidate ${c.id} invalid sourceSectionId ${sid}`);
  });
  if (c.acceptedChangeId && !state.changes?.some((ch) => ch.id === c.acceptedChangeId)) {
    errors.push(`Candidate ${c.id} invalid acceptedChangeId`);
  }
});

function sectionExists(pubId, ref) {
  const doc = state.sourceDocuments?.[pubId];
  const inDoc = doc?.sections?.some((s) => s.id === ref || s.citationSlug === ref);
  const inCat = state.sourceSections?.some((s) => s.publicationId === pubId && (s.id === ref || s.citationSlug === ref || s.sectionNumber === ref));
  return inDoc || inCat;
}

state.changes.forEach((ch) => {
  if (ch.sourceSection && ch.publicationId && !sectionExists(ch.publicationId, ch.sourceSection)) {
    errors.push(`Change ${ch.id}: sourceSection ${ch.sourceSection} not found`);
  }
  if (ch.sourceSectionId && !state.sourceSections?.some((s) => s.id === ch.sourceSectionId)) {
    errors.push(`Change ${ch.id}: invalid sourceSectionId`);
  }
});

const workEntityRoute = {
  ...entityRoute,
  'Assurance Review': 'assuranceReviews',
  'Assurance Finding': 'assuranceFindings',
  'Finding Validation': 'assuranceFindings',
  'Management Attestation': 'managementAttestations',
  'Board Pack Review': 'boardPacks',
};
COLLECTIONS.assuranceReviews = () => state.assuranceReviews;
COLLECTIONS.assuranceFindings = () => state.assuranceFindings;
COLLECTIONS.managementAttestations = () => state.managementAttestations;
COLLECTIONS.boardPacks = () => state.boardPacks;

buildWorkQueue(state, 'all').forEach((w) => {
  if (w.entityType === 'Change Candidate') {
    if (!state.changeCandidates?.some((c) => c.id === w.id)) errors.push(`Work queue candidate ${w.id} missing`);
    return;
  }
  const col = workEntityRoute[w.entityType] || entityRoute[w.entityType];
  if (col === 'assuranceReviews' || col === 'assuranceFindings' || col === 'managementAttestations' || col === 'boardPacks') {
    const list = COLLECTIONS[col]?.() || [];
    if (!list.some((x) => x.id === w.id)) errors.push(`Work queue ${w.entityType} ${w.id}`);
    return;
  }
  if (col) exists(col, w.id, `Work queue ${w.entityType} ${w.id}`);
});

if (errors.length) {
  console.error('VALIDATION FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('VALIDATION OK — ' + state.changes.length + ' changes, ' + state.obligations.length + ' obligations');
