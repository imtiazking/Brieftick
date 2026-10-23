/**
 * Demo walkthrough definitions — navigation only; does not mutate workflow state on start.
 */
export const DEMO_JOURNEYS = {
  'consumer-duty': {
    id: 'consumer-duty',
    scenarioId: 'consumer-duty',
    title: 'Consumer Duty',
    subtitle: 'From regulatory publication detection through implementation and evidence.',
    flow: 'Triage → Regulatory Change → Applicability → Impact Assessment → Governance → Implementation → Evidence → Reporting',
    steps: [
      { label: 'Regulatory Intake', href: '#/intake', detail: 'Review incoming FCA publication and AI relevance classification.' },
      { label: 'Regulatory Publication PUB-001', href: '#/publication/PUB-001', detail: 'Executive summary, source material, and extracted regulatory changes.' },
      { label: 'Publication source', href: '#/publication/PUB-001/source', detail: 'Mock regulatory evidence — FCA PS26/14 (DEMO text).' },
      { label: 'Regulatory Change CHG-001', href: '#/change/CHG-001', detail: 'What changed, AI interpretation, human applicability decision.' },
      { label: 'Impact Assessment IA-0042', href: '#/assessment/IA-0042', detail: 'Impact on products, controls, and implementation plan.' },
      { label: 'Obligation OBL-0142', href: '#/obligation/OBL-0142', detail: 'Regulatory obligation and governance mapping.' },
      { label: 'Control CTRL-022', href: '#/control/CTRL-022', detail: 'Monitoring control supporting the obligation.' },
      { label: 'Action ACT-018', href: '#/action/ACT-018', detail: 'Implementation action — owner, due date, status.' },
      { label: 'Evidence EVD-009', href: '#/evidence/EVD-009', detail: 'Supporting evidence for outcome monitoring.' },
      { label: 'Executive Summary', href: '#/reports/executive', detail: 'Management view of exposure and implementation health.' },
    ],
    walkthrough: [
      { title: 'Regulatory Intake', body: 'Review the incoming FCA publication and see why FORGENIQ considers it relevant to your organisation profile.', next: '#/intake' },
      { title: 'Regulatory Publication', body: 'Review the source, AI interpretation, identified regulatory changes, and supporting citations.', next: '#/publication/PUB-001' },
      { title: 'Regulatory Change', body: 'Understand what changed in the rule, the AI applicability recommendation, and the recorded human decision.', next: '#/change/CHG-001' },
      { title: 'Applicability', body: 'Confirm how the organisation assessed applicability versus the AI recommendation.', next: '#/change/CHG-001' },
      { title: 'Impact Assessment', body: 'Review material impacts, owners, and approval workflow for implementation.', next: '#/assessment/IA-0042' },
      { title: 'Governance mapping', body: 'Follow obligations through policies, risks, and controls.', next: '#/obligation/OBL-0142' },
      { title: 'Implementation & evidence', body: 'Track remediation actions and linked evidence.', next: '#/action/ACT-018' },
      { title: 'Management reporting', body: 'Summarise regulatory exposure and implementation position for executives.', next: '#/reports/executive' },
    ],
    startHref: '#/intake',
  },
  'op-resilience': {
    id: 'op-resilience',
    scenarioId: 'op-resilience',
    title: 'Operational Resilience',
    subtitle: 'Important business services, impact tolerances, testing, and remediation.',
    flow: 'Triage → PRA publication → Change → Impact Assessment → Obligation → Action → Evidence → Reporting',
    steps: [
      { label: 'Regulatory Intake', href: '#/intake', detail: 'PRA supervisory statement in the intake queue.' },
      { label: 'Regulatory Publication PUB-003', href: '#/publication/PUB-003', detail: 'Operational resilience supervisory expectations (mock).' },
      { label: 'Regulatory Change CHG-010', href: '#/change/CHG-010', detail: 'Impact tolerance testing frequency and IBS implications.' },
      { label: 'Impact Assessment IA-0038', href: '#/assessment/IA-0038', detail: 'Resilience impact assessment awaiting approval.' },
      { label: 'Obligation OBL-0088', href: '#/obligation/OBL-0088', detail: 'Map and test impact tolerances for important business services.' },
      { label: 'Action ACT-031', href: '#/action/ACT-031', detail: 'Overdue remediation — IBS scenario testing.' },
      { label: 'Evidence EVD-031', href: '#/evidence/EVD-031', detail: 'Workshop notes supporting testing activity.' },
      { label: 'Executive Summary', href: '#/reports/executive', detail: 'Scenario-filtered management summary.' },
    ],
    walkthrough: [
      { title: 'Regulatory Intake', body: 'Locate the PRA operational resilience publication accepted into the change programme.', next: '#/intake' },
      { title: 'Regulatory Publication', body: 'Review mock PRA source text and AI interpretation of resilience requirements.', next: '#/publication/PUB-003' },
      { title: 'Regulatory Change', body: 'See how FORGENIQ linked the rule change to important business services.', next: '#/change/CHG-010' },
      { title: 'Impact Assessment', body: 'Review impact tolerances and approval status.', next: '#/assessment/IA-0038' },
      { title: 'Obligation & governance', body: 'Trace obligations to policies, risks, and controls.', next: '#/obligation/OBL-0088' },
      { title: 'Implementation', body: 'Review overdue remediation and evidence gaps.', next: '#/action/ACT-031' },
      { title: 'Audit & reporting', body: 'Confirm decision history and management visibility.', next: '#/reports/executive' },
    ],
    startHref: '#/intake',
  },
  'regulatory-ingestion': {
    id: 'regulatory-ingestion',
    scenarioId: 'all',
    title: 'Regulatory Ingestion',
    subtitle: 'How mock regulatory sources enter FORGENIQ before triage and governance.',
    flow: 'Sources → Mock run → Raw item → Source Document → Sections → AI candidate → Human review → Intake',
    steps: [
      { label: 'Ingestion Monitor', href: '#/ingestion', detail: 'Connector health and recent runs (MOCK CONNECTOR).' },
      { label: 'Run mock ingestion', href: '#/ingestion', detail: 'Deterministic Design Lab processing — no live feeds.' },
      { label: 'Version update case', href: '#/ingestion/item/RAW-FCA-PS26-14-V2', detail: 'PS26/14 V1 → V2 with re-analysis flag.' },
      { label: 'Duplicate case', href: '#/ingestion/item/RAW-FCA-PS26-14-DUP', detail: 'Exact duplicate suppressed.' },
      { label: 'Failure & retry', href: '#/ingestion/item/RAW-FCA-FAIL-001', detail: 'Retrieval failure and mock retry.' },
      { label: 'Source Document', href: '#/source-document/DOC-FCA-PS26-14-V2', detail: 'Parsed sections and provenance.' },
      { label: 'Consumer Duty provenance', href: '#/change/CHG-001', detail: 'Trace Regulatory Change to source ingestion.' },
      { label: 'Candidate review', href: '#/ingestion/candidate/CC-ING-001', detail: 'AI candidate → human Regulatory Change.' },
      { label: 'Regulatory Intake', href: '#/intake', detail: 'Publications ready for triage after ingestion.' },
    ],
    walkthrough: [
      { title: 'Ingestion Monitor', body: 'Review FCA and PRA mock connectors and recent ingestion runs.', next: '#/ingestion' },
      { title: 'Mock ingestion', body: 'Run a deterministic connector execution to process pending mock items.', next: '#/ingestion' },
      { title: 'Provenance', body: 'Follow a Regulatory Change back through source sections and ingestion metadata.', next: '#/change/CHG-001' },
      { title: 'Governance', body: 'Review AI-extracted candidate changes before they become Regulatory Changes.', next: '#/ingestion/candidate/CC-ING-001' },
    ],
    startHref: '#/ingestion',
  },
  'enterprise-governance': {
    id: 'enterprise-governance',
    scenarioId: 'consumer-duty',
    title: 'Enterprise Governance',
    subtitle: 'Approvals, maker/checker, evidence assurance, attestation and controlled closure.',
    flow: 'CHG-001 → Governance policy → Approval chain → IA approval → Evidence review → Attestation → Closure',
    steps: [
      { label: 'Regulatory Change CHG-001', href: '#/change/CHG-001', detail: 'Governance panel — RACI, materiality, approval chain, closure checklist.' },
      { label: 'Governance Register', href: '#/governance', detail: 'Pending approvals, attestations and exceptions.' },
      { label: 'Impact Assessment IA-0042', href: '#/assessment/IA-0042', detail: 'Submit and approve with maker/checker (switch demo persona).' },
      { label: 'Action ACT-018', href: '#/action/ACT-018', detail: 'Complete implementation work before closure.' },
      { label: 'Evidence EVD-009', href: '#/evidence/EVD-009', detail: 'Independent evidence review and assurance status.' },
      { label: 'Attestation ATT-CHG-001', href: '#/attestation/ATT-CHG-001', detail: 'Final implementation attestation before close.' },
      { label: 'Close CHG-001', href: '#/change/CHG-001#governance-CHG-001', detail: 'Closure checklist and governed close.' },
      { label: 'Executive Summary', href: '#/reports/executive', detail: 'Executive governance signals.' },
    ],
    walkthrough: [
      { title: 'Governance on the change', body: 'Review materiality-based policy, RACI and the approval chain on CHG-001.', next: '#/change/CHG-001' },
      { title: 'Maker/checker', body: 'Submit IA-0042 as Priya Shah, then switch persona to approve as Head of Regulatory Change.', next: '#/assessment/IA-0042' },
      { title: 'Evidence assurance', body: 'Accept EVD-009 after independent review — existence is not proof of validation.', next: '#/evidence/EVD-009' },
      { title: 'Attestation & closure', body: 'Complete final attestation and close only when the checklist is satisfied.', next: '#/attestation/ATT-CHG-001' },
    ],
    startHref: '#/change/CHG-001',
  },
  'ai-governance': {
    id: 'ai-governance',
    scenarioId: 'consumer-duty',
    title: 'AI Governance & Explainability',
    subtitle: 'Traceable AI recommendations, claims, grounding, human review and model provenance.',
    flow: 'PUB-001 → CHG-001 AI Analysis → claims/citations → human decision → CHG-003 override → AI Governance register → oversight',
    steps: [
      { label: 'Regulatory Change CHG-001', href: '#/change/CHG-001', detail: 'AI recommendation vs human decision vs governance approval.' },
      { label: 'AI Analysis AIA-CHG-001-V2', href: '#/ai-analysis/AIA-CHG-001-V2', detail: 'Claims, citations, confidence and grounding.' },
      { label: 'Source citation', href: '#/publication/PUB-001/source#3.12-3.18', detail: 'Deep-link to supporting mock source section.' },
      { label: 'Human override CHG-003', href: '#/change/CHG-003', detail: 'Original AI vs modified human decision.' },
      { label: 'Low confidence CHG-013', href: '#/ai-analysis/AIA-CHG-013-V1', detail: 'Mandatory review below 70% confidence.' },
      { label: 'Unsupported claim candidate', href: '#/ai-analysis/AIA-CC-ING-001-V1', detail: 'Quality gate failure and grounding warning.' },
      { label: 'Source conflict CHG-010', href: '#/ai-analysis/AIA-CHG-010-V1', detail: 'Conflicting source sections — human interpretation.' },
      { label: 'Model comparison', href: '#/ai-analysis/AIA-CHG-001-V1', detail: 'V1 vs V2 after MODEL-RI-2.2 upgrade.' },
      { label: 'AI Governance register', href: '#/ai-governance', detail: 'Use cases, models and analysis health.' },
      { label: 'AI Oversight report', href: '#/reports/ai-oversight', detail: 'Human review and override metrics.' },
    ],
    walkthrough: [
      { title: 'CHG-001 AI story', body: 'Review a well-grounded applicability recommendation with claim-level citations.', next: '#/change/CHG-001' },
      { title: 'Full analysis', body: 'Open the canonical AI Analysis record for provenance and claims.', next: '#/ai-analysis/AIA-CHG-001-V2' },
      { title: 'Human override', body: 'See how CHG-003 preserves the original AI output when humans modify the decision.', next: '#/change/CHG-003' },
      { title: 'Oversight', body: 'Review AI governance metrics and register.', next: '#/ai-governance' },
    ],
    startHref: '#/change/CHG-001',
  },
  'regulatory-assurance': {
    id: 'regulatory-assurance',
    scenarioId: 'consumer-duty',
    title: 'Regulatory Assurance & Board Reporting',
    subtitle: 'Implementation health, obligation coverage, evidence, findings, attestations and executive reporting.',
    flow: 'CHG-001 → Assurance → Obligation coverage → Control test → Evidence → Finding → Attestation → Assurance Review → Pack → Board → Period delta',
    steps: [
      { label: 'Regulatory Change CHG-001', href: '#/change/CHG-001#assurance-CHG-001', detail: 'Implementation health and assurance layers.' },
      { label: 'Obligation OBL-0142', href: '#/obligation/OBL-0142', detail: 'Coverage checks and coverage indicator.' },
      { label: 'Control CTRL-022', href: '#/control/CTRL-022', detail: 'Control assurance from latest test.' },
      { label: 'Control test CT-CTRL-022-01', href: '#/control-test/CT-CTRL-022-01', detail: 'Operating effectiveness result.' },
      { label: 'Evidence EVD-009', href: '#/evidence/EVD-009', detail: 'Evidence quality and ageing.' },
      { label: 'Finding FIND-CHG-001-001', href: '#/finding/FIND-CHG-001-001', detail: 'Remediation and independent validation.' },
      { label: 'Management attestation MAT-CHG-001-Q3', href: '#/management-attestation/MAT-CHG-001-Q3', detail: 'Qualified management attestation.' },
      { label: 'Assurance review AR-CHG-001-COMP', href: '#/assurance/AR-CHG-001-COMP', detail: 'Independent assurance opinion.' },
      { label: 'Assurance Pack PACK-CHG-001-001', href: '#/assurance-pack/PACK-CHG-001-001', detail: 'End-to-end evidence trail.' },
      { label: 'Board report', href: '#/reports/board', detail: 'Executive summary and decisions required.' },
      { label: 'Period changes', href: '#/reports/period-changes', detail: 'What changed since last committee?' },
    ],
    walkthrough: [
      { title: 'CHG-001 assurance', body: 'Review implementation health separate from governance approvals.', next: '#/change/CHG-001' },
      { title: 'Assurance opinion', body: 'Open the flagship independent assurance review.', next: '#/assurance/AR-CHG-001-COMP' },
      { title: 'Evidence pack', body: 'Trace regulatory source through to assurance opinion.', next: '#/assurance-pack/PACK-CHG-001-001' },
      { title: 'Board view', body: 'Present executive narrative and period deltas.', next: '#/reports/board' },
    ],
    startHref: '#/assurance',
  },
};

const GUIDE_KEY = 'ri-demo-guide-dismissed';
const WALK_KEY = 'ri-demo-walkthrough';

export function isGuideDismissed() {
  return localStorage.getItem(GUIDE_KEY) === '1';
}

export function dismissGuide() {
  localStorage.setItem(GUIDE_KEY, '1');
}

export function getWalkthroughState() {
  try {
    return JSON.parse(localStorage.getItem(WALK_KEY) || 'null');
  } catch {
    return null;
  }
}

export function startWalkthrough(journeyId) {
  const j = DEMO_JOURNEYS[journeyId];
  if (!j) return;
  localStorage.setItem(WALK_KEY, JSON.stringify({ journeyId, step: 0, active: true }));
  localStorage.removeItem(GUIDE_KEY);
}

export function stopWalkthrough() {
  localStorage.removeItem(WALK_KEY);
}

export function advanceWalkthrough() {
  const st = getWalkthroughState();
  if (!st?.active) return null;
  const j = DEMO_JOURNEYS[st.journeyId];
  if (!j) return null;
  const next = Math.min(st.step + 1, j.walkthrough.length - 1);
  const updated = { ...st, step: next };
  localStorage.setItem(WALK_KEY, JSON.stringify(updated));
  return j.walkthrough[next];
}

export function getActiveWalkthroughStep() {
  const st = getWalkthroughState();
  if (!st?.active) return null;
  const j = DEMO_JOURNEYS[st.journeyId];
  if (!j) return null;
  const step = j.walkthrough[st.step];
  return { journey: j, index: st.step, total: j.walkthrough.length, step };
}
