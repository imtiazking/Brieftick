/**
 * Offline synthetic tenant state for Ask RI evaluation — no real customer data.
 */
export function createEvalTenantState() {
  return {
    asOfDate: '2026-10-14',
    changes: [
      {
        id: 'CHG-EVAL-001',
        title: 'Consumer Duty — fair value monitoring',
        status: 'Open',
        materiality: 'High',
        publicationId: '56b0beca-d8c3-4267-a794-9079009af661',
      },
      {
        id: 'CHG-EVAL-002',
        title: 'CP26/38 financial crime guide — impact assessment',
        status: 'Open',
        materiality: 'Medium',
        publicationId: '4d05b49b-a4a4-4101-8c87-7d3983315f25',
      },
      {
        id: 'CHG-EVAL-003',
        title: 'Historic closed change',
        status: 'Closed',
      },
    ],
    obligations: [
      {
        id: 'OBL-EVAL-OPEN-1',
        statement: 'Monitor Consumer Duty fair value outcomes',
        status: 'Open',
        changeId: 'CHG-EVAL-001',
      },
      {
        id: 'OBL-EVAL-OPEN-2',
        statement: 'Assess financial crime guide consultation impact',
        status: 'In Progress',
        changeId: 'CHG-EVAL-002',
      },
      {
        id: 'OBL-EVAL-DRAFT-1',
        statement: 'Draft interpretation of proposed AML control changes',
        status: 'Draft',
        changeId: 'CHG-EVAL-002',
      },
    ],
    actions: [
      {
        id: 'ACT-EVAL-1',
        title: 'Complete fair value documentation',
        status: 'Open',
        dueDate: '2026-12-01',
        sourceType: 'Obligation',
        sourceId: 'OBL-EVAL-OPEN-1',
      },
    ],
    controls: [
      {
        id: 'CTL-EVAL-1',
        name: 'Transaction monitoring control',
        status: 'Active',
      },
    ],
    impactAssessments: [
      { id: 'IA-EVAL-DRAFT', title: 'CP26 financial crime impact', status: 'Draft', changeId: 'CHG-EVAL-002' },
    ],
    complianceThemes: [],
    sectors: [],
    publications: [],
    risks: [],
    evidence: [],
  };
}
