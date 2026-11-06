/**
 * Operational workflow metadata layered onto core seed (DEMO).
 */
import { DEMO_TODAY } from './workflow-helpers.js';
import { applyDemoNarrative } from './seed-demo-narrative.js';
import { applyIngestionSeed } from './ingestion-seed.js';
import { applyGovernanceSeed } from './governance-seed.js';
import { applyAiGovernanceSeed } from './ai-governance-seed.js';
import { applyAssuranceSeed } from './assurance-seed.js';
import { applyPlatformSeed } from './platform/platform-seed.js';
import { applyAiRuntimeSeed } from './ai-runtime/ai-runtime-seed.js';

export const TEAMS = [
  { id: 'team-rc', name: 'Regulatory Change' },
  { id: 'team-compliance', name: 'Compliance' },
  { id: 'team-legal', name: 'Legal' },
  { id: 'team-risk', name: 'Risk' },
  { id: 'team-ops', name: 'Operations' },
  { id: 'team-product', name: 'Product' },
  { id: 'team-tech', name: 'Technology' },
  { id: 'team-audit', name: 'Internal Audit' },
];

/** Canonical owners/reviewers for operational workflows; legacy `users` in seed-data is display-only compat. */
export const PEOPLE = [
  { id: 'u-smith', name: 'Sarah Mitchell', title: 'Head of Regulatory Change', teamId: 'team-rc', email: 'sarah.mitchell@demo.forgeniq' },
  { id: 'u-reed', name: 'Daniel Reed', title: 'Compliance Manager', teamId: 'team-compliance', email: 'daniel.reed@demo.forgeniq' },
  { id: 'u-shah', name: 'Priya Shah', title: 'Consumer Duty Lead', teamId: 'team-compliance', email: 'priya.shah@demo.forgeniq' },
  { id: 'u-walker', name: 'James Walker', title: 'Operational Resilience Lead', teamId: 'team-ops', email: 'james.walker@demo.forgeniq' },
  { id: 'u-cole', name: 'Rebecca Cole', title: 'General Counsel', teamId: 'team-legal', email: 'rebecca.cole@demo.forgeniq' },
  { id: 'u-grant', name: 'Michael Grant', title: 'Risk & Controls Lead', teamId: 'team-risk', email: 'michael.grant@demo.forgeniq' },
  { id: 'u-walsh', name: 'Emma Walsh', title: 'Control Owner', teamId: 'team-risk', email: 'emma.walsh@demo.forgeniq' },
  { id: 'u-jones', name: 'Sarah Jones', title: 'Compliance Officer', teamId: 'team-compliance', email: 'sarah.jones@demo.forgeniq' },
  { id: 'u-okonkwo', name: 'James Okonkwo', title: 'Regulatory Change Manager', teamId: 'team-rc', email: 'james.okonkwo@demo.forgeniq' },
];

export function buildOrgProfile() {
  return {
    version: 'ORG-DEMO-04',
    name: 'FORGENIQ Bank Group (DEMO)',
    legalEntities: ['FORGENIQ Bank UK Ltd', 'FORGENIQ Finance Services Ltd'],
    jurisdictions: ['United Kingdom'],
    products: ['Retail current accounts', 'Savings', 'Personal lending', 'Credit cards', 'SME banking'],
    customerTypes: ['Retail customers', 'Vulnerable customers', 'SMEs'],
    businessLines: ['Retail Banking', 'Business Banking', 'Lending'],
    functions: ['Compliance', 'Risk', 'Operations', 'Product', 'Technology', 'Customer Service', 'Legal'],
    permissions: [
      'FCA Authorised — Retail deposits and lending',
      'FCA Authorised — Payment services',
      'PRA — Deposit-taking (UK entity)',
    ],
    regulators: ['FCA', 'PRA'],
  };
}

const RELATED_PUBS = [
  { fromId: 'PUB-005', toId: 'PUB-014', relationshipType: 'Finalises consultation', similarityScore: 82, reason: 'DEMO: Cloud outsourcing consultation precedes policy statement on same topic.', date: '2025-09-01' },
  { fromId: 'PUB-005', toId: 'PUB-002', relationshipType: 'Same regulatory topic', similarityScore: 71, reason: 'DEMO: Both address third-party and outsourcing obligations.', date: '2026-09-12' },
  { fromId: 'PUB-004', toId: 'PUB-008', relationshipType: 'Related guidance', similarityScore: 68, reason: 'DEMO: Financial crime controls thematic alignment.', date: '2026-04-22' },
  { fromId: 'PUB-001', toId: 'PUB-006', relationshipType: 'Related guidance', similarityScore: 75, reason: 'DEMO: Consumer Duty fair value and outcomes monitoring.', date: '2026-06-02' },
  { fromId: 'PUB-001', toId: 'PUB-010', relationshipType: 'Same regulatory topic', similarityScore: 79, reason: 'DEMO: Vulnerable customer outcomes under Consumer Duty.', date: '2026-02-14' },
  { fromId: 'PUB-003', toId: 'PUB-015', relationshipType: 'Updates', similarityScore: 84, reason: 'DEMO: IBS mapping expectations updated in SS4/26.', date: '2025-08-12' },
  { fromId: 'PUB-009', toId: 'PUB-002', relationshipType: 'Possible duplicate', similarityScore: 62, reason: 'DEMO: Overlapping outsourcing record-keeping themes — human review recommended.', date: '2026-09-12' },
];

const TRIAGE_BY_PUB = {
  'PUB-001': { triageStatus: 'Accepted', intakeAccepted: true, detectedAt: '2026-10-06T09:05:00Z', assignedReviewerId: 'u-shah', ownerId: 'u-shah', triageSlaDue: '2026-10-10', aiPriority: 'High', aiClassification: 'Consumer Duty / Outcomes' },
  'PUB-002': { triageStatus: 'Accepted', intakeAccepted: true, detectedAt: '2026-09-12T14:00:00Z', assignedReviewerId: 'u-reed', ownerId: 'u-reed', triageSlaDue: '2026-09-20', aiPriority: 'Medium', aiClassification: 'Third-Party / Outsourcing' },
  'PUB-003': { triageStatus: 'Accepted', intakeAccepted: true, detectedAt: '2026-08-20T11:30:00Z', assignedReviewerId: 'u-walker', ownerId: 'u-walker', triageSlaDue: '2026-08-28', aiPriority: 'High', aiClassification: 'Operational Resilience' },
  'PUB-004': { triageStatus: 'New', intakeAccepted: false, detectedAt: '2026-10-01T08:00:00Z', assignedReviewerId: null, ownerId: 'u-reed', triageSlaDue: '2026-10-09', aiPriority: 'High', aiClassification: 'Financial Crime' },
  'PUB-005': { triageStatus: 'Review Required', intakeAccepted: false, detectedAt: '2026-07-14T10:00:00Z', assignedReviewerId: 'u-smith', ownerId: 'u-smith', triageSlaDue: '2026-10-05', aiPriority: 'Medium', aiClassification: 'Third-Party Risk' },
  'PUB-009': { triageStatus: 'Assigned', intakeAccepted: false, detectedAt: '2026-03-10T09:00:00Z', assignedReviewerId: 'u-reed', assignedTeamId: 'team-compliance', ownerId: 'u-reed', triageSlaDue: '2026-10-12', aiPriority: 'High', aiClassification: 'Third-Party Risk' },
};

export function applyOperationalSeed(state) {
  state.schemaVersion = 17;
  state.mockIngestionRunCounter = 0;
  state.teams = TEAMS;
  state.people = PEOPLE;
  state.orgProfile = buildOrgProfile();
  state.currentDemoUserId = 'u-smith';
  state.notificationReadIds = [];
  state.relatedPublications = RELATED_PUBS;

  state.org = {
    ...state.org,
    name: state.orgProfile.name,
    entities: state.orgProfile.legalEntities,
    jurisdictions: state.orgProfile.jurisdictions,
    products: state.orgProfile.products,
    customerTypes: state.orgProfile.customerTypes,
    businessLines: state.orgProfile.businessLines,
    departments: state.orgProfile.functions,
    permissions: state.orgProfile.permissions,
    regulators: state.orgProfile.regulators,
  };

  state.publications.forEach((p) => {
    const t = TRIAGE_BY_PUB[p.id] || defaultTriage(p);
    Object.assign(p, t);
    p.aiRelevanceScore = p.applicabilityConfidence ?? 0;
    p.aiGeneratedAt = p.detectedAt || `${p.publishedDate}T09:00:00Z`;
    p.aiHumanReviewStatus = p.intakeAccepted ? 'Human accepted' : p.triageStatus === 'New' ? 'AI recommended' : 'Review required';
    p.sourceLabel = p.regulator === 'FCA' ? 'FCA Publications (mock)' : 'PRA Publications (mock)';
    if (!p.applicabilityDue) p.applicabilityDue = addDays(p.publishedDate, 14);
  });

  state.changes.forEach((c) => {
    c.ownerId = c.scenario === 'consumer-duty' ? 'u-okonkwo' : c.scenario === 'op-resilience' ? 'u-walker' : 'u-reed';
    c.reviewerId = 'u-smith';
    c.accountableExecutiveId = 'u-smith';
    c.assignedTeamId = 'team-rc';
    c.dueDate = c.dueDate || c.effectiveDate;
    c.aiGovernance = aiGov(c.applicabilityRecommendation, c.applicabilityConfidence, c.applicabilityReasoning, c.sourceCitation, c.publicationId);
  });

  state.assessments.forEach((a) => {
    a.ownerId =
      a.owner === 'James Okonkwo'
        ? 'u-okonkwo'
        : a.owner === 'James Walker' || a.owner === 'Michael Chen'
          ? 'u-walker'
          : a.owner === 'Priya Sharma'
            ? 'u-shah'
            : 'u-okonkwo';
    a.reviewerId = 'u-smith';
    a.approverId = 'u-smith';
    a.accountableExecutiveId = 'u-smith';
    a.assignedTeamId = 'team-rc';
    a.approvalStatus = a.status === 'Implementation' ? 'Approved' : a.status === 'Review' ? 'Submitted for Review' : 'Draft';
    a.submittedBy = a.status !== 'Draft' ? 'James Okonkwo' : null;
    a.submittedDate = a.status !== 'Draft' ? '2026-10-18' : null;
  });

  state.obligations.forEach((o) => {
    o.ownerId =
      o.owner === 'Priya Sharma' ? 'u-shah' : o.owner === 'James Walker' || o.owner === 'Michael Chen' ? 'u-walker' : 'u-reed';
    o.reviewerId = 'u-grant';
    o.reviewDate = o.effectiveDate;
  });

  state.actions.forEach((a) => {
    a.ownerId =
      a.owner === 'Emma Walsh'
        ? 'u-walsh'
        : a.owner === 'James Okonkwo'
          ? 'u-okonkwo'
          : a.owner === 'James Walker' || a.owner === 'Michael Chen'
            ? 'u-walker'
            : a.owner === 'Priya Sharma'
              ? 'u-shah'
              : 'u-shah';
    a.assignedTeamId = 'team-rc';
    if (a.id === 'ACT-018') a.reviewerId = 'u-smith';
  });

  if (state.publicationAnalysis?.['PUB-001']) {
    state.publicationAnalysis['PUB-001'].aiGovernance = aiGov('Applicable', 87, state.publicationAnalysis['PUB-001'].reasoning, 'FCA PS26/14 §3.12–3.18', 'PUB-001');
    state.publicationAnalysis['PUB-001'].orgFactors = orgFactorBullets(state.orgProfile);
  }

  return applyAiRuntimeSeed(
    applyPlatformSeed(
      applyAssuranceSeed(applyAiGovernanceSeed(applyGovernanceSeed(applyIngestionSeed(applyDemoNarrative(state)))))
    )
  );
}

function defaultTriage(p) {
  const accepted = ['Complete', 'Historic', 'In Implementation', 'Impact Review'].includes(p.workflowStatus);
  return {
    triageStatus: accepted ? 'Accepted' : p.workflowStatus === 'New' ? 'New' : 'AI Analysed',
    intakeAccepted: accepted,
    detectedAt: `${p.publishedDate}T09:15:00Z`,
    assignedReviewerId: null,
    ownerId: 'u-reed',
    triageSlaDue: addDays(p.publishedDate, 7),
    aiPriority: p.priority || 'Medium',
    aiClassification: p.topic,
  };
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function aiGov(recommendation, confidence, reasoning, citation, pubId) {
  return {
    recommendation,
    confidence,
    reasoning,
    citation,
    publicationId: pubId,
    humanReviewStatus: 'AI recommended',
    generatedAt: '2026-10-05T09:42:00Z',
    modelVersion: 'RI-DEMO-2.1',
    orgProfileVersion: 'ORG-DEMO-04',
  };
}

export function orgFactorBullets(profile) {
  return [
    `Legal entities: ${profile.legalEntities.join(', ')}`,
    `Business lines: ${profile.businessLines.join(', ')}`,
    `Products: ${profile.products.slice(0, 3).join(', ')}…`,
    `Regulatory permissions: ${profile.permissions[0]}`,
  ];
}

export function relatedForPublication(pubId) {
  return RELATED_PUBS.filter((r) => r.fromId === pubId || r.toId === pubId);
}
