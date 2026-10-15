/**
 * Independent expected values for RI acceptance (not derived from graph traversal under test).
 */
import { changesForSector, getSectorBySlug } from '../../js/landscape-helpers.js';
import {
  changesForRegulator,
  changesForTheme,
  frameworkChangeSeedIds,
} from '../../js/ai/ri-graph-traverse.js';
import { obligationStatusIsOpenForLinkedWork } from '../../js/ai/obligation-portfolio.js';
import {
  attributableAssuranceFindingIds,
  directEvidenceIds,
} from '../../js/ai/obligation-attribution.js';
import { relationshipCountsForTarget, targetMeetsConstraints } from '../../js/ai/target-predicate-eval.js';
import { parseRelationshipConstraints } from '../../js/ai/target-predicate-plan.js';

/** Obligations on sector changes that are ACTIVE ∪ REVIEW (linked-work semantics). */
export function countLinkedOpenWorkObligationsForSector(state, sectorSlug) {
  const sector = getSectorBySlug(state, sectorSlug);
  if (!sector) return 0;
  const changeIds = new Set(changesForSector(state, sector.id).map((c) => c.id));
  return (state.obligations || []).filter(
    (o) => o.changeId && changeIds.has(o.changeId) && obligationStatusIsOpenForLinkedWork(o.status)
  ).length;
}

export function consumerDutyAuthoritativeChangeIds(state) {
  const fw = (state.regulatoryFrameworks || []).find((f) => /consumer duty/i.test(f.name || ''));
  if (!fw) return [];
  return frameworkChangeSeedIds(state, fw.id).authoritative;
}

function obligationsOnChanges(state, changeIds) {
  const set = new Set(changeIds);
  return (state.obligations || []).filter((o) => o.changeId && set.has(o.changeId));
}

function expectedObligationsForConstraints(state, changeIds, question) {
  const { requiredRelationships, excludedRelationships } = parseRelationshipConstraints(question, 'Obligation');
  return obligationsOnChanges(state, changeIds)
    .filter((o) => {
      const counts = relationshipCountsForTarget(state, 'Obligation', o.id);
      return targetMeetsConstraints(counts, requiredRelationships, excludedRelationships);
    })
    .map((o) => o.id)
    .sort();
}

export function expectedConsumerDutyObligationsEvidenceNoFindings(state) {
  return expectedObligationsForConstraints(
    state,
    consumerDutyAuthoritativeChangeIds(state),
    'Which Consumer Duty obligations have evidence but no assurance findings?'
  );
}

export function expectedConsumerDutyObligationsNoEvidence(state) {
  return expectedObligationsForConstraints(
    state,
    consumerDutyAuthoritativeChangeIds(state),
    'Which Consumer Duty obligations have no evidence?'
  );
}

export function expectedOperationalResilienceObligationsEvidenceAndFindings(state) {
  const theme = (state.complianceThemes || []).find((t) => /operational resilience/i.test(t.name || ''));
  if (!theme) return [];
  const changeIds = changesForTheme(state, theme.id);
  const q = 'Which Operational Resilience obligations have evidence and assurance findings?';
  const { requiredRelationships, excludedRelationships } = parseRelationshipConstraints(q, 'Obligation');
  return obligationsOnChanges(state, changeIds)
    .filter((o) => {
      const counts = relationshipCountsForTarget(state, 'Obligation', o.id);
      return targetMeetsConstraints(counts, requiredRelationships, excludedRelationships);
    })
    .map((o) => o.id)
    .sort();
}

export function expectedChangesNoImpactAssessment(state) {
  const q = 'Which regulatory changes have no impact assessment?';
  const { requiredRelationships, excludedRelationships } = parseRelationshipConstraints(q, 'Change');
  return (state.changes || [])
    .filter((ch) => {
      const counts = relationshipCountsForTarget(state, 'Change', ch.id);
      return targetMeetsConstraints(counts, requiredRelationships, excludedRelationships);
    })
    .map((c) => c.id)
    .sort();
}

export function expectedHubIntersectionChangeIds(state, hubSpecs) {
  const sets = hubSpecs.map((spec) => {
    if (spec.type === 'Regulator') return new Set(changesForRegulator(state, spec.id));
    if (spec.type === 'Theme') return new Set(changesForTheme(state, spec.id));
    if (spec.type === 'Framework') return new Set(frameworkChangeSeedIds(state, spec.id).authoritative);
    return new Set();
  });
  if (!sets.length) return [];
  const [first, ...rest] = sets;
  return [...first].filter((id) => rest.every((s) => s.has(id))).sort();
}

export function expectedPraOperationalResilienceChangeIds(state) {
  const pra = (state.landscapeRegulators || []).find((r) => /pra|bank of england/i.test(`${r.shortName} ${r.name}`));
  const theme = (state.complianceThemes || []).find((t) => /operational resilience/i.test(t.name || ''));
  if (!pra || !theme) return [];
  return expectedHubIntersectionChangeIds(state, [
    { type: 'Regulator', id: pra.id },
    { type: 'Theme', id: theme.id },
  ]);
}

export function changeSatisfiesRegulator(state, changeId, regulatorId) {
  return changesForRegulator(state, regulatorId).includes(changeId);
}

export function changeSatisfiesTheme(state, changeId, themeId) {
  return changesForTheme(state, themeId).includes(changeId);
}

export { directEvidenceIds, attributableAssuranceFindingIds };
