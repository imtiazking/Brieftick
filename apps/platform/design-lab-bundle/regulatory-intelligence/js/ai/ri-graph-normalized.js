/**
 * Normalized RI relationship graph for Ask RI (built from hydrated store FKs).
 *
 * HUB types (Sector, Framework, Theme, Regulator) seed retrieval only — never mid-path hops.
 *
 * REVERSIBLE_EDGE_TYPES (navigation-only reverse edges; canonical FK remains authoritative):
 * - obligation_has_action (reverse of action_source_obligation)
 * - obligation_has_evidence (reverse of evidence_for_obligation)
 * - obligation_supported_by_control (reverse of control_supports_obligation)
 * - obligation_has_risk (reverse of risk_relates_obligation)
 * - obligation_addressed_by_policy (reverse of policy_addresses_obligation)
 * - assessment_has_action (reverse of action_source_assessment)
 * - action_has_finding (reverse of finding_links_action)
 * - obligation_has_finding (derived via change; not auto-reverse of finding→change)
 */
import { syncGraphLinks } from '../graph-sync.js';
import { daysBetween, parseDemoDate } from '../workflow-helpers.js';

export const HUB_NODE_TYPES = new Set(['Sector', 'Framework', 'Theme', 'Regulator']);

export const NODE_TYPES = [
  'Publication',
  'Change',
  'ImpactAssessment',
  'Obligation',
  'Policy',
  'Risk',
  'Control',
  'Action',
  'Evidence',
  'AssuranceFinding',
  'AssuranceReview',
  'ImplementationMapping',
];

/** Lifecycle edges only (hubs excluded). */
export const LIFECYCLE_EDGE_TYPES = [
  'change_sourced_from_publication',
  'assessment_for_change',
  'obligation_for_change',
  'obligation_for_assessment',
  'risk_originates_change',
  'control_for_change',
  'policy_for_change',
  'action_source_obligation',
  'action_source_assessment',
  'evidence_for_obligation',
  'evidence_for_control',
  'evidence_for_action',
  'evidence_for_publication',
  'control_supports_obligation',
  'risk_relates_obligation',
  'policy_addresses_obligation',
  'finding_for_change',
  'review_for_change',
  'finding_links_action',
  'finding_links_evidence',
  'obligation_has_action',
  'obligation_has_evidence',
  'obligation_supported_by_control',
  'obligation_has_risk',
  'obligation_addressed_by_policy',
  'assessment_has_action',
  'action_has_finding',
  'change_links_assessment',
  'change_links_obligation',
  'change_links_action',
  'change_links_risk',
  'change_links_control',
  'change_links_evidence',
];

export const REVERSIBLE_EDGE_TYPES = new Set([
  'obligation_has_action',
  'obligation_has_evidence',
  'obligation_supported_by_control',
  'obligation_has_risk',
  'obligation_addressed_by_policy',
  'assessment_has_action',
  'action_has_finding',
]);

/**
 * Max BFS depth across lifecycle edges (hubs excluded).
 * Longest demo path Theme→…→Assurance is 7 hops; 8 completes targets without unbounded expansion.
 */
export const MAX_TRAVERSAL_DEPTH = 8;

function nodeKey(type, id) {
  return `${type}:${id}`;
}

function parseKey(key) {
  const i = key.indexOf(':');
  return { type: key.slice(0, i), id: key.slice(i + 1) };
}

function addEdge(adj, fromType, fromId, toType, toId, edgeType, meta = {}) {
  if (!fromId || !toId) return;
  if (HUB_NODE_TYPES.has(toType)) return;
  const from = nodeKey(fromType, fromId);
  const to = nodeKey(toType, toId);
  if (!adj.has(from)) adj.set(from, []);
  adj.get(from).push({ to, toType, toId, edgeType, ...meta });
}

function actionObligationId(action) {
  if (!action) return null;
  if (action.obligationId) return action.obligationId;
  if (/obligation/i.test(action.sourceType || '') && action.sourceId) return action.sourceId;
  return null;
}

function actionAssessmentId(action) {
  if (!action) return null;
  if (/assessment/i.test(action.sourceType || '') && action.sourceId) return action.sourceId;
  return null;
}

export function buildNormalizedRiGraph(state) {
  const working = syncGraphLinks({ ...state });
  const adj = new Map();
  const conflicts = [];
  const blockedEdgeKeys = new Set();

  const pushConflict = (code, detail, edges = []) => {
    conflicts.push({ code, detail, edges });
    edges.forEach((e) => blockedEdgeKeys.add(e));
  };

  (working.publications || []).forEach((p) => {
    (working.changes || [])
      .filter((c) => c.publicationId === p.id)
      .forEach((c) => addEdge(adj, 'Change', c.id, 'Publication', p.id, 'change_sourced_from_publication'));
  });

  (working.assessments || []).forEach((a) => {
    if (a.changeId) addEdge(adj, 'ImpactAssessment', a.id, 'Change', a.changeId, 'assessment_for_change');
  });

  (working.obligations || []).forEach((o) => {
    if (o.changeId) addEdge(adj, 'Obligation', o.id, 'Change', o.changeId, 'obligation_for_change');
    if (o.assessmentId) addEdge(adj, 'Obligation', o.id, 'ImpactAssessment', o.assessmentId, 'obligation_for_assessment');
  });

  (working.risks || []).forEach((r) => {
    if (r.originatingChangeId) addEdge(adj, 'Risk', r.id, 'Change', r.originatingChangeId, 'risk_originates_change');
    (r.obligationIds || []).forEach((oid) => {
      addEdge(adj, 'Risk', r.id, 'Obligation', oid, 'risk_relates_obligation');
      addEdge(adj, 'Obligation', oid, 'Risk', r.id, 'obligation_has_risk', { derived: true });
    });
  });

  (working.controls || []).forEach((c) => {
    if (c.changeId) addEdge(adj, 'Control', c.id, 'Change', c.changeId, 'control_for_change');
    (c.obligationIds || []).forEach((oid) => {
      addEdge(adj, 'Control', c.id, 'Obligation', oid, 'control_supports_obligation');
      addEdge(adj, 'Obligation', oid, 'Control', c.id, 'obligation_supported_by_control', { derived: true });
    });
  });

  (working.policies || []).forEach((p) => {
    (p.changeIds || []).forEach((cid) => addEdge(adj, 'Policy', p.id, 'Change', cid, 'policy_for_change'));
    (p.obligationIds || []).forEach((oid) => {
      addEdge(adj, 'Policy', p.id, 'Obligation', oid, 'policy_addresses_obligation');
      addEdge(adj, 'Obligation', oid, 'Policy', p.id, 'obligation_addressed_by_policy', { derived: true });
    });
  });

  (working.actions || []).forEach((a) => {
    const oid = actionObligationId(a);
    const iaId = actionAssessmentId(a);
    if (oid) {
      addEdge(adj, 'Action', a.id, 'Obligation', oid, 'action_source_obligation');
      addEdge(adj, 'Obligation', oid, 'Action', a.id, 'obligation_has_action', { derived: true });
    }
    if (iaId) {
      addEdge(adj, 'Action', a.id, 'ImpactAssessment', iaId, 'action_source_assessment');
      addEdge(adj, 'ImpactAssessment', iaId, 'Action', a.id, 'assessment_has_action', { derived: true });
    }
  });

  (working.evidence || []).forEach((e) => {
    if (e.obligationId) {
      addEdge(adj, 'Evidence', e.id, 'Obligation', e.obligationId, 'evidence_for_obligation');
      addEdge(adj, 'Obligation', e.obligationId, 'Evidence', e.id, 'obligation_has_evidence', { derived: true });
    }
    if (e.controlId) addEdge(adj, 'Evidence', e.id, 'Control', e.controlId, 'evidence_for_control');
    if (e.actionId) addEdge(adj, 'Evidence', e.id, 'Action', e.actionId, 'evidence_for_action');
    if (e.publicationId) addEdge(adj, 'Evidence', e.id, 'Publication', e.publicationId, 'evidence_for_publication');
  });

  const findings = working.assuranceFindings || working.findings || [];
  findings.forEach((f) => {
    if (f.changeId) addEdge(adj, 'AssuranceFinding', f.id, 'Change', f.changeId, 'finding_for_change');
    (f.linkedActionIds || []).forEach((aid) => {
      addEdge(adj, 'AssuranceFinding', f.id, 'Action', aid, 'finding_links_action');
      addEdge(adj, 'Action', aid, 'AssuranceFinding', f.id, 'action_has_finding', { derived: true });
    });
    (f.evidenceIds || []).forEach((eid) => addEdge(adj, 'AssuranceFinding', f.id, 'Evidence', eid, 'finding_links_evidence'));
  });

  (working.assuranceReviews || []).forEach((r) => {
    if (r.changeId) addEdge(adj, 'AssuranceReview', r.id, 'Change', r.changeId, 'review_for_change');
  });

  // Integrity: denormalized Change.linked* vs canonical FKs (detect before change_links_action)
  (working.changes || []).forEach((ch) => {
    const computedObl = new Set((working.obligations || []).filter((o) => o.changeId === ch.id).map((o) => o.id));
    for (const oid of ch.linkedObligationIds || []) {
      if (!computedObl.has(oid)) {
        const ek = `${nodeKey('Change', ch.id)}>obligation_for_change>${nodeKey('Obligation', oid)}`;
        pushConflict(
          'change_linked_obligation_mismatch',
          `Change ${ch.id} linkedObligationIds includes ${oid} but obligation.changeId is not ${ch.id}`,
          [ek]
        );
      }
    }

    const assessmentIds = new Set(
      (working.assessments || []).filter((a) => a.changeId === ch.id).map((a) => a.id)
    );
    const computedAct = new Set(
      (working.actions || [])
        .filter((a) => {
          const oid = actionObligationId(a);
          if (oid && computedObl.has(oid)) return true;
          const iaId = actionAssessmentId(a);
          return iaId && assessmentIds.has(iaId);
        })
        .map((a) => a.id)
    );
    for (const aid of ch.linkedActionIds || []) {
      if (!computedAct.has(aid)) {
        const act = (working.actions || []).find((x) => x.id === aid);
        const oid = actionObligationId(act);
        const ek = `${nodeKey('Change', ch.id)}>change_linked_action_denorm>${nodeKey('Action', aid)}`;
        pushConflict(
          'change_linked_action_mismatch',
          `Change ${ch.id} linkedActionIds includes ${aid} but action ${aid} obligation link (${oid || 'none'}) is not on this change`,
          [ek]
        );
      }
    }
  });

  (working.changes || []).forEach((ch) => {
    (ch.linkedAssessmentIds || []).forEach((id) =>
      addEdge(adj, 'Change', ch.id, 'ImpactAssessment', id, 'change_links_assessment')
    );
    (ch.linkedObligationIds || []).forEach((id) => addEdge(adj, 'Change', ch.id, 'Obligation', id, 'change_links_obligation'));
    (ch.linkedActionIds || []).forEach((id) => {
      const ek = `${nodeKey('Change', ch.id)}>change_linked_action_denorm>${nodeKey('Action', id)}`;
      if (!blockedEdgeKeys.has(ek)) addEdge(adj, 'Change', ch.id, 'Action', id, 'change_links_action');
    });
    (ch.linkedRiskIds || []).forEach((id) => addEdge(adj, 'Change', ch.id, 'Risk', id, 'change_links_risk'));
    (ch.linkedControlIds || []).forEach((id) => addEdge(adj, 'Change', ch.id, 'Control', id, 'change_links_control'));
    (ch.linkedEvidenceIds || []).forEach((id) => addEdge(adj, 'Change', ch.id, 'Evidence', id, 'change_links_evidence'));
  });

  return {
    adjacency: adj,
    conflicts,
    blockedEdgeKeys,
    nodeTypes: NODE_TYPES,
    edgeTypes: LIFECYCLE_EDGE_TYPES,
    reversibleEdgeTypes: [...REVERSIBLE_EDGE_TYPES],
    maxDepth: MAX_TRAVERSAL_DEPTH,
  };
}

const PARENT_LEVEL_EDGES = new Set([
  'finding_for_change',
  'review_for_change',
  'change_links_evidence',
  'change_links_assessment',
  'change_links_risk',
  'change_links_control',
  'change_links_action',
]);

const DIRECT_OBLIGATION_EDGES = new Set([
  'obligation_has_evidence',
  'obligation_has_action',
  'obligation_supported_by_control',
  'obligation_has_risk',
  'obligation_addressed_by_policy',
]);

export function formatPathReason(pathSegments) {
  const parts = [];
  const nodes = [];
  let lastEdge = null;
  for (const s of pathSegments) {
    if (s.kind === 'anchor') parts.push(`Anchor ${s.type}:${s.label || s.id}`);
    else if (s.kind === 'edge') {
      lastEdge = s.edgeType;
      parts.push(`→ ${s.edgeType} →`);
    } else if (s.kind === 'node') {
      nodes.push(s);
      parts.push(`→ ${s.type}:${s.id}`);
    }
  }

  const target = nodes[nodes.length - 1];
  const hasObligation = nodes.some((n) => n.type === 'Obligation');
  const parentChange = nodes.filter((n) => n.type === 'Change').at(-1);

  if (
    target &&
    hasObligation &&
    parentChange &&
    lastEdge &&
    PARENT_LEVEL_EDGES.has(lastEdge) &&
    !DIRECT_OBLIGATION_EDGES.has(lastEdge) &&
    ['AssuranceFinding', 'AssuranceReview', 'Evidence', 'ImpactAssessment', 'Risk', 'Control', 'Action'].includes(target.type)
  ) {
    return `${parts.join(' ')} (linked via parent ${parentChange.type}:${parentChange.id}, not directly from obligation)`;
  }

  return parts.join(' ');
}

/** Higher score = preferred evidence path when multiple routes reach the same node. */
export function pathQualityScore(pathSegments) {
  let score = 0;
  let depth = 0;
  for (const s of pathSegments || []) {
    if (s.kind === 'node') depth += 1;
    if (s.kind === 'edge') {
      if (DIRECT_OBLIGATION_EDGES.has(s.edgeType)) score += 200;
      else if (s.edgeType === 'obligation_for_change' || s.edgeType === 'action_source_obligation') score += 80;
      else if (PARENT_LEVEL_EDGES.has(s.edgeType)) score += 20;
      else score += 5;
    }
  }
  return score * 1000 - depth;
}

export function planTargetTypes(plan) {
  const types = new Set();
  if (plan.primaryTargetType) {
    types.add(plan.primaryTargetType);
    if (plan.primaryTargetType === 'Assurance') {
      types.add('AssuranceFinding');
      types.add('AssuranceReview');
    }
  }
  (plan.secondaryTargetTypes || []).forEach((t) => {
    types.add(t);
    if (t === 'Assurance') {
      types.add('AssuranceFinding');
      types.add('AssuranceReview');
    }
  });
  (plan.relationshipRequests || []).forEach((r) => {
    if (r.to) types.add(r.to);
    if (r.to === 'Assurance') {
      types.add('AssuranceFinding');
      types.add('AssuranceReview');
    }
  });
  (plan.secondaryIntents || []).forEach((s) => {
    const tail = s.replace('linked-', '');
    const map = {
      actions: 'Action',
      obligations: 'Obligation',
      assessments: 'ImpactAssessment',
      risks: 'Risk',
      controls: 'Control',
      evidence: 'Evidence',
      assurance: 'AssuranceFinding',
    };
    if (map[tail]) types.add(map[tail]);
  });
  return types;
}

export function actionIsOverdueAsOf(action, asOfDate) {
  if (!action) return false;
  if (action.status === 'Overdue') return true;
  if (action.status === 'Complete' || action.status === 'Closed') return false;
  if (!action.dueDate) return false;
  const days = daysBetween(asOfDate, parseDemoDate(action.dueDate));
  return days !== null && days < 0;
}

export { nodeKey, parseKey };
