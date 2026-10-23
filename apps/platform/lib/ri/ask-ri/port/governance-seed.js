/**
 * Enterprise governance seed — roles, policies, chains, attestations, exceptions (schema v5).
 */
export function applyGovernanceSeed(state) {
  state.governanceRoles = buildRoles();
  assignPersonRoles(state);
  state.governancePolicies = buildPolicies();
  state.committees = buildCommittees();
  state.delegations = buildDelegations();
  state.escalationRules = buildEscalationRules();
  state.approvalChains = buildApprovalChains();
  state.attestations = buildAttestations();
  state.controlTests = buildControlTests();
  state.governanceExceptions = buildExceptions();
  state.governanceEscalations = buildEscalations();
  enrichEntities(state);
  return state;
}

function buildRoles() {
  return [
    { id: 'GR-RC-ANALYST', name: 'Regulatory Change Analyst', approvalAuthorityMax: 'Low' },
    { id: 'GR-RC-MGR', name: 'Regulatory Change Manager', approvalAuthorityMax: 'Medium' },
    { id: 'GR-COMPLIANCE', name: 'Compliance Reviewer', approvalAuthorityMax: 'Medium' },
    { id: 'GR-LEGAL', name: 'Legal Reviewer', approvalAuthorityMax: 'High' },
    { id: 'GR-RISK', name: 'Risk Reviewer', approvalAuthorityMax: 'High' },
    { id: 'GR-BUS-OWNER', name: 'Business Owner', approvalAuthorityMax: 'Low' },
    { id: 'GR-CONTROL', name: 'Control Owner', approvalAuthorityMax: 'Low' },
    { id: 'GR-ACTION', name: 'Action Owner', approvalAuthorityMax: 'Low' },
    { id: 'GR-EVIDENCE', name: 'Evidence Owner', approvalAuthorityMax: 'Low' },
    { id: 'GR-HORC', name: 'Head of Regulatory Change', approvalAuthorityMax: 'High' },
    { id: 'GR-HOC', name: 'Head of Compliance', approvalAuthorityMax: 'High' },
    { id: 'GR-CRO', name: 'Chief Risk Officer', approvalAuthorityMax: 'Critical' },
    { id: 'GR-GC', name: 'General Counsel', approvalAuthorityMax: 'High' },
    { id: 'GR-EXEC', name: 'Executive Sponsor', approvalAuthorityMax: 'Critical' },
    { id: 'GR-AUDIT', name: 'Internal Audit Reviewer', approvalAuthorityMax: 'Medium' },
  ];
}

function assignPersonRoles(state) {
  const map = {
    'u-smith': ['GR-HORC', 'GR-RC-MGR'],
    'u-reed': ['GR-COMPLIANCE', 'GR-HOC'],
    'u-shah': ['GR-RC-ANALYST', 'GR-BUS-OWNER', 'GR-COMPLIANCE'],
    'u-walker': ['GR-BUS-OWNER', 'GR-ACTION'],
    'u-cole': ['GR-GC', 'GR-LEGAL'],
    'u-grant': ['GR-RISK', 'GR-CRO', 'GR-CONTROL'],
    'u-walsh': ['GR-CONTROL', 'GR-EVIDENCE'],
    'u-jones': ['GR-COMPLIANCE'],
    'u-okonkwo': ['GR-RC-MGR', 'GR-RC-ANALYST'],
  };
  (state.people || []).forEach((p) => {
    p.governanceRoleIds = map[p.id] || ['GR-RC-ANALYST'];
  });
}

function buildPolicies() {
  return [
    {
      id: 'GOV-POL-001',
      name: 'High Materiality Regulatory Change Approval',
      description: 'Four-eyes and functional review for high materiality regulatory changes.',
      entityTypes: ['Regulatory Change', 'Impact Assessment'],
      materialityThreshold: 'High',
      requiredRoles: ['GR-COMPLIANCE', 'GR-RISK', 'GR-HORC'],
      approvalSequence: ['Compliance Review', 'Risk / Control Review', 'Head of Regulatory Change Approval'],
      makerCheckerRequired: true,
      executiveApprovalRequired: false,
      committeeRequired: true,
      attestationRequired: true,
      active: true,
    },
    {
      id: 'GOV-POL-002',
      name: 'Medium Materiality Change Approval',
      entityTypes: ['Regulatory Change'],
      materialityThreshold: 'Medium',
      requiredRoles: ['GR-COMPLIANCE', 'GR-RC-MGR'],
      approvalSequence: ['Compliance Review', 'Regulatory Change Manager Approval'],
      makerCheckerRequired: true,
      executiveApprovalRequired: false,
      committeeRequired: false,
      attestationRequired: false,
      active: true,
    },
    {
      id: 'GOV-POL-EVIDENCE',
      name: 'Evidence Independent Review',
      entityTypes: ['Evidence'],
      materialityThreshold: 'Low',
      makerCheckerRequired: true,
      active: true,
    },
  ];
}

function buildCommittees() {
  return [
    {
      id: 'RCC-001',
      name: 'Regulatory Change Committee',
      purpose: 'Oversight of high materiality regulatory change implementation',
      meetingCadenceMock: 'Monthly',
      materialityThreshold: 'High',
      memberIds: ['u-smith', 'u-reed', 'u-cole', 'u-grant', 'u-walker'],
      active: true,
    },
  ];
}

function buildDelegations() {
  return [
    {
      id: 'DEL-001',
      delegatorId: 'u-smith',
      delegateId: 'u-reed',
      startDate: '2026-10-01',
      endDate: '2026-10-15',
      scope: 'Medium materiality Regulatory Changes',
      maxMateriality: 'Medium',
      reason: 'Annual leave — compliance coverage',
      status: 'Active',
    },
  ];
}

function buildEscalationRules() {
  return [
    { id: 'ESC-001', materiality: 'High', stage: 'approval', overdueDays: 2, escalateToRoleId: 'GR-HORC', level: 2 },
    { id: 'ESC-002', materiality: 'High', stage: 'approval', overdueDays: 5, escalateToRoleId: 'GR-EXEC', level: 3 },
  ];
}

function buildApprovalChains() {
  return [
    {
      id: 'AC-CHG-001',
      entityType: 'Regulatory Change',
      entityId: 'CHG-001',
      policyId: 'GOV-POL-001',
      status: 'In Progress',
      committeeReviewRequired: true,
      committeeId: 'RCC-001',
      committeeDecision: null,
      committeeReference: null,
      steps: [
        step('ACS-001-1', 1, 'Compliance Review', 'GR-COMPLIANCE', 'u-jones', 'Approved', '2026-10-09', '2026-10-09', 'Applicable confirmed'),
        step('ACS-001-2', 2, 'Risk / Control Review', 'GR-RISK', 'u-grant', 'Approved', '2026-10-10', '2026-10-10', 'Control mapping reviewed'),
        step('ACS-001-3', 3, 'Legal Review', 'GR-LEGAL', 'u-cole', 'Skipped', null, null, 'Not required for this change'),
        step('ACS-001-4', 4, 'Head of Regulatory Change Approval', 'GR-HORC', 'u-smith', 'Pending', '2026-10-12', null, null),
        step('ACS-001-5', 5, 'Executive acknowledgement', 'GR-EXEC', null, 'Skipped', null, null, 'Not required per policy'),
      ],
    },
    {
      id: 'AC-CHG-010',
      entityType: 'Regulatory Change',
      entityId: 'CHG-010',
      policyId: 'GOV-POL-001',
      status: 'In Progress',
      committeeReviewRequired: false,
      steps: [
        step('ACS-010-1', 1, 'Compliance Review', 'GR-COMPLIANCE', 'u-reed', 'Pending', '2026-10-05', null, null),
      ],
    },
    {
      id: 'AC-IA-0042',
      entityType: 'Impact Assessment',
      entityId: 'IA-0042',
      policyId: 'GOV-POL-001',
      status: 'Not Started',
      steps: [
        step('ACS-IA-1', 1, 'Business review', 'GR-BUS-OWNER', 'u-shah', 'Not Started', '2026-10-14', null, null),
        step('ACS-IA-2', 2, 'Compliance review', 'GR-COMPLIANCE', 'u-jones', 'Not Started', '2026-10-16', null, null),
        step('ACS-IA-3', 3, 'Head of Regulatory Change approval', 'GR-HORC', 'u-smith', 'Not Started', '2026-10-18', null, null),
      ],
    },
  ];
}

function step(id, sequence, name, roleId, assigneeId, status, dueDate, completedDate, comments) {
  return { id, sequence, name, roleId, assigneeId, status, dueDate, completedDate, decision: status, comments };
}

function buildAttestations() {
  return [
    {
      id: 'ATT-CHG-001',
      entityType: 'Regulatory Change',
      entityId: 'CHG-001',
      attestationType: 'Final Implementation',
      statement: 'Implementation actions associated with CHG-001 have been completed and supporting evidence independently reviewed.',
      attestedById: null,
      roleId: 'GR-HORC',
      attestedAt: null,
      status: 'Pending',
      expiryDate: '2027-01-01',
      supportingEvidenceIds: ['EVD-009'],
      comments: null,
    },
    {
      id: 'ATT-OBL-0142',
      entityType: 'Obligation',
      entityId: 'OBL-0142',
      attestationType: 'Periodic obligation review',
      statement: 'OBL-0142 remains correctly implemented and mapped to current controls.',
      attestedById: 'u-grant',
      roleId: 'GR-RISK',
      attestedAt: '2026-09-15',
      status: 'Attested',
      expiryDate: '2027-03-31',
      supportingEvidenceIds: ['EVD-009'],
      comments: 'Quarterly attestation (mock)',
    },
  ];
}

function buildControlTests() {
  return [
    {
      id: 'CT-CTRL-022-01',
      controlId: 'CTRL-022',
      testType: 'Design & operating effectiveness',
      testPeriod: 'Q3 2026',
      testerId: 'u-walsh',
      testDate: '2026-09-20',
      result: 'Pass with Observations',
      sampleSizeMock: 25,
      findings: 'Minor MI lag on cohort refresh — remediation tracked under ACT-018.',
      evidenceIds: ['EVD-009'],
      remediationActionIds: ['ACT-018'],
    },
    {
      id: 'CT-CTRL-031-FAIL',
      controlId: 'CTRL-031',
      testType: 'Scenario test',
      testPeriod: 'H1 2026',
      testerId: 'u-walker',
      testDate: '2026-08-01',
      result: 'Fail',
      sampleSizeMock: 3,
      findings: 'IBS scenario test incomplete — tolerance breach not evidenced.',
      evidenceIds: ['EVD-031'],
      remediationActionIds: ['ACT-031'],
    },
  ];
}

function buildExceptions() {
  return [
    {
      id: 'EXC-ACT-031',
      entityType: 'Action',
      entityId: 'ACT-031',
      type: 'Temporary implementation waiver',
      reason: 'Third-party test environment unavailable — defer scenario test by 30 days.',
      requestedById: 'u-walker',
      requestedAt: '2026-09-28',
      approverId: 'u-reed',
      expiryDate: '2026-10-28',
      status: 'Approved',
      conditions: 'Complete ACT-031 before expiry; report to OR committee.',
      linkedRiskId: 'RSK-008',
      residualRisk: 'Medium',
    },
    {
      id: 'EXC-RISK-ACCEPT-001',
      entityType: 'Action',
      entityId: 'ACT-019',
      type: 'Risk acceptance',
      reason: 'Effective date precedes completion — temporary acceptance of implementation gap.',
      requestedById: 'u-shah',
      requestedAt: '2026-10-01',
      approverId: 'u-smith',
      expiryDate: '2026-11-01',
      status: 'Approved',
      conditions: 'Complete remediation by 2026-11-15',
      linkedRiskId: 'RSK-012',
      residualRisk: 'Low',
    },
  ];
}

function buildEscalations() {
  return [
    {
      id: 'ESC-REC-001',
      entityType: 'Regulatory Change',
      entityId: 'CHG-010',
      level: 2,
      escalatedToId: 'u-smith',
      reason: 'High materiality approval overdue',
      timestamp: '2026-10-07T09:00:00Z',
      outstandingDays: 3,
    },
  ];
}

function enrichEntities(state) {
  const ch1 = state.changes.find((c) => c.id === 'CHG-001');
  if (ch1) {
    ch1.governancePolicyId = 'GOV-POL-001';
    ch1.accountableExecutiveId = 'u-smith';
    ch1.raci = {
      responsible: { personId: 'u-shah', label: 'Consumer Duty Lead' },
      accountable: { personId: 'u-smith', label: 'Head of Regulatory Change' },
      consulted: [
        { personId: 'u-cole', label: 'General Counsel' },
        { personId: 'u-grant', label: 'Risk & Controls Lead' },
      ],
      informed: [{ teamId: 'team-product', label: 'Product / Operations owners' }],
    };
    ch1.governanceStatus = 'Pending Approval';
    ch1.closureStatus = 'Open';
    ch1.makerCheckerRequired = true;
  }

  const ia = state.assessments.find((a) => a.id === 'IA-0042');
  if (ia) {
    ia.makerCheckerRequired = true;
    ia.businessSubmitterId = 'u-shah';
    ia.submittedById = null;
    ia.reviewHistory = [];
  }

  const ev9 = state.evidence.find((e) => e.id === 'EVD-009');
  if (ev9) {
    ev9.reviewStatus = 'Submitted';
    ev9.approvalStatus = 'Submitted';
    ev9.ownerId = 'u-walsh';
    ev9.uploadedById = 'u-walsh';
    ev9.reviewerId = 'u-grant';
    ev9.reviewDueDate = '2026-10-14';
    ev9.expiryDate = '2027-11-01';
  }

  const evExp = state.evidence.find((e) => e.id === 'EVD-031');
  if (evExp) {
    evExp.reviewStatus = 'Accepted';
    evExp.expiryDate = '2026-09-01';
    evExp.reviewDueDate = '2026-09-01';
  }

  (state.obligations || []).forEach((o) => {
    if (o.id === 'OBL-0142') {
      o.reviewFrequency = 'Quarterly';
      o.nextReviewDate = '2027-01-15';
      o.reviewerId = 'u-grant';
      o.lastReviewOutcome = 'Satisfactory';
    }
  });

  (state.controls || []).forEach((c) => {
    if (c.id === 'CTRL-022') {
      c.reviewFrequency = 'Semi-Annual';
      c.nextReviewDate = '2027-03-01';
      c.lastReviewDate = '2026-09-20';
      c.effectivenessStatus = 'Effective';
      c.reviewerId = 'u-grant';
    }
    if (c.id === 'CTRL-031') {
      c.effectivenessStatus = 'Partially Effective';
      c.lastTestId = 'CT-CTRL-031-FAIL';
    }
  });

  const p1 = state.publications.find((p) => p.id === 'PUB-001');
  if (p1?.reanalysisRequired) {
    const ch = ch1;
    if (ch) ch.governanceReviewRequired = true;
    p1.versionImpactReview = null;
  }
}
