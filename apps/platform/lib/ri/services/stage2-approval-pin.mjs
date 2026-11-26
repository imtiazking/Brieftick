/**
 * Canonical Stage 2 impact payload for approval pinning. Reviewers may approve only the pin prepared at submit-for-review.
 */

const IMPACT_PIN_KEYS = [
  'business_impact',
  'operational_impact',
  'technology_impact',
  'compliance_impact',
  'financial_impact',
  'implementation_complexity',
  'materiality',
  'owner_user_id',
  'business_areas',
];

function pickImpactPinFields(impact) {
  if (!impact || typeof impact !== 'object') return {};
  const out = {};
  for (const k of IMPACT_PIN_KEYS) {
    if (k in impact && impact[k] !== undefined) out[k] = impact[k];
  }
  if (Array.isArray(out.business_areas)) {
    out.business_areas = [...out.business_areas].map(String).sort();
  }
  return out;
}

/**
 * @param {import('./obligation-impact-downstream.ts').Stage2Draft} draft
 */
export function buildStage2ApprovalPinFromDraft(draft) {
  if (!draft || typeof draft !== 'object') return null;
  if (draft.kind === 'reuse') {
    return { kind: 'reuse', impactAssessmentId: draft.impactAssessmentId, pinnedAt: new Date().toISOString() };
  }
  if (draft.kind === 'skip') {
    return { kind: 'skip', reason: draft.reason, pinnedAt: new Date().toISOString() };
  }
  if (draft.kind === 'unavailable') {
    return { kind: 'unavailable', reason: draft.reason, pinnedAt: new Date().toISOString() };
  }
  if (draft.kind === 'create') {
    return {
      kind: 'create',
      impact: pickImpactPinFields(draft.impact),
      pinnedAt: new Date().toISOString(),
    };
  }
  return null;
}

export function impactMatchesApprovalPin(pin, impactPayload) {
  if (!pin || pin.kind !== 'create') return false;
  const a = pickImpactPinFields(pin.impact);
  const b = pickImpactPinFields(impactPayload);
  return JSON.stringify(a) === JSON.stringify(b);
}