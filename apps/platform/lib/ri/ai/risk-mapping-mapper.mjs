/**
 * Maps UC-RI-006 Risk Mapping fixture output into draft risk fields.
 */

const HUMAN_CONFIRM = 'Requires human confirmation — not verified organisational fact.';

export function mapRiskMappingToDraftFields(input) {
  const structured = input.structured && typeof input.structured === 'object' ? input.structured : {};
  const proposals = Array.isArray(structured.riskProposals) ? structured.riskProposals : [];
  const mappings = Array.isArray(structured.existingRiskMappings) ? structured.existingRiskMappings : [];
  const claims = Array.isArray(structured.claims) ? structured.claims : [];
  const confidence = Number(structured.confidence ?? 0);
  const primary = proposals[0] || {
    title: 'Regulatory compliance risk (AI draft)',
    category: 'Compliance',
    inherent_risk: 'MEDIUM',
    residual_risk: 'MEDIUM',
  };
  return {
    title: String(primary.title || 'AI-proposed risk').slice(0, 500),
    description:
      `${String(primary.description || 'Risk identified from approved impact assessment.').slice(0, 2000)} ${HUMAN_CONFIRM}`,
    category: String(primary.category || 'Compliance').slice(0, 200),
    inherent_risk: String(primary.inherent_risk || 'MEDIUM').slice(0, 100),
    residual_risk: String(primary.residual_risk || 'MEDIUM').slice(0, 100),
    existingRiskMappings: mappings.slice(0, 20),
    stage3Metadata: {
      aiUseCaseId: 'UC-RI-006',
      aiConfidence: confidence,
      aiClaims: claims.slice(0, 8),
      humanConfirmationRequired: [
        'Risk ratings and owners require authorised human validation.',
        'Existing risk mappings must be confirmed before operational use.',
      ],
      processingStatus: 'DRAFT_AI_SUGGESTION',
    },
  };
}