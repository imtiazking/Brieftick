/**
 * Evidence-based materiality and implementation-complexity policy for UC-RI-004 drafts.
 * Model confidence and ungrounded dimension counts are never used as ratings.
 *
 * Materiality (customer/org exposure) stays UNASSESSED until organisational evidence is supplied.
 * Regulatory exposure and implementation scope may be scored from the verified evidence pack only,
 * stored as provisional AI recommendations pending human approval.
 */

export const IMPACT_MATERIALITY_POLICY_VERSION = 'impact-materiality-policy-v1';
export const UNASSESSED = 'UNASSESSED';
export const LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

const ORG_EVIDENCE_KEYS = Object.freeze([
  'businessAreasAffected',
  'customerAccountsInScope',
  'systemsInScope',
  'estimatedImplementationEffort',
  'priorBreachOrComplaintHistory',
]);

export const DEFAULT_THRESHOLDS = Object.freeze({
  regulatoryExposureHigh: 10,
  regulatoryExposureMedium: 5,
  complexityHigh: 5,
  complexityMedium: 2,
  minOrgEvidenceFields: 2,
  minOrgMaterialityRationaleChars: 40,
});

/** @returns {typeof DEFAULT_THRESHOLDS} */
export function loadImpactMaterialityThresholds() {
  const n = (key, fallback) => {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    regulatoryExposureHigh: n('RI_IMPACT_REG_EXPOSURE_HIGH', DEFAULT_THRESHOLDS.regulatoryExposureHigh),
    regulatoryExposureMedium: n('RI_IMPACT_REG_EXPOSURE_MEDIUM', DEFAULT_THRESHOLDS.regulatoryExposureMedium),
    complexityHigh: n('RI_IMPACT_COMPLEXITY_HIGH', DEFAULT_THRESHOLDS.complexityHigh),
    complexityMedium: n('RI_IMPACT_COMPLEXITY_MEDIUM', DEFAULT_THRESHOLDS.complexityMedium),
    minOrgEvidenceFields: n('RI_IMPACT_MIN_ORG_FIELDS', DEFAULT_THRESHOLDS.minOrgEvidenceFields),
    minOrgMaterialityRationaleChars: n(
      'RI_IMPACT_MIN_ORG_MATERIALITY_RATIONALE',
      DEFAULT_THRESHOLDS.minOrgMaterialityRationaleChars,
    ),
  };
}

function tier(score, { high, medium }) {
  if (score >= high) return 'HIGH';
  if (score >= medium) return 'MEDIUM';
  return 'LOW';
}

function breakdownFromPack(pack) {
  if (!pack || typeof pack !== 'object') return null;
  return pack.provisionBreakdown ?? pack.provision?.breakdown ?? null;
}

function verifiedRegulatoryClaims(structured) {
  const claims = Array.isArray(structured?.claims) ? structured.claims : [];
  return claims.filter((c) => {
    const ids = Array.isArray(c?.sourceSectionIds) ? c.sourceSectionIds : [];
    const hasReg = ids.some((id) => /^REG-/i.test(String(id)));
    const quote = String(c?.sourceQuotation ?? c?.quotation ?? '').trim();
    return hasReg && quote.length >= 12;
  });
}

/**
 * @param {{
 *   structured?: Record<string, unknown> | null;
 *   evidencePack?: Record<string, unknown> | null;
 *   organisationalEvidence?: Record<string, unknown> | null;
 *   thresholds?: ReturnType<typeof loadImpactMaterialityThresholds>;
 * }} input
 */
export function applyImpactMaterialityPolicy(input = {}) {
  const thresholds = input.thresholds ?? loadImpactMaterialityThresholds();
  const factors = [];
  let regulatoryExposureScore = 0;
  let complexityScore = 0;

  const pack = input.evidencePack && typeof input.evidencePack === 'object' ? input.evidencePack : null;
  const breakdown = breakdownFromPack(pack);
  const provisionRef = pack?.provision?.reference ? String(pack.provision.reference) : null;

  if (pack && provisionRef) {
    if (/R$/i.test(provisionRef) || pack.source?.bindingNature === 'binding_requirement') {
      regulatoryExposureScore += 4;
      factors.push({ id: 'binding_rule', points: 4, basis: 'Verified binding rule in evidence pack' });
    }
    const standalone = Array.isArray(breakdown?.standaloneObligationPaths) ? breakdown.standaloneObligationPaths.length : 0;
    if (standalone > 0) {
      const pts = Math.min(standalone * 2, 6);
      regulatoryExposureScore += pts;
      complexityScore += standalone;
      factors.push({ id: 'standalone_operative_limbs', points: pts, count: standalone });
    }
    const limbs = Array.isArray(breakdown?.limbs) ? breakdown.limbs : [];
    const customerFacing = limbs.some((l) => /borrower|customer|notify/i.test(String(l.text ?? '')));
    if (customerFacing) {
      regulatoryExposureScore += 3;
      factors.push({ id: 'customer_facing_obligations', points: 3 });
    }
    const expertCount = Array.isArray(breakdown?.expertJudgement) ? breakdown.expertJudgement.length : 0;
    if (expertCount) {
      complexityScore += Math.min(expertCount, 3);
      factors.push({ id: 'expert_judgement_flags', points: Math.min(expertCount, 3), count: expertCount });
    }
    if (pack.effective?.date && pack.effective?.status === 'resolved') {
      regulatoryExposureScore += 1;
      factors.push({ id: 'commencement_verified', points: 1, date: pack.effective.date });
    }
  }

  const verifiedClaims = verifiedRegulatoryClaims(input.structured ?? {});
  if (verifiedClaims.length) {
    complexityScore += Math.min(verifiedClaims.length, 3);
    factors.push({
      id: 'verified_regulatory_impact_claims',
      points: Math.min(verifiedClaims.length, 3),
      count: verifiedClaims.length,
    });
  }

  const regulatoryExposureTier = tier(regulatoryExposureScore, {
    high: thresholds.regulatoryExposureHigh,
    medium: thresholds.regulatoryExposureMedium,
  });
  const complexityTier = tier(complexityScore, {
    high: thresholds.complexityHigh,
    medium: thresholds.complexityMedium,
  });

  const org = input.organisationalEvidence && typeof input.organisationalEvidence === 'object' ? input.organisationalEvidence : null;
  const orgPopulated = org
    ? ORG_EVIDENCE_KEYS.filter((k) => {
        const v = org[k];
        return v != null && String(v).trim().length > 0;
      })
    : [];
  const orgRationale = org ? String(org.materialityRationale ?? '').trim() : '';

  /** @type {'UNASSESSED_NO_ORGANISATIONAL_EVIDENCE' | 'AI_PROVISIONAL_ORG_EVIDENCE' | 'HUMAN_APPROVED_MATERIALITY'} */
  let materialityStatus = 'UNASSESSED_NO_ORGANISATIONAL_EVIDENCE';
  let materiality = UNASSESSED;

  if (orgPopulated.length >= thresholds.minOrgEvidenceFields && orgRationale.length >= thresholds.minOrgMaterialityRationaleChars) {
    const orgDeclared = String(org.materialityLevel ?? '').toUpperCase();
    const base = LEVELS.includes(orgDeclared) ? orgDeclared : regulatoryExposureTier;
    materiality = `${base} (org-evidence-supported)`;
    materialityStatus = org.humanApproved === true ? 'HUMAN_APPROVED_MATERIALITY' : 'AI_PROVISIONAL_ORG_EVIDENCE';
  }

  let implementation_complexity = UNASSESSED;
  /** @type {'UNASSESSED' | 'AI_PROVISIONAL_REGULATORY_SCOPE'} */
  let complexityStatus = 'UNASSESSED';
  if (pack && provisionRef && (complexityScore > 0 || regulatoryExposureScore > 0)) {
    implementation_complexity = complexityScore > 0 ? `${complexityTier} (provisional)` : `${complexityTier} (provisional)`;
    complexityStatus = 'AI_PROVISIONAL_REGULATORY_SCOPE';
  }

  const rationaleLines = [
    `Regulatory exposure score ${regulatoryExposureScore} → recommended tier ${regulatoryExposureTier} (provisional, not a materiality decision).`,
    `Implementation scope score ${complexityScore} → provisional complexity ${complexityTier}.`,
    factors.length ? `Factors: ${factors.map((f) => f.id).join(', ')}.` : 'No regulatory evidence pack — no scope scoring.',
    materiality === UNASSESSED
      ? 'Materiality is UNASSESSED: organisational evidence (affected customers, systems, effort, breach history) was not supplied.'
      : `Materiality field reflects supplied organisational evidence (${orgPopulated.join(', ')}).`,
    'AI draft only — human approval required before treating any rating as an organisational assessment.',
  ];

  return {
    materiality,
    implementation_complexity,
    materialityAssessment: {
      policyVersion: IMPACT_MATERIALITY_POLICY_VERSION,
      materialityStatus,
      complexityStatus,
      assessmentOrigin: org?.humanApproved === true ? 'HUMAN_APPROVED' : 'AI_DRAFT',
      humanApprovalRequired: true,
      thresholds,
      scores: { regulatoryExposureScore, complexityScore },
      factors,
      regulatoryExposureRecommendation: pack ? `${regulatoryExposureTier} (provisional)` : null,
      complexityRecommendation: implementation_complexity === UNASSESSED ? null : implementation_complexity,
      organisationalEvidenceSupplied: orgPopulated.length > 0,
      organisationalEvidenceFields: orgPopulated,
      scoringRationale: rationaleLines,
      rejectedHeuristics: ['model_confidence_percent', 'ungrounded_dimension_count'],
    },
  };
}