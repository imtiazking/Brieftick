/**
 * Maps UC-RI-006 Risk Mapping output into draft risk fields.
 * Ratings pass through the rating policy: no defaulted ratings, residual UNASSESSED without control evidence.
 */
import { applyRiskRatingPolicy } from './risk-rating-policy.mjs';

const HUMAN_CONFIRM = 'Requires human confirmation — not verified organisational fact.';

/**
 * @param {{ structured?: Record<string, any> | null, claims?: any[] | null, organisationEvidence?: { controlEffectivenessEvidence?: any[] | null } | null }} input
 */
export function mapRiskMappingToDraftFields(input) {
  const structured = input.structured && typeof input.structured === 'object' ? input.structured : {};
  const proposals = Array.isArray(structured.riskProposals) ? structured.riskProposals : [];
  const mappings = Array.isArray(structured.existingRiskMappings) ? structured.existingRiskMappings : [];
  const claims = Array.isArray(input.claims) ? input.claims : Array.isArray(structured.claims) ? structured.claims : [];
  const confidence = Number(structured.confidence ?? 0);
  const primary = proposals[0] || {
    title: 'Regulatory compliance risk (AI draft)',
    category: 'Compliance',
  };
  const rating = applyRiskRatingPolicy(primary, input.organisationEvidence);
  const ratingText = [
    `Inherent rating: ${rating.inherent_risk}${rating.inherentRationale ? ` — ${rating.inherentRationale}` : ' — no documented rationale supplied; not rated.'}`,
    `Residual rating: ${rating.residual_risk}${rating.residualRationale ? ` — ${rating.residualRationale}` : ' — no control-effectiveness evidence is available.'}`,
  ].join('\n');
  return {
    title: String(primary.title || 'AI-proposed risk').slice(0, 500),
    description:
      `${String(primary.description || 'Risk identified from approved impact assessment.').slice(0, 2000)}\n\n${ratingText}\n\n${HUMAN_CONFIRM}`.slice(0, 4000),
    category: String(primary.category || 'Compliance').slice(0, 200),
    inherent_risk: rating.inherent_risk,
    residual_risk: rating.residual_risk,
    ratingAssessment: rating,
    existingRiskMappings: mappings.slice(0, 20),
    stage3Metadata: {
      aiUseCaseId: 'UC-RI-006',
      aiConfidence: confidence,
      aiClaims: claims.slice(0, 8),
      ratingAssessment: rating,
      /** All proposals are retained; only the first becomes the draft record. */
      riskProposals: proposals.slice(0, 10),
      humanConfirmationRequired: [
        'Risk ratings and owners require authorised human validation.',
        'Existing risk mappings must be confirmed before operational use.',
        ...(rating.residualStatus.startsWith('UNASSESSED')
          ? ['Residual risk is unassessed: record control-effectiveness evidence before rating it.']
          : []),
      ],
      processingStatus: 'DRAFT_AI_SUGGESTION',
    },
  };
}
