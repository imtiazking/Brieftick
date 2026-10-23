/**
 * Deterministic per-target relationship counts and predicate qualification.
 */
import { resolveHubChangeIds } from './ri-graph-traverse.js';
import {
  attributableAssuranceFindingIds,
  directEvidenceIds,
} from './obligation-attribution.js';
import { assessmentsForChange } from './ri-canonical-links.js';

function actionObligationId(action) {
  if (!action) return null;
  if (action.sourceType === 'Obligation' && action.sourceId) return action.sourceId;
  return action.obligationId || null;
}

export function attributableControlIds(state, obligationId) {
  return (state.controls || [])
    .filter((c) => (c.obligationIds || []).includes(obligationId))
    .map((c) => c.id);
}

export function attributableActionIds(state, obligationId) {
  return (state.actions || [])
    .filter((a) => actionObligationId(a) === obligationId)
    .map((a) => a.id);
}

export function relationshipCountsForTarget(state, targetType, targetId) {
  if (targetType === 'Obligation') {
    const evidenceIds = directEvidenceIds(state, targetId);
    const findingIds = attributableAssuranceFindingIds(state, targetId);
    return {
      evidenceCount: evidenceIds.length,
      assuranceFindingCount: findingIds.length,
      controlCount: attributableControlIds(state, targetId).length,
      actionCount: attributableActionIds(state, targetId).length,
      evidenceIds,
      assuranceFindingIds: findingIds,
    };
  }
  if (targetType === 'Change') {
    const iaIds = assessmentsForChange(state, targetId).map((a) => a.id);
    const findingIds = (state.assuranceFindings || state.findings || [])
      .filter((f) => f.changeId === targetId)
      .map((f) => f.id);
    return {
      impactAssessmentCount: iaIds.length,
      assuranceFindingCount: findingIds.length,
      impactAssessmentIds: iaIds,
      assuranceFindingIds: findingIds,
    };
  }
  return {};
}

function countForConstraint(counts, type) {
  const map = {
    Evidence: counts.evidenceCount ?? 0,
    AssuranceFinding: counts.assuranceFindingCount ?? 0,
    Control: counts.controlCount ?? 0,
    Action: counts.actionCount ?? 0,
    ImpactAssessment: counts.impactAssessmentCount ?? 0,
  };
  return map[type] ?? 0;
}

export function targetMeetsConstraints(counts, requiredRelationships, excludedRelationships) {
  for (const r of requiredRelationships || []) {
    if (countForConstraint(counts, r.type) < (r.minimum ?? 1)) return false;
  }
  for (const e of excludedRelationships || []) {
    if (countForConstraint(counts, e.type) > (e.maximum ?? 0)) return false;
  }
  return true;
}

export function candidateTargetIds(state, plan, targetPredicate) {
  const targetType = targetPredicate.targetType;
  const { changeIds } = resolveHubChangeIds(state, plan);
  const hubScoped = targetPredicate.anchors?.length > 0;

  if (targetType === 'Obligation') {
    const pool = (state.obligations || []).filter((o) => o.changeId && (!hubScoped || changeIds.includes(o.changeId)));
    return pool.map((o) => o.id);
  }
  if (targetType === 'Change') {
    if (hubScoped) return changeIds;
    return (state.changes || []).map((c) => c.id);
  }
  return [];
}

export function evaluateTargetPredicate(state, plan, targetPredicate) {
  const candidateIds = candidateTargetIds(state, plan, targetPredicate);
  const targetPredicateFacts = {};
  const qualifying = [];

  for (const id of candidateIds) {
    const counts = relationshipCountsForTarget(state, targetPredicate.targetType, id);
    const qualifies = targetMeetsConstraints(
      counts,
      targetPredicate.requiredRelationships,
      targetPredicate.excludedRelationships
    );
    targetPredicateFacts[id] = {
      evidenceCount: counts.evidenceCount ?? 0,
      assuranceFindingCount: counts.assuranceFindingCount ?? 0,
      controlCount: counts.controlCount ?? 0,
      actionCount: counts.actionCount ?? 0,
      impactAssessmentCount: counts.impactAssessmentCount ?? 0,
      qualifies,
    };
    if (qualifies) qualifying.push(id);
  }

  const fw = targetPredicate.anchors?.find((a) => a.type === 'Framework');
  const anchorLabel =
    fw?.label || targetPredicate.anchors?.map((a) => a.label).join(' / ') || 'matching';

  return {
    qualifying,
    candidateCount: candidateIds.length,
    qualifyingCount: qualifying.length,
    targetPredicateFacts,
    scopeChangeIds: resolveHubChangeIds(state, plan).changeIds,
    predicateResult: {
      type: 'target-relationship-predicate',
      targetType: targetPredicate.targetType,
      operation: targetPredicate.operation,
      qualifyingIds: qualifying,
      candidateCount: candidateIds.length,
      qualifyingCount: qualifying.length,
      predicateEvaluationComplete: true,
      anchorLabel,
      requiredRelationships: targetPredicate.requiredRelationships,
      excludedRelationships: targetPredicate.excludedRelationships,
      scopeChangeIds: resolveHubChangeIds(state, plan).changeIds,
    },
  };
}
