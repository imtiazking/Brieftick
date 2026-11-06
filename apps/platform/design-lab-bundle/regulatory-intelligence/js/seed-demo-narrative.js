/**
 * Presentation-ready narrative for primary demo chains (applied after operational seed).
 */
export function applyDemoNarrative(state) {
  enrichConsumerDuty(state);
  enrichOperationalResilience(state);
  sortAuditEvents(state);
  return state;
}

function enrichConsumerDuty(state) {
  const p1 = state.publications.find((p) => p.id === 'PUB-001');
  if (p1) {
    p1.workflowStatus = 'Impact Review';
    p1.applicabilityDecision = 'Applicable';
    p1.decisionMeta = {
      user: 'Sarah Jones',
      role: 'Compliance Officer',
      date: '2026-10-08',
      justification: 'Retail lending and savings products are in scope; existing Consumer Duty programme requires uplift.',
    };
  }

  const ch1 = state.changes.find((c) => c.id === 'CHG-001');
  if (ch1) {
    ch1.status = 'Assessment in progress';
    ch1.applicabilityDecision = 'Applicable';
    ch1.decisionMeta = {
      user: 'Sarah Jones',
      date: '2026-10-08',
      justification: 'Outcome monitoring MI gaps affect retail cohorts — proceed to impact assessment.',
    };
    ch1.aiGovernance = {
      ...(ch1.aiGovernance || {}),
      humanReviewStatus: 'Human accepted',
      humanDecision: 'Applicable',
      justification: ch1.decisionMeta.justification,
    };
  }

  const ch3 = state.changes.find((c) => c.id === 'CHG-003');
  if (ch3) {
    ch3.decisionMeta = {
      user: 'Sarah Mitchell',
      date: '2026-10-09',
      justification: 'Committee papers already include outcome MI — applicability confirmed with narrower governance scope.',
    };
    ch3.applicabilityDecision = 'Applicable';
    ch3.aiGovernance = {
      ...(ch3.aiGovernance || {}),
      humanReviewStatus: 'Human modified',
      humanDecision: 'Applicable',
      justification: ch3.decisionMeta.justification,
    };
  }

  const ia = state.assessments.find((a) => a.id === 'IA-0042');
  if (ia) {
    ia.owner = 'James Okonkwo';
    ia.ownerId = 'u-okonkwo';
    ia.reviewer = 'Sarah Mitchell';
    ia.approver = 'Sarah Mitchell';
    ia.submittedBy = null;
    ia.submittedDate = null;
    ia.approvalStatus = 'Draft';
  }

  pushAudit(state, '2026-10-06T11:00:00', 'Priya Shah', 'Triage completed', 'Publication', 'PUB-001', 'New', 'Accepted', null, 'Accepted for assessment');
  pushAudit(state, '2026-10-08T14:30:00', 'Sarah Jones', 'Applicability decision recorded', 'Regulatory Change', 'CHG-001', 'AI recommended', 'Applicable', null, 'Human decision');
  pushAudit(state, '2026-10-09T10:15:00', 'Sarah Mitchell', 'Recommendation overridden', 'Regulatory Change', 'CHG-003', 'Review Required', 'Applicable', null, 'Governance scope narrowed');
  pushAudit(state, '2026-10-07T09:30:00', 'James Okonkwo', 'Assessment started', 'Impact Assessment', 'IA-0042', null, 'Draft', null, 'Consumer Duty outcome monitoring uplift');
}

function enrichOperationalResilience(state) {
  if (!state.publicationAnalysis) state.publicationAnalysis = {};
  state.publicationAnalysis['PUB-003'] = {
    whatChanged: 'DEMO: PRA expectations on testing impact tolerances for important business services have been clarified.',
    whyItMatters: 'DEMO: FORGENIQ Bank must evidence IBS mapping, tolerance breaches, and remediation for core payments.',
    whoAffected: {
      entities: ['ABC Financial Ltd'],
      products: ['Payment wallets', 'Retail current accounts'],
      businessLines: ['Payments', 'Operations', 'Technology'],
      customerTypes: ['Retail', 'SMEs'],
      functions: ['Operations', 'Technology', 'Risk', 'Compliance'],
    },
    keyDates: [
      { label: 'Published', date: '2026-08-20' },
      { label: 'Consultation deadline', date: '2026-11-15' },
      { label: 'Effective', date: '2027-03-31' },
    ],
    suggestedSteps: [
      'Confirm applicability to mapped IBS',
      'Update operational resilience policy',
      'Schedule scenario testing',
      'Report tolerance breaches to committee',
    ],
    confidence: 85,
    reasoning: 'DEMO: Core payment services are designated important business services with documented impact tolerances.',
    citation: 'PRA SS4/26 §4.2',
    citationSection: '4.2',
  };

  const ia38 = state.assessments.find((a) => a.id === 'IA-0038');
  if (ia38) {
    ia38.owner = 'James Walker';
    ia38.ownerId = 'u-walker';
    ia38.reviewer = 'Sarah Mitchell';
    ia38.approver = 'Michael Grant';
    ia38.aiSummary =
      'DEMO: Retail payments IBS requires updated scenario testing and evidence of tolerance breaches, remediation timelines, and third-party dependency mapping.';
    ia38.submittedBy = 'James Walker';
    ia38.submittedDate = '2026-10-05';
    ia38.approvalStatus = 'Awaiting Approval';
  }

  const ch10 = state.changes.find((c) => c.id === 'CHG-010');
  if (ch10) {
    ch10.decisionMeta = {
      user: 'James Walker',
      date: '2026-08-25',
      justification: 'Payments IBS mapping complete — testing cadence must align with PRA SS4/26.',
    };
    ch10.aiGovernance = {
      ...(ch10.aiGovernance || {}),
      humanReviewStatus: 'Human accepted',
      humanDecision: 'Applicable',
    };
  }

  state.obligations.forEach((o) => {
    if (o.owner === 'Michael Chen') {
      o.owner = 'James Walker';
      o.ownerId = 'u-walker';
    }
  });
  state.risks.forEach((r) => {
    if (r.owner === 'Michael Chen') r.owner = 'James Walker';
  });
  state.controls.forEach((c) => {
    if (c.owner === 'Michael Chen') c.owner = 'James Walker';
  });
  state.actions.forEach((a) => {
    if (a.owner === 'Michael Chen') {
      a.owner = 'James Walker';
      a.ownerId = 'u-walker';
    }
  });
  state.assessments.forEach((a) => {
    if (a.owner === 'Michael Chen') {
      a.owner = 'James Walker';
      a.ownerId = 'u-walker';
    }
  });

  pushAudit(state, '2026-08-20T12:00:00', 'FORGENIQ AI', 'Publication ingested', 'Publication', 'PUB-003', null, 'Ingested', null, 'Mock connector: PRA Publications');
  pushAudit(state, '2026-08-22T09:00:00', 'James Walker', 'Triage completed', 'Publication', 'PUB-003', 'Review Required', 'Accepted', null, 'Operational resilience programme');
  pushAudit(state, '2026-08-25T15:00:00', 'James Walker', 'Applicability decision recorded', 'Regulatory Change', 'CHG-010', null, 'Applicable', null, 'IBS payments in scope');
  pushAudit(state, '2026-10-05T11:30:00', 'James Walker', 'Assessment submitted', 'Impact Assessment', 'IA-0038', 'Draft', 'Awaiting Approval', null, 'Submitted for executive approval');
}

function pushAudit(state, timestamp, user, action, recordType, recordId, previousValue, newValue, comments) {
  const id = `AUD-DEMO-${state.auditEvents.length + 1}`;
  state.auditEvents.push({
    id,
    timestamp,
    user,
    action,
    recordType,
    recordId,
    previousValue,
    newValue,
    comments,
    relatedIds: [recordId],
  });
}

function sortAuditEvents(state) {
  state.auditEvents.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
}
