import 'server-only';

/** Golden-master use cases — mirrors Design Lab ai-governance-seed.js */
export type AiUseCaseDef = {
  id: string;
  name: string;
  description: string;
  riskClassification: string;
  humanOversightRequired: boolean;
  sourceGroundingRequired: boolean;
  status: 'Active' | 'Inactive';
  analysisTypes: string[];
  promptVersion: string;
};

export const AI_USE_CASE_CATALOG: AiUseCaseDef[] = [
  {
    id: 'UC-RI-001',
    name: 'Regulatory Publication Classification',
    description: 'Classify incoming publications for triage.',
    riskClassification: 'Moderate',
    humanOversightRequired: true,
    sourceGroundingRequired: true,
    status: 'Active',
    analysisTypes: ['Publication Classification'],
    promptVersion: 'PROMPT-REG-CHANGE-04',
  },
  {
    id: 'UC-RI-002',
    name: 'Regulatory Change Extraction',
    description: 'Extract candidate changes from source sections.',
    riskClassification: 'High Governance Sensitivity',
    humanOversightRequired: true,
    sourceGroundingRequired: true,
    status: 'Active',
    analysisTypes: ['Regulatory Change Extraction'],
    promptVersion: 'PROMPT-REG-CHANGE-04',
  },
  {
    id: 'UC-RI-003',
    name: 'Applicability Recommendation',
    description: 'Recommend applicability for regulatory changes.',
    riskClassification: 'High Governance Sensitivity',
    humanOversightRequired: true,
    sourceGroundingRequired: true,
    status: 'Active',
    analysisTypes: ['Applicability Recommendation'],
    promptVersion: 'PROMPT-REG-CHANGE-04',
  },
  {
    id: 'UC-RI-004',
    name: 'Impact Suggestion',
    description: 'Suggest impact areas for assessments.',
    riskClassification: 'Moderate',
    humanOversightRequired: true,
    sourceGroundingRequired: true,
    status: 'Active',
    analysisTypes: ['Impact Suggestion'],
    promptVersion: 'PROMPT-REG-CHANGE-04',
  },
  {
    id: 'UC-RI-006',
    name: 'Risk Mapping',
    description: 'Map approved impact to organisation risks and regulatory gaps.',
    riskClassification: 'High Governance Sensitivity',
    humanOversightRequired: true,
    sourceGroundingRequired: true,
    status: 'Active',
    analysisTypes: ['Risk Mapping'],
    promptVersion: 'PROMPT-REG-CHANGE-04',
  },
  {
    id: 'UC-RI-007',
    name: 'Control Mapping',
    description: 'Map validated risks to controls and identify gaps.',
    riskClassification: 'High Governance Sensitivity',
    humanOversightRequired: true,
    sourceGroundingRequired: true,
    status: 'Active',
    analysisTypes: ['Control Mapping'],
    promptVersion: 'PROMPT-REG-CHANGE-04',
  },
  {
    id: 'UC-RI-008',
    name: 'Control Assurance Planning',
    description: 'Plan control testing, evidence and effectiveness assessment.',
    riskClassification: 'High Governance Sensitivity',
    humanOversightRequired: true,
    sourceGroundingRequired: true,
    status: 'Active',
    analysisTypes: ['Control Assurance Plan'],
    promptVersion: 'PROMPT-REG-CHANGE-04',
  },
  {
    id: 'UC-RI-005',
    name: 'Candidate Obligation Extraction',
    description: 'Extract candidate obligations with source basis.',
    riskClassification: 'High Governance Sensitivity',
    humanOversightRequired: true,
    sourceGroundingRequired: true,
    status: 'Active',
    analysisTypes: ['Obligation Extraction'],
    promptVersion: 'PROMPT-REG-CHANGE-04',
  },
];

export function getUseCaseById(id: string): AiUseCaseDef | undefined {
  return AI_USE_CASE_CATALOG.find((u) => u.id === id);
}
