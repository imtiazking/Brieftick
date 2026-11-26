/**
 * Control-to-obligation coverage. Controls must address the actual regulatory requirement, so each proposal
 * declares which obligation limb it addresses and through which control category; the declaration is checked
 * against the limbs the platform derived from the provision. Existing organisational controls are never invented.
 */
import { LIMB_KINDS } from './provision-breakdown.mjs';

export const CONTROL_COVERAGE_VERSION = 'control-coverage-v1';

export const CONTROL_CATEGORIES = Object.freeze([
  'detection',
  'notification',
  'information_completeness',
  'timeliness',
  'monitoring',
  'evidence_retention',
]);

/** Control categories a limb kind calls for. */
const CATEGORY_FOR_KIND = {
  [LIMB_KINDS.APPLICABILITY_CONDITION]: 'detection',
  [LIMB_KINDS.MANDATORY_NOTIFICATION]: 'notification',
  [LIMB_KINDS.MANDATORY_INFORMATION]: 'information_completeness',
  [LIMB_KINDS.TOGETHER_REQUIREMENT]: 'information_completeness',
};

function normaliseCategory(c) {
  const v = String(c ?? '').toLowerCase().replace(/[^a-z_]/g, '_');
  return CONTROL_CATEGORIES.includes(v) ? v : null;
}

/**
 * Requirements a control set should cover for an obligation.
 * Derived from the limb breakdown when stored; otherwise only the generic monitoring/evidence requirements are known.
 * @param {ReturnType<import('./lifecycle-evidence.mjs').buildRegulatoryEvidencePack> | null} pack
 */
export function deriveControlRequirements(pack) {
  const requirements = [];
  const limbs = pack?.breakdown?.limbs ?? [];
  const lead = limbs.find((l) => l.kind === LIMB_KINDS.OPERATIVE_LEAD_IN);
  for (const l of limbs) {
    const category = CATEGORY_FOR_KIND[l.kind];
    if (!category) continue;
    requirements.push({ reference: l.reference, category, basis: 'rule_limb', limbKind: l.kind });
  }
  if (lead && /as soon as possible|within|reasonable notice|before/i.test(lead.text)) {
    requirements.push({ reference: lead.reference, category: 'timeliness', basis: 'rule_limb', limbKind: lead.kind });
  }
  // Operational hygiene controls; recommended, not themselves stated by the rule.
  requirements.push({ reference: pack?.provision?.reference ?? null, category: 'monitoring', basis: 'recommended_not_rule_text', limbKind: null });
  requirements.push({ reference: pack?.provision?.reference ?? null, category: 'evidence_retention', basis: 'recommended_not_rule_text', limbKind: null });
  return { requirements, limbBreakdownAvailable: limbs.length > 0 };
}

/**
 * @param {Array<Record<string, any>>} proposals all controlProposals[] returned by the model (none discarded)
 * @param {ReturnType<typeof buildRegulatoryEvidencePack> | null} pack
 */
export function assessControlCoverage(proposals, pack) {
  const { requirements, limbBreakdownAvailable } = deriveControlRequirements(pack);
  const knownRefs = new Set(requirements.map((r) => r.reference).filter(Boolean));
  const perProposal = (Array.isArray(proposals) ? proposals : []).map((p, index) => {
    const declared = Array.isArray(p?.coverage) ? p.coverage : [];
    const accepted = [];
    const rejected = [];
    for (const c of declared) {
      const ref = typeof c?.obligationLimb === 'string' ? c.obligationLimb.replace(/\s+/g, ' ').trim() : null;
      const category = normaliseCategory(c?.category);
      const justification = typeof c?.justification === 'string' ? c.justification.trim() : '';
      if (!category) rejected.push({ ref, reason: 'unknown_control_category' });
      else if (justification.length < 20) rejected.push({ ref, category, reason: 'coverage_justification_missing_or_too_short' });
      else if (limbBreakdownAvailable && ref && !knownRefs.has(ref)) rejected.push({ ref, category, reason: 'limb_not_in_platform_breakdown' });
      else accepted.push({ obligationLimb: ref, category, justification: justification.slice(0, 600) });
    }
    return { index, name: String(p?.name ?? '').slice(0, 200), accepted, rejected };
  });
  const covered = new Set();
  perProposal.forEach((p) => p.accepted.forEach((c) => covered.add(`${c.obligationLimb ?? ''}|${c.category}`)));
  const coveredByPrimary = new Set();
  (perProposal[0]?.accepted ?? []).forEach((c) => coveredByPrimary.add(`${c.obligationLimb ?? ''}|${c.category}`));
  const keyOf = (r) => `${r.reference ?? ''}|${r.category}`;
  const matches = (set, r) => set.has(keyOf(r)) || (r.basis !== 'rule_limb' && [...set].some((k) => k.endsWith(`|${r.category}`)));
  const gaps = requirements.filter((r) => !matches(covered, r));
  const gapsPrimaryOnly = requirements.filter((r) => !matches(coveredByPrimary, r));
  return {
    version: CONTROL_COVERAGE_VERSION,
    limbBreakdownAvailable,
    requirements,
    perProposal,
    gaps,
    gapsPrimaryControlOnly: gapsPrimaryOnly,
    ruleLimbGaps: gaps.filter((g) => g.basis === 'rule_limb'),
    complete: gaps.filter((g) => g.basis === 'rule_limb').length === 0,
  };
}
