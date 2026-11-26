/**
 * Maps UC-RI-007 Control Mapping output into draft control fields.
 * All proposals are retained. The primary draft is the proposal covering the most obligation requirements;
 * uncovered requirements are recorded as gaps for a human decision, never filled with invented controls.
 */
import { assessControlCoverage } from './control-coverage.mjs';

const HUMAN_CONFIRM = 'Requires human confirmation — not verified organisational fact.';

/**
 * @param {{ structured?: Record<string, any> | null, claims?: any[] | null, pack?: any }} input
 */
export function mapControlMappingToDraftFields(input) {
  const structured = input.structured && typeof input.structured === 'object' ? input.structured : {};
  const proposals = Array.isArray(structured.controlProposals) ? structured.controlProposals : [];
  const mappings = Array.isArray(structured.existingControlMappings) ? structured.existingControlMappings : [];
  const claims = Array.isArray(input.claims) ? input.claims : Array.isArray(structured.claims) ? structured.claims : [];
  const confidence = Number(structured.confidence ?? 0);

  const coverage = assessControlCoverage(proposals, input.pack ?? null);
  let primaryIndex = 0;
  let best = -1;
  coverage.perProposal.forEach((p) => {
    const ruleCoverage = p.accepted.length;
    if (ruleCoverage > best) {
      best = ruleCoverage;
      primaryIndex = p.index;
    }
  });
  const primary = proposals[primaryIndex] || {
    name: 'Mitigating control (AI draft)',
    control_type: 'Preventive',
    effectiveness: 'NOT_TESTED',
  };
  const primaryCoverage = coverage.perProposal[primaryIndex]?.accepted ?? [];
  const coverageText = primaryCoverage.length
    ? `Addresses: ${primaryCoverage.map((c) => `${c.obligationLimb ?? 'obligation'} (${c.category})`).join('; ')}.`
    : 'No justified obligation coverage was declared for this control.';
  const gapText = coverage.ruleLimbGaps.length
    ? `Requirement gaps not covered by this control: ${coverage.ruleLimbGaps.map((g) => `${g.reference} (${g.category})`).join('; ')}.`
    : null;
  return {
    name: String(primary.name || 'AI-proposed control').slice(0, 500),
    description:
      [String(primary.description || 'Control proposed to mitigate validated risk.').slice(0, 2000), coverageText, gapText, HUMAN_CONFIRM]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 4000),
    control_type: String(primary.control_type || 'Preventive').slice(0, 200),
    // The model may not assert effectiveness: nothing has been tested.
    effectiveness: 'NOT_TESTED',
    existingControlMappings: mappings.slice(0, 20),
    coverage,
    stage4Metadata: {
      aiUseCaseId: 'UC-RI-007',
      aiConfidence: confidence,
      aiClaims: claims.slice(0, 8),
      controlProposals: proposals.slice(0, 10),
      primaryProposalIndex: primaryIndex,
      controlCoverage: coverage,
      humanConfirmationRequired: [
        'Control design and risk linkage require human approval.',
        ...(coverage.ruleLimbGaps.length
          ? [`Obligation requirements without a justified control: ${coverage.ruleLimbGaps.map((g) => g.reference).join(', ')}.`]
          : []),
        ...(coverage.limbBreakdownAvailable ? [] : ['Obligation limb breakdown unavailable: coverage could not be checked per requirement.']),
      ],
      processingStatus: 'DRAFT_AI_SUGGESTION',
    },
  };
}
