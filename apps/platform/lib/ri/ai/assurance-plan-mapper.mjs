/**
 * Maps UC-RI-008 Control Assurance fixture into assurance review draft fields.
 */

const HUMAN_CONFIRM = 'Requires human confirmation — not verified organisational fact.';

export function mapAssurancePlanToDraftFields(input) {
  const structured = input.structured && typeof input.structured === 'object' ? input.structured : {};
  const plan = structured.testPlan && typeof structured.testPlan === 'object' ? structured.testPlan : {};
  const claims = Array.isArray(structured.claims) ? structured.claims : [];
  const confidence = Number(structured.confidence ?? 0);
  return {
    review_type: String(plan.reviewType || 'control_test').slice(0, 200),
    notes:
      [
        String(plan.objective || 'Validate control operation against approved risk mapping.').slice(0, 2000),
        plan.procedure ? `Procedure: ${String(plan.procedure).slice(0, 1500)}` : null,
        plan.evidenceRequirements
          ? `Evidence: ${String(plan.evidenceRequirements).slice(0, 1000)}`
          : null,
        HUMAN_CONFIRM,
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 8000),
    stage5Metadata: {
      aiUseCaseId: 'UC-RI-008',
      aiConfidence: confidence,
      aiClaims: claims.slice(0, 8),
      assignedTesterHint: plan.assignedTester || null,
      humanConfirmationRequired: [
        'Test execution and pass/fail must be recorded by authorised testers.',
        'AI cannot close assurance without independent human approval.',
      ],
      processingStatus: 'DRAFT_AI_TEST_PLAN',
    },
  };
}