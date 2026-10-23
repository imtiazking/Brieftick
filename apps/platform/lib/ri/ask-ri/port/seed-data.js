/**
 * FORGENIQ Regulatory Intelligence Design Lab — central seed dataset.
 * DEMO / MOCK DATA — not factual live FCA/PRA content.
 */
import { syncGraphLinks } from './graph-sync.js';
import { applyOperationalSeed } from './seed-operational.js';

export const SCENARIOS = [
  { id: 'all', label: 'All Scenarios' },
  { id: 'consumer-duty', label: 'Consumer Duty', primary: true },
  { id: 'op-resilience', label: 'Operational Resilience' },
  { id: 'third-party', label: 'Third-Party Risk / Outsourcing' },
  { id: 'financial-crime', label: 'Financial Crime' },
];

export const MARKET_INTEL_URL = '/';

/** Design Lab product switcher labels (RI shell only — does not change production MI). */
export const PRODUCT_RI_LABEL = 'RI · Regulatory Intelligence';
export const PRODUCT_MI_LABEL = 'MI · Market Intelligence';
export const DOCUMENT_TITLE_RI = 'FORGENIQ RI — Regulatory Intelligence';

export function buildSeedState() {
  const org = {
    name: 'ABC Financial Group',
    entities: ['ABC Financial Ltd', 'ABC Payments Ltd'],
    jurisdictions: ['United Kingdom'],
    regulators: ['FCA', 'PRA'],
    permissions: ['FCA Authorised — Retail investments', 'FCA Authorised — Payment services', 'PRA — Deposit-taking (group entity)'],
    activities: ['Retail banking', 'Payments', 'Wealth advisory'],
    businessLines: ['Retail Banking', 'Payments', 'Wealth'],
    products: ['Current accounts', 'Savings', 'Investment ISAs', 'Payment wallets'],
    customerTypes: ['Retail', 'High-net-worth'],
    departments: ['Compliance', 'Risk', 'Operations', 'Technology', 'Conduct'],
  };

  const users = [
    { id: 'u1', name: 'Sarah Jones', role: 'Compliance Officer' },
    { id: 'u2', name: 'James Okonkwo', role: 'Regulatory Change Manager' },
    { id: 'u3', name: 'Priya Sharma', role: 'Head of Conduct' },
    { id: 'u4', name: 'Michael Chen', role: 'Risk Manager' },
    { id: 'u5', name: 'Emma Walsh', role: 'Control Owner' },
    { id: 'u6', name: 'Admin User', role: 'Administrator' },
  ];

  const publications = [
    pub('PUB-001', 'consumer-duty', 'FCA', 'FCA Consumer Duty supervisory update', 'PS26/14', 'Policy Statement', 'Consumer Duty / Customer Outcomes', '2026-10-06', '2027-01-01', null, 'High', 'Likely Applicable', 'Impact Review', 'Applicable', 89, true),
    pub('PUB-002', 'consumer-duty', 'FCA', 'FCA Handbook — SYSC amendments (outsourcing)', 'SYSC 8', 'Handbook Rule', 'Outsourcing / Third parties', '2026-09-12', '2026-12-01', null, 'Medium', 'Possibly Applicable', 'Awaiting Review', 'Possibly Applicable', 72, false),
    pub('PUB-003', 'op-resilience', 'PRA', 'Operational Resilience Supervisory Statement', 'SS4/26', 'Supervisory Statement', 'Operational Resilience', '2026-08-20', '2027-03-31', '2026-11-15', 'High', 'Likely Applicable', 'Assessment Required', 'Applicable', 85, false),
    pub('PUB-004', 'financial-crime', 'FCA', 'Financial crime systems and controls — Dear CEO', 'FCA/DCEO/2026/03', 'Letter', 'Financial Crime', '2026-10-01', null, null, 'High', 'Likely Applicable', 'New', 'Applicable', 81, false),
    pub('PUB-005', 'third-party', 'FCA', 'Critical third parties — consultation', 'CP26/8', 'Consultation Paper', 'Third-Party Risk', '2026-07-14', null, '2026-10-30', 'Medium', 'Possibly Applicable', 'Horizon', 'Not Assessed', 0, false),
    pub('PUB-006', 'consumer-duty', 'FCA', 'Consumer Duty — fair value assessment guidance', 'FG26/2', 'Finalised Guidance', 'Consumer Duty / Fair Value', '2026-06-02', '2026-09-01', null, 'Medium', 'Applicable', 'Complete', 'Applicable', 92, false),
    pub('PUB-007', 'op-resilience', 'PRA', 'Impact tolerances — implementation update', 'PRA/2026/12', 'Publication', 'Operational Resilience', '2026-05-18', '2026-11-01', null, 'Medium', 'Applicable', 'In Implementation', 'Applicable', 88, false),
    pub('PUB-008', 'financial-crime', 'FCA', 'Sanctions screening — good practice', 'PS26/9', 'Policy Statement', 'Sanctions', '2026-04-22', '2026-08-01', null, 'Low', 'Applicable', 'Complete', 'Applicable', 90, false),
    pub('PUB-009', 'third-party', 'PRA', 'Outsourcing and third-party risk — SS update', 'SS2/21 (amend)', 'Supervisory Statement', 'Third-Party Risk', '2026-03-10', '2027-06-01', '2026-09-01', 'High', 'Likely Applicable', 'Review', 'Possibly Applicable', 76, false),
    pub('PUB-010', 'consumer-duty', 'FCA', 'Vulnerable customers — outcomes monitoring', 'PS26/11', 'Policy Statement', 'Consumer Duty / Vulnerability', '2026-02-14', '2026-07-01', null, 'High', 'Applicable', 'Complete', 'Applicable', 87, false),
    pub('PUB-011', 'op-resilience', 'FCA', 'Operational incident reporting — DEPP update', 'DEPP 6.2', 'Handbook Rule', 'Operational Resilience', '2026-01-08', '2026-04-01', null, 'Low', 'Applicable', 'Complete', 'Not Applicable', 45, false),
    pub('PUB-012', 'financial-crime', 'FCA', 'Cryptoasset financial crime red flags', 'FG26/7', 'Finalised Guidance', 'Financial Crime / Crypto', '2025-11-20', '2026-02-01', null, 'Low', 'Not Applicable', 'Closed', 'Not Applicable', 94, false),
    pub('PUB-013', 'consumer-duty', 'FCA', 'Retail conduct data — supervisory expectations', 'SUP 16 Annex 4', 'Handbook Rule', 'Reporting', '2025-10-05', '2026-01-01', null, 'Medium', 'Applicable', 'Complete', 'Applicable', 91, false),
    pub('PUB-014', 'third-party', 'FCA', 'Cloud outsourcing — policy statement', 'PS25/22', 'Policy Statement', 'Cloud / Outsourcing', '2025-09-01', '2026-03-01', null, 'Medium', 'Applicable', 'Complete', 'Applicable', 86, false),
    pub('PUB-015', 'op-resilience', 'PRA', 'Important business services mapping', 'SS1/21', 'Supervisory Statement', 'Operational Resilience', '2025-08-12', '2025-12-31', null, 'High', 'Applicable', 'Complete', 'Applicable', 93, false),
    pub('PUB-016', 'financial-crime', 'PRA', 'Fraud — deposit-taking firms', 'PRA/2025/8', 'Publication', 'Financial Crime', '2025-07-01', '2025-11-01', null, 'Medium', 'Possibly Applicable', 'Complete', 'Possibly Applicable', 68, false),
    pub('PUB-017', 'consumer-duty', 'FCA', 'Closed product review — Consumer Duty', 'PS25/18', 'Policy Statement', 'Consumer Duty', '2025-06-15', '2025-10-01', null, 'Medium', 'Applicable', 'Historic', 'Applicable', 88, false),
    pub('PUB-018', 'third-party', 'FCA', 'Operational resilience — third party dependencies', 'FG25/4', 'Finalised Guidance', 'Third-Party Risk', '2025-05-01', '2025-09-01', null, 'Low', 'Applicable', 'Complete', 'Applicable', 84, false),
  ];

  const changes = [
    chgFull({
      id: 'CHG-001',
      publicationId: 'PUB-001',
      scenario: 'consumer-duty',
      title: 'Enhanced monitoring of customer outcomes',
      description: 'Firms must strengthen ongoing monitoring of customer outcomes and demonstrate remediation where poor outcomes are identified (DEMO).',
      sourceCitation: 'FCA PS26/14 §3.12–3.18',
      sourceSection: '3.12-3.18',
      topic: 'Consumer Duty / Customer Outcomes',
      materiality: 'High',
      effectiveDate: '2027-01-01',
      status: 'In implementation',
      applicabilityRecommendation: 'Applicable',
      applicabilityConfidence: 91,
      applicabilityDecision: 'Applicable',
      applicabilityReasoning: 'Retail lending and savings products fall within Consumer Duty outcome monitoring expectations for ABC Financial Ltd.',
      affectedEntities: ['ABC Financial Ltd'],
      affectedProducts: ['Current accounts', 'Savings', 'Investment ISAs'],
      affectedBusinessLines: ['Retail Banking'],
      affectedJurisdictions: ['United Kingdom'],
    }),
    chgFull({
      id: 'CHG-002',
      publicationId: 'PUB-001',
      scenario: 'consumer-duty',
      title: 'Customer cohort reporting requirements',
      description: 'Management information must segment outcomes by meaningful customer cohorts, including vulnerable customers (DEMO).',
      sourceCitation: 'FCA PS26/14 §3.14',
      sourceSection: '3.14',
      topic: 'Consumer Duty / MI',
      materiality: 'High',
      effectiveDate: '2027-01-01',
      status: 'Assessment in progress',
      applicabilityRecommendation: 'Applicable',
      applicabilityConfidence: 88,
      applicabilityDecision: 'Applicable',
      applicabilityReasoning: 'Cohort MI gaps identified in current Consumer Duty reporting.',
      affectedEntities: ['ABC Financial Ltd'],
      affectedProducts: ['Current accounts', 'Savings'],
      affectedBusinessLines: ['Retail Banking', 'Conduct'],
      affectedJurisdictions: ['United Kingdom'],
    }),
    chgFull({
      id: 'CHG-003',
      publicationId: 'PUB-001',
      scenario: 'consumer-duty',
      title: 'Evidence and governance expectations',
      description: 'Board and committee oversight must evidence challenge of outcome MI and remediation plans (DEMO).',
      sourceCitation: 'FCA PS26/14 §3.16',
      sourceSection: '3.16',
      topic: 'Governance',
      materiality: 'Medium',
      effectiveDate: '2027-01-01',
      status: 'Awaiting review',
      applicabilityRecommendation: 'Possibly Applicable',
      applicabilityConfidence: 74,
      applicabilityDecision: 'Review Required',
      applicabilityReasoning: 'Governance enhancements may be required depending on committee cadence and paper quality.',
      affectedEntities: ['ABC Financial Ltd'],
      affectedProducts: [],
      affectedBusinessLines: ['Conduct', 'Compliance'],
      affectedJurisdictions: ['United Kingdom'],
    }),
    chgFull({
      id: 'CHG-010',
      publicationId: 'PUB-003',
      scenario: 'op-resilience',
      title: 'Impact tolerance testing frequency',
      description: 'PRA clarifies testing cadence for important business services (DEMO).',
      sourceCitation: 'PRA SS4/26 §4.2',
      sourceSection: '4.2',
      topic: 'Operational Resilience',
      materiality: 'High',
      effectiveDate: '2027-03-31',
      status: 'Awaiting approval',
      applicabilityRecommendation: 'Applicable',
      applicabilityConfidence: 85,
      applicabilityDecision: 'Applicable',
      applicabilityReasoning: 'IBS mapping completed for core retail payments.',
      affectedEntities: ['ABC Financial Ltd'],
      affectedProducts: ['Payment wallets'],
      affectedBusinessLines: ['Payments', 'Operations'],
      affectedJurisdictions: ['United Kingdom'],
    }),
    chgFull({
      id: 'CHG-011',
      publicationId: 'PUB-002',
      scenario: 'third-party',
      title: 'SYSC 8 outsourcing record-keeping',
      description: 'Additional documentation for material outsourcing arrangements (DEMO).',
      sourceCitation: 'SYSC 8.1.8',
      sourceSection: '8.1.8',
      topic: 'Outsourcing',
      materiality: 'Medium',
      effectiveDate: '2026-12-01',
      status: 'In review',
      applicabilityRecommendation: 'Possibly Applicable',
      applicabilityConfidence: 72,
      applicabilityDecision: 'Possibly Applicable',
      applicabilityReasoning: 'ABC Payments Ltd maintains material cloud outsourcing.',
      affectedEntities: ['ABC Payments Ltd'],
      affectedProducts: ['Payment wallets'],
      affectedBusinessLines: ['Payments'],
      affectedJurisdictions: ['United Kingdom'],
    }),
    chgFull({
      id: 'CHG-012',
      publicationId: 'PUB-004',
      scenario: 'financial-crime',
      title: 'Transaction monitoring uplift',
      description: 'Dear CEO letter sets expectations on TM model validation (DEMO).',
      sourceCitation: 'FCA/DCEO/2026/03',
      sourceSection: '2.1',
      topic: 'Financial Crime',
      materiality: 'High',
      effectiveDate: '2026-12-15',
      status: 'Draft assessment',
      applicabilityRecommendation: 'Applicable',
      applicabilityConfidence: 81,
      applicabilityDecision: 'Applicable',
      applicabilityReasoning: 'Retail transaction volumes require validated TM models.',
      affectedEntities: ['ABC Financial Ltd'],
      affectedProducts: ['Current accounts'],
      affectedBusinessLines: ['Retail Banking'],
      affectedJurisdictions: ['United Kingdom'],
    }),
    chgFull({
      id: 'CHG-013',
      publicationId: 'PUB-009',
      scenario: 'third-party',
      title: 'Critical third party rules — draft',
      description: 'Consultation outcomes may extend oversight to CTIPs (DEMO).',
      sourceCitation: 'SS2/21 (amend) §1.3',
      sourceSection: '1.3',
      topic: 'Third-Party Risk',
      materiality: 'High',
      effectiveDate: '2027-06-01',
      status: 'Horizon',
      applicabilityRecommendation: 'Possibly Applicable',
      applicabilityConfidence: 76,
      applicabilityDecision: null,
      applicabilityReasoning: 'Pending consultation outcome.',
      affectedEntities: ['ABC Financial Group'],
      affectedProducts: [],
      affectedBusinessLines: ['Technology', 'Operations'],
      affectedJurisdictions: ['United Kingdom'],
    }),
  ];

  const assessments = [
    ia('IA-0042', 'CHG-001', 'PUB-001', 'consumer-duty', 'Consumer Duty outcome monitoring uplift', 'James Okonkwo', 'High', 'Draft', '2026-11-30', 'Sarah Jones', 'Priya Sharma', {
      aiSummary: 'Existing Consumer Duty monitoring requires enhancement. Current management information does not consistently evidence outcomes by customer cohort.',
      entities: ['ABC Financial Ltd'],
      units: ['Retail Banking', 'Conduct'],
      policies: ['POL-007'],
      risks: ['RSK-012'],
      controls: ['CTRL-022', 'CTRL-003', 'CTRL-011', 'CTRL-015', 'CTRL-019'],
      processes: ['Customer complaints handling', 'Product governance', 'MI production', 'Board reporting'],
    }),
    ia('IA-0038', 'CHG-010', 'PUB-003', 'op-resilience', 'Operational resilience impact tolerances', 'James Walker', 'High', 'Awaiting Approval', '2026-10-15', 'Sarah Mitchell', 'Michael Grant', {
      aiSummary: 'DEMO: Important business services for retail payments require updated impact tolerance testing, scenario evidence, and third-party dependency mapping.',
      entities: ['ABC Financial Ltd'],
      units: ['Payments', 'Operations'],
      policies: ['POL-003'],
      risks: ['RSK-008'],
      controls: ['CTRL-031'],
      processes: ['IBS scenario testing', 'Crisis management', 'Third-party oversight'],
    }),
    ia('IA-0035', 'CHG-011', 'PUB-002', 'third-party', 'SYSC 8 outsourcing documentation', 'James Okonkwo', 'Medium', 'Review', '2026-10-20', 'Sarah Jones', 'Priya Sharma', {}),
    ia('IA-0031', 'CHG-012', 'PUB-004', 'financial-crime', 'Transaction monitoring model validation', 'Sarah Jones', 'High', 'Draft', '2026-11-01', 'James Okonkwo', 'Sarah Jones', {}),
    ia('IA-0028', null, 'PUB-006', 'consumer-duty', 'Fair value assessment refresh', 'Priya Sharma', 'Medium', 'Complete', '2026-08-01', 'Sarah Jones', 'Priya Sharma', {}),
    ia('IA-0025', null, 'PUB-007', 'op-resilience', 'Impact tolerance implementation', 'Michael Chen', 'Medium', 'Approved', '2026-09-30', 'Sarah Jones', 'Michael Chen', {}),
    ia('IA-0022', null, 'PUB-010', 'consumer-duty', 'Vulnerable customer outcomes', 'Priya Sharma', 'High', 'Complete', '2026-06-30', 'Sarah Jones', 'Priya Sharma', {}),
    ia('IA-0019', null, 'PUB-014', 'third-party', 'Cloud outsourcing policy alignment', 'James Okonkwo', 'Medium', 'Complete', '2026-02-28', 'Sarah Jones', 'James Okonkwo', {}),
  ];

  const obligations = [];
  const oblTemplates = [
    ['OBL-0142', 'Monitor and evidence customer outcomes', 'PUB-001', 'CHG-001', 'IA-0042', 'ABC Financial Ltd', 'Priya Sharma', 'High', '2027-01-01', 'Partial', 'In Progress', 'consumer-duty'],
    ['OBL-0143', 'Remediate poor customer outcomes within defined timelines', 'PUB-001', 'CHG-001', 'IA-0042', 'ABC Financial Ltd', 'Priya Sharma', 'High', '2027-01-01', 'Partial', 'In Progress', 'consumer-duty'],
    ['OBL-0144', 'Report customer outcomes by meaningful cohorts', 'PUB-001', 'CHG-002', 'IA-0042', 'ABC Financial Ltd', 'Priya Sharma', 'High', '2027-01-01', 'Partial', 'In Progress', 'consumer-duty'],
    ['OBL-0110', 'Maintain fair value assessments for retail products', 'PUB-006', null, 'IA-0028', 'ABC Financial Ltd', 'Priya Sharma', 'Medium', '2026-09-01', 'Full', 'Complete', 'consumer-duty'],
    ['OBL-0088', 'Map and test impact tolerances for IBS', 'PUB-003', 'CHG-010', 'IA-0038', 'ABC Financial Ltd', 'James Walker', 'High', '2027-03-31', 'Partial', 'In Review', 'op-resilience'],
    ['OBL-0075', 'Maintain outsourcing register per SYSC 8', 'PUB-002', 'CHG-011', 'IA-0035', 'ABC Payments Ltd', 'James Okonkwo', 'Medium', '2026-12-01', 'Full', 'In Progress', 'third-party'],
    ['OBL-0062', 'Validate transaction monitoring models annually', 'PUB-004', 'CHG-012', 'IA-0031', 'ABC Financial Ltd', 'Sarah Jones', 'High', '2026-12-15', 'None', 'Draft', 'financial-crime'],
  ];
  oblTemplates.forEach((t) => obligations.push(obl(...t)));
  for (let i = 1; i <= 18; i++) {
    const id = `OBL-01${String(50 + i).padStart(2, '0')}`;
    if (obligations.some((o) => o.id === id)) continue;
    obligations.push(obl(id, `Demo regulatory obligation ${i} — compliance tracking`, 'PUB-013', null, null, 'ABC Financial Ltd', 'Sarah Jones', i % 3 === 0 ? 'High' : 'Medium', '2026-12-31', i % 4 === 0 ? 'None' : 'Partial', i % 5 === 0 ? 'Overdue' : 'Open', 'consumer-duty'));
  }

  const risks = [
    rsk('RSK-012', 'Poor customer outcomes not identified or remediated', 'Conduct', 'Priya Sharma', 'High', 'Medium', ['OBL-0142'], ['CTRL-022', 'CTRL-003'], 'Open', 'consumer-duty', 'CHG-001', 'OBL-0142'),
    rsk('RSK-008', 'Important business service exceeds impact tolerance', 'Operational', 'James Walker', 'High', 'Medium', ['OBL-0088'], ['CTRL-031'], 'Open', 'op-resilience', 'CHG-010', 'OBL-0088'),
    rsk('RSK-015', 'Material outsourcing not adequately governed', 'Third Party', 'James Okonkwo', 'Medium', 'Low', ['OBL-0075'], ['CTRL-040'], 'Open', 'third-party', 'CHG-011', 'OBL-0075'),
    rsk('RSK-019', 'Financial crime monitoring gaps', 'Financial Crime', 'Sarah Jones', 'High', 'High', ['OBL-0062'], ['CTRL-052'], 'Open', 'financial-crime', 'CHG-012', 'OBL-0062'),
  ];
  for (let i = 1; i <= 6; i++) {
    risks.push(rsk(`RSK-02${i}`, `Demo regulatory risk ${i}`, 'Compliance', 'Michael Chen', 'Medium', 'Low', [], [], 'Closed', 'consumer-duty', null, null));
  }

  const controls = [
    ctrl('CTRL-022', 'Monthly Customer Outcome Monitoring', 'Detective', 'Monthly', 'Semi-automated', 'Effective', 'Current', 'Emma Walsh', ['OBL-0142', 'OBL-0143'], ['RSK-012'], ['POL-007'], 'consumer-duty', 'PUB-001', 'CHG-001'),
    ctrl('CTRL-003', 'Customer Complaints Trend Analysis', 'Detective', 'Weekly', 'Automated', 'Effective', 'Current', 'Emma Walsh', ['OBL-0142'], ['RSK-012'], ['POL-007'], 'consumer-duty', 'PUB-001', 'CHG-001'),
    ctrl('CTRL-031', 'IBS Impact Tolerance Testing', 'Preventative', 'Quarterly', 'Manual', 'Partially effective', 'Due Q4', 'James Walker', ['OBL-0088'], ['RSK-008'], [], 'op-resilience', 'PUB-003', 'CHG-010'),
    ctrl('CTRL-040', 'Outsourcing Register Review', 'Detective', 'Quarterly', 'Manual', 'Effective', 'Current', 'James Okonkwo', ['OBL-0075'], ['RSK-015'], ['POL-012'], 'third-party', 'PUB-002', 'CHG-011'),
    ctrl('CTRL-052', 'TM Model Validation', 'Preventative', 'Annual', 'Manual', 'Not tested', 'Overdue', 'Sarah Jones', ['OBL-0062'], ['RSK-019'], [], 'financial-crime', 'PUB-004', 'CHG-012'),
  ];
  for (let i = 11; i <= 19; i++) {
    if (controls.some((c) => c.id === `CTRL-0${i}`)) continue;
    controls.push(ctrl(`CTRL-0${i}`, `Demo control ${i}`, 'Detective', 'Monthly', 'Manual', 'Effective', 'Current', 'Emma Walsh', [], [], [], 'consumer-duty', null, null));
  }

  const policies = [
    pol('POL-007', 'Consumer Duty Monitoring Policy', 'Priya Sharma', '3.2', '2026-09-01', '2027-09-01', 'Current', ['OBL-0142', 'OBL-0143'], ['CTRL-022', 'CTRL-003'], ['CHG-001'], true, 'consumer-duty'),
    pol('POL-012', 'Third-Party & Outsourcing Policy', 'James Okonkwo', '2.4', '2026-06-01', '2027-06-01', 'Current', ['OBL-0075'], ['CTRL-040'], ['CHG-011'], false, 'third-party'),
    pol('POL-003', 'Operational Resilience Policy', 'James Walker', '4.0', '2026-03-01', '2027-03-01', 'Under review', ['OBL-0088'], ['CTRL-031'], ['CHG-010'], true, 'op-resilience'),
  ];
  for (let i = 1; i <= 5; i++) {
    policies.push(pol(`POL-01${i}`, `Demo policy ${i}`, 'Sarah Jones', '1.0', '2025-01-01', '2026-01-01', 'Historic', [], [], [], false, 'consumer-duty'));
  }

  const actions = [
    act('ACT-018', 'Enhance customer cohort reporting', 'Obligation', 'OBL-0142', 'Priya Sharma', 'High', '2026-11-15', 'In Progress', 'Sarah Jones', ['EVD-009'], 'consumer-duty'),
    act('ACT-019', 'Update Consumer Duty MI dashboard', 'Impact Assessment', 'IA-0042', 'Emma Walsh', 'High', '2026-10-30', 'In Progress', 'James Okonkwo', [], 'consumer-duty'),
    act('ACT-022', 'Board paper — outcome monitoring', 'Obligation', 'OBL-0143', 'Priya Sharma', 'Medium', '2026-12-01', 'Not Started', 'Sarah Jones', [], 'consumer-duty'),
    act('ACT-031', 'Complete IBS scenario testing', 'Obligation', 'OBL-0088', 'James Walker', 'High', '2026-10-10', 'Overdue', 'Sarah Jones', [], 'op-resilience'),
    act('ACT-040', 'Refresh outsourcing register', 'Control Gap', 'CTRL-040', 'James Okonkwo', 'Medium', '2026-10-25', 'Blocked', 'Sarah Jones', [], 'third-party'),
    act('ACT-052', 'Schedule TM model validation', 'Obligation', 'OBL-0062', 'Sarah Jones', 'High', '2026-11-01', 'Due Soon', 'James Okonkwo', [], 'financial-crime'),
  ];
  for (let i = 1; i <= 6; i++) {
    actions.push(act(`ACT-10${i}`, `Demo remediation action ${i}`, 'Compliance Issue', null, 'Emma Walsh', 'Low', '2026-12-20', 'Not Started', 'Sarah Jones', [], 'consumer-duty'));
  }

  const evidence = [
    evd('EVD-009', 'Customer Outcome Monitoring MI – November 2026.pdf', 'control report', 'Emma Walsh', '2026-11-01', 'CTRL-022', 'ACT-018', 'OBL-0142', 'PUB-001', 'Approved', 'consumer-duty'),
    evd('EVD-010', 'Conduct Committee minutes — Oct 2026.pdf', 'committee minutes', 'Priya Sharma', '2026-10-28', null, 'ACT-022', 'OBL-0143', 'PUB-001', 'In review', 'consumer-duty'),
    evd('EVD-031', 'IBS testing workshop notes.docx', 'implementation document', 'James Walker', '2026-09-15', 'CTRL-031', 'ACT-031', 'OBL-0088', 'PUB-003', 'Draft', 'op-resilience'),
    evd('EVD-040', 'Outsourcing register export — Q3 2026.xlsx', 'implementation document', 'James Okonkwo', '2026-09-20', 'CTRL-040', 'ACT-040', 'OBL-0075', 'PUB-002', 'Approved', 'third-party'),
    evd('EVD-052', 'TM model validation plan 2026.pdf', 'policy document', 'Sarah Jones', '2026-10-02', 'CTRL-052', 'ACT-052', 'OBL-0062', 'PUB-004', 'Draft', 'financial-crime'),
  ];
  for (let i = 1; i <= 10; i++) {
    evidence.push(evd(`EVD-10${i}`, `Demo evidence pack ${i}.pdf`, 'policy document', 'Sarah Jones', '2026-08-01', null, null, `OBL-01${50 + i}`, 'PUB-013', 'Approved', 'consumer-duty'));
  }

  const calendarEvents = buildCalendar(publications, assessments, obligations, actions, policies);

  const versionDiffs = {
    'PUB-001': {
      previousLabel: 'PS26/12 (draft)',
      currentLabel: 'PS26/14',
      provisionCount: 12,
      added: ['Firms must monitor customer outcomes by meaningful cohorts at least monthly.'],
      removed: ['Annual summary of complaints trends is sufficient evidence of outcomes.'],
      changed: ['Remediation timelines for identified poor outcomes reduced from 90 to 60 days.'],
      affected: { obligations: ['OBL-0142', 'OBL-0143'], policies: ['POL-007'], risks: ['RSK-012'], controls: ['CTRL-022'], actions: ['ACT-018', 'ACT-019'] },
    },
    'PUB-002': {
      previousLabel: 'SYSC 8.1.6',
      currentLabel: 'SYSC 8.1.8',
      provisionCount: 4,
      added: ['Material outsourcing register must include fourth-party critical dependencies.'],
      removed: [],
      changed: ['Record retention extended from 5 to 7 years.'],
      affected: { obligations: ['OBL-0075'], policies: ['POL-012'], risks: ['RSK-015'], controls: ['CTRL-040'], actions: ['ACT-040'] },
    },
  };

  const sourcePassages = {
    'PUB-001': {
      'FCA PS26/14 §3.12–3.18': 'DEMO: Firms should monitor outcomes for different groups of customers (including vulnerable customers) and take appropriate action where they identify poor outcomes.',
    },
  };

  const sourceDocuments = {
    'PUB-001': {
      label: 'DEMO / MOCK REGULATORY TEXT',
      metadata: {
        mockUrl: 'https://mock.forgeniq.lab/fca/ps26-14',
        reference: 'PS26/14',
        regulator: 'FCA',
        documentType: 'Policy Statement',
        ingestedAt: '2026-10-06T09:00:00Z',
      },
      sections: [
        {
          id: '3.1',
          heading: '3.1 Purpose (mock)',
          paragraphs: [
            'DEMO: This mock policy statement sets supervisory expectations for firms subject to the Consumer Duty.',
            'DEMO: It is not live FCA content and is for Design Lab demonstration only.',
          ],
        },
        {
          id: '3.12-3.18',
          citation: 'FCA PS26/14 §3.12–3.18',
          citationSlug: '3.12-3.18',
          heading: '3.12–3.18 Outcome monitoring and remediation (mock)',
          paragraphs: [
            '3.12 DEMO: A firm must monitor customer outcomes on an ongoing basis using management information that is sufficient to identify poor outcomes.',
            '3.14 DEMO: Outcome monitoring should be performed for meaningful cohorts of customers, including vulnerable customers where applicable.',
            '3.16 DEMO: Senior management and governing bodies should challenge outcome MI and ensure timely remediation.',
            '3.18 DEMO: Firms should retain evidence of monitoring, findings, and remediation actions for supervisory review.',
          ],
        },
        {
          id: '3.14',
          citation: 'FCA PS26/14 §3.14',
          citationSlug: '3.14',
          heading: '3.14 Cohort reporting (mock)',
          paragraphs: ['DEMO: Cohort definitions should be meaningful, documented, and consistent across product lines.'],
        },
        {
          id: '3.16',
          citation: 'FCA PS26/14 §3.16',
          citationSlug: '3.16',
          heading: '3.16 Governance (mock)',
          paragraphs: ['DEMO: Boards and committees should receive outcome MI with sufficient granularity to support challenge.'],
        },
      ],
    },
    'PUB-003': {
      label: 'DEMO / MOCK REGULATORY TEXT',
      metadata: { mockUrl: 'https://mock.forgeniq.lab/pra/ss4-26', reference: 'SS4/26', regulator: 'PRA', documentType: 'Supervisory Statement' },
      sections: [
        { id: '4.2', citation: 'PRA SS4/26 §4.2', citationSlug: '4.2', heading: '4.2 Impact tolerance testing (mock)', paragraphs: ['DEMO: Firms should test impact tolerances for important business services on a defined cadence.'] },
      ],
    },
    'PUB-002': {
      label: 'DEMO / MOCK REGULATORY TEXT',
      metadata: { mockUrl: 'https://mock.forgeniq.lab/fca/sysc-8', reference: 'SYSC 8', regulator: 'FCA', documentType: 'Handbook Rule' },
      sections: [
        { id: '8.1.8', citation: 'SYSC 8.1.8', citationSlug: '8.1.8', heading: 'SYSC 8.1.8 Outsourcing records (mock)', paragraphs: ['DEMO: Material outsourcing arrangements must be documented and retained for seven years.'] },
      ],
    },
    'PUB-004': {
      label: 'DEMO / MOCK REGULATORY TEXT',
      metadata: { mockUrl: 'https://mock.forgeniq.lab/fca/dceo-2026-03', reference: 'FCA/DCEO/2026/03', regulator: 'FCA', documentType: 'Letter' },
      sections: [
        { id: '2.1', citation: 'FCA/DCEO/2026/03 §2.1', citationSlug: '2.1', heading: '2.1 Transaction monitoring (mock)', paragraphs: ['DEMO: Firms should validate transaction monitoring models and document outcomes.'] },
      ],
    },
    'PUB-009': {
      label: 'DEMO / MOCK REGULATORY TEXT',
      metadata: { mockUrl: 'https://mock.forgeniq.lab/pra/ss2-21-amend', reference: 'SS2/21 (amend)', regulator: 'PRA', documentType: 'Supervisory Statement' },
      sections: [
        { id: '1.3', citation: 'SS2/21 (amend) §1.3', citationSlug: '1.3', heading: '1.3 Third-party risk (mock)', paragraphs: ['DEMO: Outsourcing and third-party risk expectations for material providers.'] },
      ],
    },
  };

  const publicationAnalysis = {
    'PUB-001': {
      whatChanged: 'DEMO: Supervisory expectations for Consumer Duty outcome monitoring, cohort MI and governance evidence have been strengthened.',
      whyItMatters: 'DEMO: ABC Financial Ltd must enhance MI, remediation tracking and committee oversight to demonstrate good customer outcomes.',
      whoAffected: {
        entities: ['ABC Financial Ltd'],
        products: ['Current accounts', 'Savings', 'Investment ISAs'],
        businessLines: ['Retail Banking', 'Conduct'],
        customerTypes: ['Retail', 'Vulnerable customers'],
        functions: ['Compliance', 'Conduct', 'Operations', 'Technology'],
      },
      keyDates: [
        { label: 'Published', date: '2026-10-06' },
        { label: 'Effective', date: '2027-01-01' },
        { label: 'Assessment due (IA-0042)', date: '2026-11-30' },
      ],
      suggestedSteps: [
        'Perform applicability assessment',
        'Review Consumer Duty MI',
        'Assess policy impact',
        'Review monitoring controls',
      ],
      confidence: 87,
      reasoning: 'DEMO: Retail product footprint and existing Consumer Duty programme indicate material impact.',
      citation: 'FCA PS26/14 §3.12–3.18',
      citationSection: '3.12-3.18',
    },
  };

  const forgeniqRead = {
    summary: 'Regulatory pressure is currently concentrated around Consumer Duty monitoring, operational resilience and third-party governance.',
    confidence: 84,
    sourcesAnalysed: 47,
    refs: ['PUB-001', 'PUB-003', 'PUB-009', 'PUB-004'],
  };

  const horizonOutlook = {
    summary: 'Four upcoming regulatory developments are likely to materially affect Retail Banking over the next six months.',
    confidence: 78,
    refs: ['PUB-005', 'PUB-003', 'PUB-001', 'PUB-009'],
  };

  const sourceHealth = [
    { name: 'FCA Handbook API', status: 'Healthy' },
    { name: 'FCA Publications', status: 'Healthy' },
    { name: 'PRA Publications', status: 'Healthy' },
    { name: 'Manual Document Intake', status: 'Available' },
  ];

  const base = {
    version: '0.3.0',
    schemaVersion: 14,
    scenarioId: 'consumer-duty',
    org,
    users,
    publications,
    changes,
    assessments,
    obligations,
    risks,
    controls,
    policies,
    actions,
    evidence,
    calendarEvents,
    auditEvents: [
      audit('2026-10-06T09:05:00', 'FORGENIQ AI', 'Publication ingested', 'Publication', 'PUB-001', null, 'Ingested', null, 'Mock connector: FCA Publications'),
      audit('2026-10-06T09:12:00', 'FORGENIQ AI', 'AI analysis generated', 'Publication', 'PUB-001', null, 'Complete', 87, 'Publication-level analysis'),
      audit('2026-10-06T09:18:00', 'FORGENIQ AI', 'Regulatory changes identified', 'Publication', 'PUB-001', null, '3 changes', null, 'CHG-001, CHG-002, CHG-003'),
      audit('2026-10-06T10:00:00', 'FORGENIQ AI', 'Applicability recommendation created', 'Publication', 'PUB-001', null, 'Applicable', 89, 'Publication-level'),
      audit('2026-10-06T10:05:00', 'FORGENIQ AI', 'Change applicability recommendation', 'Regulatory Change', 'CHG-001', null, 'Applicable', 91, null),
      audit('2026-10-06T10:06:00', 'FORGENIQ AI', 'Change applicability recommendation', 'Regulatory Change', 'CHG-002', null, 'Applicable', 88, null),
      audit('2026-10-06T10:07:00', 'FORGENIQ AI', 'Change applicability recommendation', 'Regulatory Change', 'CHG-003', null, 'Review Required', 74, null),
      audit('2026-10-07T08:15:00', 'Sarah Jones', 'Viewed publication', 'Publication', 'PUB-001', null, null, null, 'Initial triage'),
      audit('2026-10-10T09:00:00', 'Priya Sharma', 'Obligation created', 'Obligation', 'OBL-0142', null, 'In Progress', null, 'From IA-0042 / CHG-001'),
    ],
    versionDiffs,
    sourcePassages,
    sourceDocuments,
    publicationAnalysis,
    forgeniqRead,
    horizonOutlook,
    sourceHealth,
    applicabilityOverrides: {},
    changeApplicabilityOverrides: {},
  };
  return applyOperationalSeed(base);
}

function chgFull(opts) {
  return {
    id: opts.id,
    publicationId: opts.publicationId,
    scenario: opts.scenario,
    title: opts.title,
    description: opts.description,
    summary: opts.description,
    sourceCitation: opts.sourceCitation,
    sourceSection: opts.sourceSection,
    topic: opts.topic,
    materiality: opts.materiality,
    effectiveDate: opts.effectiveDate,
    status: opts.status,
    applicabilityRecommendation: opts.applicabilityRecommendation,
    applicabilityConfidence: opts.applicabilityConfidence,
    applicabilityDecision: opts.applicabilityDecision,
    applicabilityReasoning: opts.applicabilityReasoning,
    affectedEntities: opts.affectedEntities || [],
    affectedProducts: opts.affectedProducts || [],
    affectedBusinessLines: opts.affectedBusinessLines || [],
    affectedJurisdictions: opts.affectedJurisdictions || [],
    linkedAssessmentIds: [],
    linkedObligationIds: [],
    linkedPolicyIds: [],
    linkedRiskIds: [],
    linkedControlIds: [],
    linkedActionIds: [],
    linkedEvidenceIds: [],
    decisionMeta: opts.applicabilityDecision
      ? { user: 'Sarah Jones', at: '2026-10-06T11:00:00', justification: 'Accepted FORGENIQ AI recommendation (DEMO seed)' }
      : null,
    aiSummary: `FORGENIQ AI (DEMO): ${opts.title}`,
  };
}

function pub(id, scenario, regulator, title, ref, type, topic, published, effective, consultation, priority, applicability, workflow, decision, confidence, unreviewed) {
  return {
    id, scenario, regulator, title, reference: ref, publicationType: type, topic, jurisdiction: 'UK',
    publishedDate: published, effectiveDate: effective, consultationDeadline: consultation,
    priority, applicabilityRecommendation: applicability, workflowStatus: workflow,
    applicabilityDecision: decision, applicabilityConfidence: confidence,
    unreviewed: !!unreviewed,
    aiSummary: mockSummary(title),
    keyRequirements: ['Demonstrate outcome monitoring', 'Evidence remediation actions', 'Board oversight of conduct MI'],
    affectedTopics: [topic],
    changeIds: [], assessmentIds: [], obligationIds: [],
    sourceUrl: '#mock-source',
  };
}

function ia(id, changeId, pubId, scenario, title, owner, materiality, status, due, reviewer, approver, extra = {}) {
  return {
    id, changeId, publicationId: pubId, scenario, title, owner, materiality, status, dueDate: due,
    reviewer, approver,
    aiSummary: extra.aiSummary || 'FORGENIQ AI impact draft available for review.',
    entities: extra.entities || ['ABC Financial Ltd'],
    businessUnits: extra.units || [],
    products: extra.products || ['Current accounts', 'Savings'],
    processes: extra.processes || [],
    systems: extra.systems || ['Core banking', 'MI warehouse'],
    policyIds: extra.policies || [],
    riskIds: extra.risks || [],
    controlIds: extra.controls || [],
    financialImpact: 'Medium',
    operationalImpact: 'Medium',
    technologyImpact: extra.technologyImpact || 'Low',
    complianceImpact: 'High',
    implementationComplexity: 'Medium',
    obligationIds: [],
  };
}

const OBL_LINKS = {
  'OBL-0142': { policyIds: ['POL-007'], riskIds: ['RSK-012'], controlIds: ['CTRL-022'], actionIds: ['ACT-018', 'ACT-019'], evidenceIds: ['EVD-009'] },
  'OBL-0088': { policyIds: ['POL-003'], riskIds: ['RSK-008'], controlIds: ['CTRL-031'], actionIds: ['ACT-031'], evidenceIds: ['EVD-031'] },
  'OBL-0075': { policyIds: ['POL-012'], riskIds: ['RSK-015'], controlIds: ['CTRL-040'], actionIds: ['ACT-040'], evidenceIds: ['EVD-040'] },
  'OBL-0062': { policyIds: [], riskIds: ['RSK-019'], controlIds: ['CTRL-052'], actionIds: ['ACT-052'], evidenceIds: ['EVD-052'] },
};

const OBL_CITATIONS = {
  'PUB-001': 'FCA PS26/14 §3.12–3.18',
  'PUB-003': 'PRA SS4/26 §4.2',
  'PUB-002': 'SYSC 8.1.8',
  'PUB-004': 'FCA/DCEO/2026/03 §2.1',
};

function obl(id, statement, pubId, changeId, iaId, entity, owner, priority, effective, coverage, status, scenario) {
  const links = OBL_LINKS[id] || { policyIds: [], riskIds: [], controlIds: [], actionIds: [], evidenceIds: [] };
  return {
    id, statement, publicationId: pubId, changeId, assessmentId: iaId, legalEntity: entity, owner,
    priority, effectiveDate: effective, coverage, status, scenario,
    citation: OBL_CITATIONS[pubId] || `Mock citation for ${pubId}`,
    sourceText: 'DEMO: Regulated firms must maintain evidence of compliance and remediation (mock text).',
    ...links,
  };
}

function rsk(id, title, category, owner, inherent, residual, obls, ctrls, status, scenario, changeId, oblId) {
  return {
    id, title, description: `DEMO: ${title}`, category, owner, inherentRisk: inherent, residualRisk: residual,
    obligationIds: obls, controlIds: ctrls, policyIds: [], actionIds: [], status, scenario,
    originatingChangeId: changeId, originatingObligationId: oblId,
  };
}

function ctrl(id, name, pd, frequency, automation, effectiveness, testing, owner, obls, risks, policies, scenario, pubId, changeId) {
  return {
    id, name, description: `DEMO: ${name}`, controlType: pd, frequency, preventativeDetective: pd, manualAutomated: automation,
    effectiveness, testingStatus: testing, owner, obligationIds: obls, riskIds: risks, policyIds: policies, evidenceIds: [],
    scenario, publicationId: pubId, changeId,
  };
}

function pol(id, name, owner, version, lastReview, nextReview, status, obls, ctrls, changes, reviewAlert, scenario) {
  return {
    id, name, owner, version, lastReview, nextReview, status, obligationIds: obls, controlIds: ctrls, changeIds: changes,
    reviewRecommended: reviewAlert, reviewReason: reviewAlert ? 'A linked regulatory requirement has changed.' : null,
    scenario, versionHistory: [{ version: version, date: lastReview, author: owner }],
  };
}

function act(id, desc, sourceType, sourceId, owner, priority, due, status, reviewer, evidenceIds, scenario) {
  return {
    id, description: desc, sourceType, sourceId, owner, priority, dueDate: due, status, reviewer,
    evidenceIds, escalation: status === 'Overdue' ? 'Escalated to COO' : 'None', scenario, comments: [],
  };
}

function evd(id, fileName, type, uploadedBy, date, controlId, actionId, oblId, pubId, approval, scenario) {
  return {
    id, fileName, evidenceType: type, uploadedBy, uploadedDate: date, controlId, actionId, obligationId: oblId,
    publicationId: pubId, approvalStatus: approval, scenario,
  };
}

function audit(ts, user, action, recordType, recordId, prev, next, aiConf, comments) {
  return { id: `AUD-${ts}`, timestamp: ts, user, action, recordType, recordId, previousValue: prev, newValue: next, aiConfidence: aiConf, humanDecision: comments, comments };
}

function mockSummary(title) {
  return `FORGENIQ Summary (DEMO): ${title} — firms should review applicability, assess material impacts, and update governance artefacts.`;
}

function buildCalendar(publications, assessments, obligations, actions, policies) {
  const events = [];
  publications.forEach((p) => {
    if (p.effectiveDate) events.push(cal(`CAL-P-${p.id}`, p.effectiveDate, 'effective', 'Publication effective', p.id, 'Publication'));
    if (p.consultationDeadline) events.push(cal(`CAL-C-${p.id}`, p.consultationDeadline, 'consultation', 'Consultation deadline', p.id, 'Publication'));
    events.push(cal(`CAL-PUB-${p.id}`, p.publishedDate, 'publication', 'Published', p.id, 'Publication'));
  });
  assessments.forEach((a) => events.push(cal(`CAL-IA-${a.id}`, a.dueDate, 'assessment', `Assessment due: ${a.id}`, a.id, 'Impact Assessment')));
  obligations.forEach((o) => events.push(cal(`CAL-OBL-${o.id}`, o.effectiveDate, 'implementation', `Obligation effective: ${o.id}`, o.id, 'Obligation')));
  actions.forEach((a) => events.push(cal(`CAL-ACT-${a.id}`, a.dueDate, 'action', a.description, a.id, 'Action')));
  policies.forEach((p) => events.push(cal(`CAL-POL-${p.id}`, p.nextReview, 'policy', `Policy review: ${p.name}`, p.id, 'Policy')));
  return events;
}

function cal(id, date, kind, title, recordId, recordType) {
  return { id, date, kind, title, recordId, recordType };
}

/** Wire relationship arrays after entities exist */
export function linkSeedRelationships(state) {
  const byPub = (id) => state.publications.find((p) => p.id === id);
  state.publications.forEach((p) => {
    p.changeIds = [];
    p.assessmentIds = [];
    p.obligationIds = [];
  });
  state.changes.forEach((c) => {
    const p = byPub(c.publicationId);
    if (p && !p.changeIds.includes(c.id)) p.changeIds.push(c.id);
  });
  state.assessments.forEach((a) => {
    const p = byPub(a.publicationId);
    if (p && !p.assessmentIds.includes(a.id)) p.assessmentIds.push(a.id);
  });
  state.obligations.forEach((o) => {
    const p = byPub(o.publicationId);
    if (p && !p.obligationIds.includes(o.id)) p.obligationIds.push(o.id);
  });
  return syncGraphLinks(state);
}

export function finalizeSeedState(state) {
  return linkSeedRelationships(state);
}
