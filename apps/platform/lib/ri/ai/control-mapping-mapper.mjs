/**
 * Maps UC-RI-007 Control Mapping fixture output into draft control fields.
 */

const HUMAN_CONFIRM = 'Requires human confirmation — not verified organisational fact.';

export function mapControlMappingToDraftFields(input) {
  const structured = input.structured && typeof input.structured === 'object' ? input.structured : {};
  const proposals = Array.isArray(structured.controlProposals) ? structured.controlProposals : [];
  const mappings = Array.isArray(structured.existingControlMappings) ? structured.existingControlMappings : [];
  const claims = Array.isArray(structured.claims) ? structured.claims : [];
  const confidence = Number(structured.confidence ?? 0);
  const primary = proposals[0] || {
    name: 'Mitigating control (AI draft)',
    control_type: 'Preventive',
    effectiveness: 'NOT_TESTED',
  };
  return {
    name: String(primary.name || 'AI-proposed control').slice(0, 500),
    description:
      `${String(primary.description || 'Control proposed to mitigate validated risk.').slice(0, 2000)} ${HUMAN_CONFIRM}`,
    control_type: String(primary.control_type || 'Preventive').slice(0, 200),
    effectiveness: String(primary.effectiveness || 'NOT_TESTED').slice(0, 200),
    existingControlMappings: mappings.slice(0, 20),
    stage4Metadata: {
      aiUseCaseId: 'UC-RI-007',
      aiConfidence: confidence,
      aiClaims: claims.slice(0, 8),
      humanConfirmationRequired: ['Control design and risk linkage require human approval.'],
      processingStatus: 'DRAFT_AI_SUGGESTION',
    },
  };
}