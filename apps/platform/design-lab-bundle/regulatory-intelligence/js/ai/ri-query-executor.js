/**
 * Ask RI deterministic executor (Route B) — registry + canonical fields only.
 */
import { labTodayISO } from '../platform/clock.js';
import { obligationStatusIsOpen, obligationStatusIsOpenForLinkedWork } from './obligation-portfolio.js';
import { planTargetTypes, actionIsOverdueAsOf } from './ri-graph-normalized.js';
import { resolveHubChangeIds, formatAsOfLabel } from './ri-graph-traverse.js';

const CHANGE_NOT_CURRENTLY_RELEVANT = new Set([
  'Complete',
  'Superseded',
  'Withdrawn',
  'Cancelled',
  'Closed',
  'Horizon',
]);

function changeIsCurrentlyRelevant(change, plan = {}) {
  if (!change) return false;
  const status = change.status || '';
  if (CHANGE_NOT_CURRENTLY_RELEVANT.has(status)) return false;
  const futureFacing = plan.temporalFilters?.includes('horizon');
  if (futureFacing) return status === 'Horizon' || /horizon|consultation/i.test(status);
  if (status === 'Horizon') return false;
  return true;
}
import { evaluateTargetPredicate } from './target-predicate-eval.js';
import { directEvidenceIds, inheritedEvidenceSupportNotes } from './obligation-attribution.js';
import {
  obligationsForChange,
  assessmentsForChange,
  controlsForChange,
  policiesForChange,
  risksForChange,
  actionsForChange,
  assuranceFindingsForObligation,
  controlsSupportingObligation,
  actionObligationId,
  filterActionsByStatus,
} from './ri-canonical-links.js';

export const ASK_RI_RESULT_STATES = {
  RESOLVED: 'RESOLVED',
  ZERO_QUALIFIERS: 'ZERO_QUALIFIERS',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  UNRESOLVED_QUERY_SEMANTICS: 'UNRESOLVED_QUERY_SEMANTICS',
  AMBIGUOUS_QUERY: 'AMBIGUOUS_QUERY',
};

function recordPassesStatus(state, type, id, plan, asOfDate) {
  const filters = plan?.statusFilters || [];
  const rec =
    type === 'Obligation'
      ? state.obligations?.find((o) => o.id === id)
      : type === 'Action'
        ? state.actions?.find((a) => a.id === id)
        : type === 'Change'
          ? state.changes?.find((c) => c.id === id)
          : null;
  if (!rec) return true;
  for (const f of filters) {
    if (!f.appliesTo?.includes(type)) continue;
    if (f.id === 'open' && type === 'Obligation') {
      if (!obligationStatusIsOpenForLinkedWork(rec.status)) return false;
    }
    if (f.id === 'open' && type === 'Action') {
      if (rec.status === 'Complete' || rec.status === 'Closed') return false;
    }
    if (f.id === 'overdue' && type === 'Action') {
      if (!actionIsOverdueAsOf(rec, asOfDate)) return false;
    }
    if (f.id === 'overdue' && type === 'Obligation') {
      if (rec.status !== 'Overdue' && !/overdue/i.test(rec.status || '')) return false;
    }
    if (f.id === 'current' && type === 'Change') {
      if (!changeIsCurrentlyRelevant(rec, plan)) return false;
    }
  }
  return true;
}

function pathSegmentAnchor(anchors) {
  return (anchors || []).map((ent) => ({ kind: 'anchor', type: ent.type, id: ent.id, label: ent.label }));
}

const PREFERRED_EDGES = new Set(['obligation_supported_by_control', 'evidence_attributed_to_obligation', 'action_source_obligation']);

function pathScore(path) {
  let s = 0;
  for (const seg of path || []) {
    if (seg.kind === 'edge' && PREFERRED_EDGES.has(seg.edgeType)) s += 10;
  }
  return s;
}

function pushRecord(bucket, pathByRecordId, state, type, id, path, reason) {
  const existing = pathByRecordId[id];
  if (existing && pathScore(existing) >= pathScore(path)) {
    if (!bucket.matchedRecordIds.includes(id)) {
      bucket.matchedRecordIds.push(id);
      bucket.recordTypes[id] = type;
      bucket.matchReasons[id] = reason;
    }
    return;
  }
  if (!bucket.matchedRecordIds.includes(id)) bucket.matchedRecordIds.push(id);
  bucket.recordTypes[id] = type;
  bucket.matchReasons[id] = reason;
  pathByRecordId[id] = path;
}

function expandSecondaryFromChanges(
  state,
  changeIds,
  plan,
  bucket,
  pathByRecordId,
  anchors,
  summary,
  asOfDate,
  primaryType,
  evaluatedCounts,
  evaluatedRelations
) {
  const want = new Set(plan.secondaryIntents || []);
  const relTo = new Set((plan.relationshipRequests || []).map((r) => r.to));
  const requireLinked = new Set(plan.requireLinkedTo || []);
  const anchorPath = pathSegmentAnchor(anchors);

  const shouldExpand = (kind) => {
    if (kind === 'ImpactAssessment') {
      return want.has('linked-assessments') || relTo.has('ImpactAssessment');
    }
    if (kind === 'Obligation') {
      return want.has('linked-obligations') || relTo.has('Obligation');
    }
    if (kind === 'Action') {
      return want.has('linked-actions') || relTo.has('Action') || requireLinked.has('Action');
    }
    if (kind === 'Risk') {
      return want.has('linked-risks') || relTo.has('Risk');
    }
    if (kind === 'Control') {
      return primaryType !== 'Control' && (want.has('linked-controls') || relTo.has('Control'));
    }
    return false;
  };

  const markEval = (key, count) => {
    evaluatedCounts[key] = { evaluated: true, count };
    evaluatedRelations.push(key);
    if (key === 'Action') summary.linkedActionCount = count;
    if (key === 'Obligation') summary.linkedObligationCount = count;
    if (key === 'Control') summary.linkedControlCount = count;
    if (key === 'Risk') summary.linkedRiskCount = count;
    if (key === 'ImpactAssessment') summary.linkedAssessmentCount = count;
  };

  let iaCount = 0;
  let oblCount = 0;
  let actCount = 0;
  let riskCount = 0;
  let ctrlCount = 0;

  for (const changeId of changeIds) {
    const changePath = [...anchorPath, { kind: 'node', type: 'Change', id: changeId }];

    if (shouldExpand('ImpactAssessment')) {
      assessmentsForChange(state, changeId).forEach((a) => {
        iaCount += 1;
        summary.linkedAssessmentCount += 1;
        pushRecord(
          bucket,
          pathByRecordId,
          state,
          'ImpactAssessment',
          a.id,
          [...changePath, { kind: 'edge', edgeType: 'assessment_for_change' }, { kind: 'node', type: 'ImpactAssessment', id: a.id }],
          `Impact assessment for change ${changeId}`
        );
      });
    }

    const obls = obligationsForChange(state, changeId).filter((o) =>
      recordPassesStatus(state, 'Obligation', o.id, plan, asOfDate)
    );

    if (shouldExpand('Obligation')) {
      obls.forEach((o) => {
        oblCount += 1;
        summary.linkedObligationCount += 1;
        pushRecord(
          bucket,
          pathByRecordId,
          state,
          'Obligation',
          o.id,
          [...changePath, { kind: 'edge', edgeType: 'obligation_for_change' }, { kind: 'node', type: 'Obligation', id: o.id }],
          `Obligation on change ${changeId}`
        );
      });
    }

    if (shouldExpand('Action')) {
      actionsForChange(state, changeId)
        .filter((a) => recordPassesStatus(state, 'Action', a.id, plan, asOfDate))
        .forEach((a) => {
          actCount += 1;
          summary.linkedActionCount += 1;
          const oid = actionObligationId(a);
          const path = oid
            ? [
                ...changePath,
                { kind: 'edge', edgeType: 'obligation_for_change' },
                { kind: 'node', type: 'Obligation', id: oid },
                { kind: 'edge', edgeType: 'action_source_obligation' },
                { kind: 'node', type: 'Action', id: a.id },
              ]
            : [...changePath, { kind: 'node', type: 'Action', id: a.id }];
          pushRecord(bucket, pathByRecordId, state, 'Action', a.id, path, `Action sourced from obligation on change ${changeId}`);
        });
    }

    if (shouldExpand('Risk')) {
      risksForChange(state, changeId).forEach((r) => {
        riskCount += 1;
        summary.linkedRiskCount += 1;
        pushRecord(
          bucket,
          pathByRecordId,
          state,
          'Risk',
          r.id,
          [...changePath, { kind: 'edge', edgeType: 'risk_originates_change' }, { kind: 'node', type: 'Risk', id: r.id }],
          `Risk originating change ${changeId}`
        );
      });
    }

    if (shouldExpand('Control')) {
      controlsForChange(state, changeId).forEach((c) => {
        ctrlCount += 1;
        summary.linkedControlCount += 1;
        pushRecord(
          bucket,
          pathByRecordId,
          state,
          'Control',
          c.id,
          [...changePath, { kind: 'edge', edgeType: 'control_for_change' }, { kind: 'node', type: 'Control', id: c.id }],
          `Control for change ${changeId}`
        );
      });
    }
  }

  if (shouldExpand('ImpactAssessment')) markEval('ImpactAssessment', iaCount);
  if (shouldExpand('Obligation')) markEval('Obligation', oblCount);
  if (shouldExpand('Action')) markEval('Action', actCount);
  if (shouldExpand('Risk')) markEval('Risk', riskCount);
  if (shouldExpand('Control')) markEval('Control', ctrlCount);
}

function emptyEvalCounts() {
  return {
    Change: { evaluated: false, count: null },
    Obligation: { evaluated: false, count: null },
    Action: { evaluated: false, count: null },
    Control: { evaluated: false, count: null },
    Risk: { evaluated: false, count: null },
    ImpactAssessment: { evaluated: false, count: null },
    Evidence: { evaluated: false, count: null },
    AssuranceFinding: { evaluated: false, count: null },
  };
}

function executeGraphPlan(state, plan, options = {}) {
  const asOfDate = options.asOfDate || labTodayISO();
  const bucket = { matchedRecordIds: [], recordTypes: {}, matchReasons: {} };
  const pathByRecordId = {};
  const evaluatedCounts = emptyEvalCounts();
  const evaluatedRelations = [];
  const summary = {
    linkedActionCount: 0,
    linkedObligationCount: 0,
    linkedAssessmentCount: 0,
    linkedRiskCount: 0,
    linkedControlCount: 0,
    linkedEvidenceCount: 0,
    linkedAssuranceCount: 0,
  };
  const secondaryGaps = [];
  const { changeIds, anchors } = resolveHubChangeIds(state, plan);
  const anchorPath = pathSegmentAnchor(anchors);
  const targets = planTargetTypes(plan);
  const primaryType = plan.primaryTargetType || 'Change';
  let primaryCount = 0;
  const primaryResultIds = [];

  const scopedChanges = changeIds.filter((id) => recordPassesStatus(state, 'Change', id, plan, asOfDate));

  if (primaryType === 'Change') {
    scopedChanges.forEach((id) => {
      primaryResultIds.push(id);
      pushRecord(
        bucket,
        pathByRecordId,
        state,
        'Change',
        id,
        [...anchorPath, { kind: 'node', type: 'Change', id }],
        `Regulatory change in query scope`
      );
    });
    primaryCount = scopedChanges.length;
    evaluatedCounts.Change = { evaluated: true, count: primaryCount };
    evaluatedRelations.push('Change');
  }

  if (primaryType === 'Obligation') {
    const obls = [];
    for (const cid of scopedChanges) {
      obligationsForChange(state, cid)
        .filter((o) => recordPassesStatus(state, 'Obligation', o.id, plan, asOfDate))
        .forEach((o) => obls.push(o));
    }
    obls.forEach((o) => {
      primaryResultIds.push(o.id);
      pushRecord(
        bucket,
        pathByRecordId,
        state,
        'Obligation',
        o.id,
        [
          ...anchorPath,
          { kind: 'node', type: 'Change', id: o.changeId },
          { kind: 'edge', edgeType: 'obligation_for_change' },
          { kind: 'node', type: 'Obligation', id: o.id },
        ],
        `Obligation in query scope`
      );
    });
    primaryCount = obls.length;
    evaluatedCounts.Obligation = { evaluated: true, count: primaryCount };
    evaluatedRelations.push('Obligation');

    if (targets.has('Evidence') || targets.has('Assurance') || targets.has('AssuranceFinding')) {
      let evCount = 0;
      let findCount = 0;
      for (const o of obls) {
        for (const eid of directEvidenceIds(state, o.id)) {
          evCount += 1;
          summary.linkedEvidenceCount += 1;
          pushRecord(
            bucket,
            pathByRecordId,
            state,
            'Evidence',
            eid,
            [
              ...anchorPath,
              { kind: 'node', type: 'Change', id: o.changeId },
              { kind: 'node', type: 'Obligation', id: o.id },
              { kind: 'edge', edgeType: 'evidence_attributed_to_obligation' },
              { kind: 'node', type: 'Evidence', id: eid },
            ],
            `Evidence attributed to ${o.id}`
          );
        }
        for (const fid of assuranceFindingsForObligation(state, o.id)) {
          findCount += 1;
          summary.linkedAssuranceCount += 1;
          pushRecord(
            bucket,
            pathByRecordId,
            state,
            'AssuranceFinding',
            fid,
            [
              ...anchorPath,
              { kind: 'node', type: 'Change', id: o.changeId },
              { kind: 'node', type: 'Obligation', id: o.id },
              { kind: 'edge', edgeType: 'finding_via_sourced_action' },
              { kind: 'node', type: 'AssuranceFinding', id: fid },
            ],
            `Assurance finding linked via action sourced from ${o.id}`
          );
        }
      }
      if (targets.has('Evidence')) {
        evaluatedCounts.Evidence = { evaluated: true, count: evCount };
        evaluatedRelations.push('Evidence');
      }
      if (targets.has('Assurance') || targets.has('AssuranceFinding')) {
        evaluatedCounts.AssuranceFinding = { evaluated: true, count: findCount };
        evaluatedRelations.push('AssuranceFinding');
      }
    }
  }

  if (primaryType === 'Control') {
    const requireOpenObl =
      plan.statusFilters?.some((f) => f.id === 'open' && f.appliesTo?.includes('Obligation')) ||
      plan.relationshipRequests?.some((r) => r.from === 'Control' && r.to === 'Obligation');
    const controls = [];
    for (const cid of scopedChanges) {
      if (requireOpenObl) {
        obligationsForChange(state, cid)
          .filter((o) => obligationStatusIsOpenForLinkedWork(o.status))
          .forEach((o) => {
            controlsSupportingObligation(state, o.id).forEach((c) => {
              if (!controls.some((x) => x.control.id === c.id)) controls.push({ control: c, obl: o });
            });
          });
      } else {
        controlsForChange(state, cid).forEach((c) => controls.push({ control: c, obl: null }));
      }
    }
    controls.forEach(({ control: c, obl }) => {
      primaryResultIds.push(c.id);
      const path = obl
        ? [
            ...anchorPath,
            { kind: 'node', type: 'Change', id: c.changeId },
            { kind: 'node', type: 'Obligation', id: obl.id },
            { kind: 'edge', edgeType: 'obligation_supported_by_control' },
            { kind: 'node', type: 'Control', id: c.id },
          ]
        : [
            ...anchorPath,
            { kind: 'node', type: 'Change', id: c.changeId },
            { kind: 'edge', edgeType: 'control_for_change' },
            { kind: 'node', type: 'Control', id: c.id },
          ];
      pushRecord(bucket, pathByRecordId, state, 'Control', c.id, path, `Control in query scope`);
    });
    primaryCount = controls.length;
    evaluatedCounts.Control = { evaluated: true, count: primaryCount };
    evaluatedRelations.push('Control');
  }

  if (primaryType === 'Action') {
    const acts = [];
    for (const cid of scopedChanges) {
      actionsForChange(state, cid)
        .filter((a) => recordPassesStatus(state, 'Action', a.id, plan, asOfDate))
        .forEach((a) => acts.push(a));
    }
    acts.forEach((a) => {
      primaryResultIds.push(a.id);
      const oid = actionObligationId(a);
      pushRecord(
        bucket,
        pathByRecordId,
        state,
        'Action',
        a.id,
        oid
          ? [
              ...anchorPath,
              { kind: 'node', type: 'Change', id: state.obligations?.find((o) => o.id === oid)?.changeId || scopedChanges[0] },
              { kind: 'node', type: 'Obligation', id: oid },
              { kind: 'edge', edgeType: 'action_source_obligation' },
              { kind: 'node', type: 'Action', id: a.id },
            ]
          : [...anchorPath, { kind: 'node', type: 'Action', id: a.id }],
        `Action in query scope`
      );
    });
    primaryCount = acts.length;
    evaluatedCounts.Action = { evaluated: true, count: primaryCount };
    evaluatedRelations.push('Action');

    if (targets.has('Obligation')) {
      const oblIds = new Set();
      acts.forEach((a) => {
        const oid = actionObligationId(a);
        if (oid) oblIds.add(oid);
      });
      let oblLinkCount = 0;
      oblIds.forEach((oid) => {
        const o = state.obligations?.find((x) => x.id === oid);
        if (!o) return;
        oblLinkCount += 1;
        summary.linkedObligationCount += 1;
        pushRecord(
          bucket,
          pathByRecordId,
          state,
          'Obligation',
          oid,
          [
            ...anchorPath,
            { kind: 'node', type: 'Change', id: o.changeId },
            { kind: 'edge', edgeType: 'obligation_for_change' },
            { kind: 'node', type: 'Obligation', id: oid },
          ],
          `Obligation linked to scoped action`
        );
      });
      evaluatedCounts.Obligation = { evaluated: true, count: oblLinkCount };
      evaluatedRelations.push('Obligation');
    }
  }

  expandSecondaryFromChanges(
    state,
    scopedChanges,
    plan,
    bucket,
    pathByRecordId,
    anchors,
    summary,
    asOfDate,
    primaryType,
    evaluatedCounts,
    evaluatedRelations
  );

  if (targets.has('Action') && evaluatedCounts.Action.evaluated && evaluatedCounts.Action.count === 0 && primaryCount > 0) {
    secondaryGaps.push('linked-actions');
  }
  if (
    plan.statusFilters?.some((f) => f.id === 'open' && f.appliesTo?.includes('Obligation')) &&
    evaluatedCounts.Obligation.evaluated &&
    evaluatedCounts.Obligation.count === 0 &&
    primaryCount > 0
  ) {
    secondaryGaps.push('linked-open-obligations');
  }

  const actionRecords = bucket.matchedRecordIds.filter((id) => bucket.recordTypes[id] === 'Action');
  const linkedActionStatuses = actionRecords
    .map((id) => state.actions?.find((a) => a.id === id))
    .filter(Boolean)
    .map((a) => ({
      actionId: a.id,
      status: a.status,
      dueDate: a.dueDate,
      overdueAsOf: actionIsOverdueAsOf(a, asOfDate),
    }));

  return {
    bucket,
    pathByRecordId,
    summary,
    secondaryGaps,
    primaryCount,
    primaryResultIds,
    scopedChangeIds: changeIds,
    evaluatedCounts,
    evaluatedRelations: [...new Set(evaluatedRelations)],
    metaActionFacts: {
      asOfDate,
      linkedActionStatuses,
      asOfDateLabel: formatAsOfLabel(asOfDate),
    },
  };
}

export function executeTargetPredicatePlan(state, plan, bucket, pathByRecordId) {
  const evalResult = evaluateTargetPredicate(state, plan, plan.targetPredicate);
  const { changeIds, anchors } = resolveHubChangeIds(state, plan);
  const hubScoped = (plan.targetPredicate.anchors || []).length > 0;
  if (hubScoped && !changeIds.length) {
    return { primaryCount: 0, scopeChangeIds: [], predicateMeta: null };
  }

  const anchorPath = pathSegmentAnchor(anchors);
  const targetType = plan.targetPredicate.targetType;

  for (const tid of evalResult.qualifying) {
    if (targetType === 'Obligation') {
      const obl = (state.obligations || []).find((o) => o.id === tid);
      const path = [
        ...anchorPath,
        { kind: 'node', type: 'Change', id: obl.changeId },
        { kind: 'node', type: 'Obligation', id: tid },
      ];
      const facts = evalResult.targetPredicateFacts[tid] || {};
      const evLine = facts.evidenceCount > 0 ? `Evidence: ${directEvidenceIds(state, tid).join(', ')}` : 'Evidence: none';
      const findLine =
        facts.assuranceFindingCount > 0 ? `Assurance findings: ${facts.assuranceFindingCount}` : 'Assurance findings: none';
      pushRecord(bucket, pathByRecordId, state, 'Obligation', tid, path, `Predicate match — ${evLine}; ${findLine}`);
      for (const eid of directEvidenceIds(state, tid)) {
        pushRecord(
          bucket,
          pathByRecordId,
          state,
          'Evidence',
          eid,
          [...path, { kind: 'edge', edgeType: 'evidence_attributed_to_obligation' }, { kind: 'node', type: 'Evidence', id: eid }],
          `Attributed evidence for ${tid}`
        );
      }
    } else if (targetType === 'Change') {
      const path = [...anchorPath, { kind: 'node', type: 'Change', id: tid }];
      const facts = evalResult.targetPredicateFacts[tid] || {};
      const iaLine =
        facts.impactAssessmentCount > 0 ? `Impact assessments: ${facts.impactAssessmentCount}` : 'Impact assessments: none';
      pushRecord(bucket, pathByRecordId, state, 'Change', tid, path, `Predicate match — ${iaLine}`);
    }
  }

  return {
    primaryCount: evalResult.qualifying.length,
    scopeChangeIds: changeIds,
    predicateMeta: {
      predicateResult: evalResult.predicateResult,
      targetPredicateFacts: evalResult.targetPredicateFacts,
      primaryResultIds: evalResult.qualifying,
      requestedTargetType: targetType,
      predicateEvaluation: {
        candidateCount: evalResult.candidateCount,
        qualifyingCount: evalResult.qualifyingCount,
        predicateEvaluationComplete: true,
        requestedTargetType: targetType,
        anchorLabel: evalResult.predicateResult?.anchorLabel,
      },
    },
  };
}

export function resolveAskRiResultState({ intent, entityInsufficient, hubScoped, scopeChangeIds, primaryCount, qualifyingCount, hasIntent }) {
  if (entityInsufficient) return ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE;
  if (!hasIntent) return ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS;
  if (intent === 'target-predicate') {
    if (hubScoped && !scopeChangeIds?.length) return ASK_RI_RESULT_STATES.ZERO_QUALIFIERS;
    if (qualifyingCount === 0 && (scopeChangeIds?.length || !hubScoped)) return ASK_RI_RESULT_STATES.ZERO_QUALIFIERS;
    return ASK_RI_RESULT_STATES.RESOLVED;
  }
  if (intent === 'reviewed-cross-source' || intent === 'regulator-sector-evidence') {
    return primaryCount > 0 ? ASK_RI_RESULT_STATES.RESOLVED : ASK_RI_RESULT_STATES.ZERO_QUALIFIERS;
  }
  if (intent === 'count-open-obligations') {
    return primaryCount > 0 ? ASK_RI_RESULT_STATES.RESOLVED : ASK_RI_RESULT_STATES.ZERO_QUALIFIERS;
  }
  if (hubScoped && scopeChangeIds?.length === 0) return ASK_RI_RESULT_STATES.ZERO_QUALIFIERS;
  if (primaryCount === 0) return ASK_RI_RESULT_STATES.ZERO_QUALIFIERS;
  return ASK_RI_RESULT_STATES.RESOLVED;
}

export { executeGraphPlan, inheritedEvidenceSupportNotes };
