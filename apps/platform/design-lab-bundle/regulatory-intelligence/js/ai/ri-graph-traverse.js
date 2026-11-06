/**
 * Ask RI graph traversal (normalized lifecycle edges + hub seeding only).
 */
import { changesForSector } from '../landscape-helpers.js';
import { labTodayISO } from '../platform/clock.js';
import { daysBetween, parseDemoDate } from '../workflow-helpers.js';
import {
  buildNormalizedRiGraph,
  formatPathReason,
  HUB_NODE_TYPES,
  MAX_TRAVERSAL_DEPTH,
  nodeKey,
  parseKey,
  planTargetTypes,
  actionIsOverdueAsOf,
  pathQualityScore,
} from './ri-graph-normalized.js';
import { obligationStatusIsOpenForLinkedWork } from './obligation-portfolio.js';
import { actionsForChange } from './ri-canonical-links.js';
const CHANGE_NOT_CURRENTLY_RELEVANT = new Set(['Complete', 'Superseded', 'Withdrawn', 'Cancelled', 'Closed', 'Horizon']);

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function scenarioSlugForFramework(fw) {
  return norm(fw.shortName || fw.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Authoritative framework→change links (structured mappings only). */
export function frameworkChangeSeedIds(state, frameworkId) {
  const fw = (state.regulatoryFrameworks || []).find((f) => f.id === frameworkId);
  if (!fw) return { authoritative: [], textCandidates: [] };
  const slug = scenarioSlugForFramework(fw);
  const authoritative = new Set();
  const textCandidates = new Set();
  (state.changes || []).forEach((ch) => {
    if (ch.scenario === slug) authoritative.add(ch.id);
    const pub = state.publications?.find((p) => p.id === ch.publicationId);
    if (pub?.frameworkIds?.includes(frameworkId)) authoritative.add(ch.id);
    const blob = `${ch.topic || ''} ${pub?.topic || ''} ${pub?.title || ''}`.toLowerCase();
    if (blob.includes(norm(fw.name)) || blob.includes(norm(fw.shortName))) textCandidates.add(ch.id);
  });
  (state.publicationSectorMappings || [])
    .filter((m) => (m.frameworkIds || []).includes(frameworkId))
    .forEach((m) => {
      (state.changes || []).filter((c) => c.publicationId === m.publicationId).forEach((c) => authoritative.add(c.id));
    });
  for (const id of textCandidates) {
    if (!authoritative.has(id)) continue;
    textCandidates.delete(id);
  }
  return { authoritative: [...authoritative], textCandidates: [...textCandidates] };
}

/** Framework hub seeds: authoritative ids only (text-only matches are not seeded). */
export function changesForFramework(state, frameworkId) {
  return frameworkChangeSeedIds(state, frameworkId).authoritative;
}

/** Theme hub seeds: frameworks tagged with themeId, then direct framework change rules (no sector hops). */
export function changesForTheme(state, themeId) {
  const fwIds = (state.regulatoryFrameworks || [])
    .filter((f) => (f.themeIds || []).includes(themeId))
    .map((f) => f.id);
  const ids = new Set();
  fwIds.forEach((fwId) => changesForFramework(state, fwId).forEach((id) => ids.add(id)));
  (state.publicationSectorMappings || [])
    .filter((m) => (m.themeIds || []).includes(themeId))
    .forEach((m) => {
      (state.changes || []).filter((c) => c.publicationId === m.publicationId).forEach((c) => ids.add(c.id));
    });
  return [...ids];
}

export function changesForRegulator(state, regulatorId) {
  const reg = (state.landscapeRegulators || []).find((r) => r.id === regulatorId);
  if (!reg) return [];
  const label = norm(reg.shortName || reg.name);
  const ids = new Set();
  (state.changes || []).forEach((ch) => {
    const pub = state.publications?.find((p) => p.id === ch.publicationId);
    if (pub && norm(pub.regulator).includes(label)) ids.add(ch.id);
  });
  return [...ids];
}

function changeIsCurrentlyRelevant(change, { futureFacing = false } = {}) {
  if (!change) return false;
  const status = change.status || '';
  if (CHANGE_NOT_CURRENTLY_RELEVANT.has(status)) return false;
  if (futureFacing) return status === 'Horizon' || /horizon|consultation/i.test(status);
  if (status === 'Horizon') return false;
  return true;
}

function hubChangeIds(state, ent, plan) {
  if (ent.type === 'Sector') return changesForSector(state, ent.id).map((c) => c.id);
  if (ent.type === 'Framework') return changesForFramework(state, ent.id);
  if (ent.type === 'Theme') return changesForTheme(state, ent.id);
  if (ent.type === 'Regulator') return changesForRegulator(state, ent.id);
  return [];
}

function filterChangesByTemporal(state, changeIds, plan) {
  if (!plan.temporalFilters?.includes('current')) return changeIds;
  return changeIds.filter((id) => {
    const ch = state.changes?.find((c) => c.id === id);
    return changeIsCurrentlyRelevant(ch, { futureFacing: plan.temporalFilters?.includes('horizon') });
  });
}

export function resolveHubChangeIds(state, plan) {
  const hubEnts = (plan.resolvedEntities || []).filter((e) => HUB_NODE_TYPES.has(e.type));
  const perHub = hubEnts.map((ent) => {
    let rawChanges = hubChangeIds(state, ent, plan);
    if (plan.requireLinkedTo?.includes('Action')) {
      rawChanges = rawChanges.filter((id) => actionsForChange(state, id).length > 0);
    }
    const changes = filterChangesByTemporal(state, rawChanges, plan);
    return { ent, changes };
  });

  let changeIds = [];
  if (plan.anchorIntersection && perHub.length >= 2) {
    changeIds = perHub[0].changes.filter((id) => perHub.every((p) => p.changes.includes(id)));
  } else {
    changeIds = [...new Set(perHub.flatMap((p) => p.changes))];
  }
  const anchors = perHub.map((p) => p.ent);
  return { changeIds, anchors, changeIdSet: new Set(changeIds) };
}

export function buildSeeds(state, plan) {
  const seeds = [];
  const { changeIds, anchors, changeIdSet } = resolveHubChangeIds(state, plan);
  const anchorPath = anchors.map((ent) => ({ kind: 'anchor', type: ent.type, id: ent.id, label: ent.label }));

  if (plan.primaryTargetType === 'Obligation' || planTargetTypes(plan).has('Obligation')) {
    (state.obligations || [])
      .filter((o) => changeIds.includes(o.changeId))
      .forEach((o) => {
        seeds.push({
          type: 'Obligation',
          id: o.id,
          path: [
            ...anchorPath,
            { kind: 'node', type: 'Change', id: o.changeId },
            { kind: 'node', type: 'Obligation', id: o.id },
          ],
        });
      });
  }

  const wantChange =
    plan.primaryTargetType === 'Change' ||
    planTargetTypes(plan).has('Change') ||
    ['Control', 'Action', 'Evidence', 'Assurance', 'AssuranceFinding', 'ImpactAssessment', 'Risk'].some((t) =>
      planTargetTypes(plan).has(t)
    );
  if (wantChange) {
    changeIds.forEach((id) => {
      seeds.push({
        type: 'Change',
        id,
        path: [...anchorPath, { kind: 'node', type: 'Change', id }],
      });
    });
  }

  if (
    (plan.primaryTargetType === 'Control' || planTargetTypes(plan).has('Control')) &&
    !planRequiresOpenObligationPath(plan)
  ) {
    changeIds.forEach((cid) => {
      (state.controls || [])
        .filter((c) => c.changeId === cid)
        .forEach((c) => {
          seeds.push({
            type: 'Control',
            id: c.id,
            path: [
              ...anchorPath,
              { kind: 'node', type: 'Change', id: cid },
              { kind: 'node', type: 'Control', id: c.id },
            ],
          });
        });
    });
  }

  if (seeds.length === 0 && changeIdSet.size) {
    [...changeIdSet].forEach((id) => {
      seeds.push({ type: 'Change', id, path: [{ kind: 'node', type: 'Change', id }] });
    });
  }

  return { seeds, changeIdSet };
}

function recordPassesStatus(state, type, id, plan, asOfDate) {
  const filters = plan.statusFilters || [];
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

function edgeKey(fromKey, edgeType, toKey) {
  return `${fromKey}>${edgeType}>${toKey}`;
}

export function planRequiresOpenObligationPath(plan) {
  const openObl = plan.statusFilters?.some((f) => f.id === 'open' && f.appliesTo?.includes('Obligation'));
  if (!openObl) return false;
  const targets = planTargetTypes(plan);
  return (
    plan.primaryTargetType === 'Control' ||
    targets.has('Control') ||
    plan.relationshipRequests?.some((r) => r.from === 'Control' && r.to === 'Obligation')
  );
}

const CHANGE_CONTROL_SHORTCUTS = new Set(['change_links_control', 'change_links_risk', 'change_links_action']);

function obligationIsOpen(state, oblId) {
  const o = state.obligations?.find((x) => x.id === oblId);
  return o && obligationStatusIsOpenForLinkedWork(o.status);
}

function pathIncludesOpenObligation(state, pathSegments) {
  return pathSegments.some((s) => s.kind === 'node' && s.type === 'Obligation' && obligationIsOpen(state, s.id));
}

export function executeGraphRetrieval(state, plan, options = {}) {
  const asOfDate = options.asOfDate || labTodayISO();
  const graph = buildNormalizedRiGraph(state);
  const targets = planTargetTypes(plan);
  const { seeds, changeIdSet } = buildSeeds(state, plan);

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
  const records = [];
  const seen = new Map();

  const addRecord = (type, id, path, depth) => {
    const reason = formatPathReason(path);
    const key = `${type}:${id}`;
    const quality = pathQualityScore(path);
    const existing = seen.get(key);
    if (!existing || quality > existing.quality || (quality === existing.quality && depth < existing.depth)) {
      if (existing) {
        const idx = records.findIndex((r) => r.type === type && r.id === id);
        if (idx >= 0) records.splice(idx, 1);
      }
      seen.set(key, { type, id, reason, depth, path: [...path], quality });
      records.push({ id, type, reason, path: [...path], depth });
    }
  };

  const primaryType = plan.primaryTargetType || 'Change';
  const primaryIds = new Set();

  const requireOpenOblPath = planRequiresOpenObligationPath(plan);
  const queue = seeds.map((s) => ({ ...s, depth: 0 }));
  const visited = new Set();

  // Full BFS until queue empty — collects every reachable target within depth (no early stop per type).
  const anchorEntity = (plan.resolvedEntities || []).find((e) => HUB_NODE_TYPES.has(e.type));

  while (queue.length) {
    const cur = queue.shift();
    const curKey = nodeKey(cur.type, cur.id);
    const visitKey = `${curKey}@${cur.depth}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    const includeRecord =
      recordPassesStatus(state, cur.type, cur.id, plan, asOfDate) &&
      (!requireOpenOblPath || cur.type !== 'Control' || pathIncludesOpenObligation(state, cur.path));

    if (includeRecord) {
      addRecord(cur.type, cur.id, cur.path, cur.depth);
      if (cur.type === primaryType || (primaryType === 'Assurance' && (cur.type === 'AssuranceFinding' || cur.type === 'AssuranceReview'))) {
        primaryIds.add(cur.id);
      }
    }

    if (cur.depth >= MAX_TRAVERSAL_DEPTH) continue;

    const edges = graph.adjacency.get(curKey) || [];
    for (const e of edges) {
      if (HUB_NODE_TYPES.has(e.toType)) continue;
      if (requireOpenOblPath && cur.type === 'Change' && CHANGE_CONTROL_SHORTCUTS.has(e.edgeType)) continue;
      const ek = edgeKey(curKey, e.edgeType, e.to);
      if (graph.blockedEdgeKeys.has(ek)) continue;

      const next = parseKey(e.to);
      const nextPath = [
        ...cur.path,
        { kind: 'edge', edgeType: e.edgeType },
        { kind: 'node', type: next.type, id: next.id },
      ];
      queue.push({
        type: next.type,
        id: next.id,
        path: nextPath,
        depth: cur.depth + 1,
      });
    }
  }

  if (requireOpenOblPath && changeIdSet.size) {
    const anchor = anchorEntity
      ? { kind: 'anchor', type: anchorEntity.type, id: anchorEntity.id, label: anchorEntity.label }
      : null;
    for (const o of state.obligations || []) {
      if (!changeIdSet.has(o.changeId) || !obligationIsOpen(state, o.id)) continue;
      for (const c of state.controls || []) {
        if (!(c.obligationIds || []).includes(o.id)) continue;
        const path = [
          ...(anchor ? [anchor] : []),
          { kind: 'node', type: 'Change', id: o.changeId },
          { kind: 'node', type: 'Obligation', id: o.id },
          { kind: 'edge', edgeType: 'obligation_supported_by_control' },
          { kind: 'node', type: 'Control', id: c.id },
        ];
        if (recordPassesStatus(state, 'Control', c.id, plan, asOfDate)) {
          addRecord('Control', c.id, path, 2);
        }
      }
    }
  }

  if (requireOpenOblPath) {
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      if (r.type === 'Control' && !pathIncludesOpenObligation(state, r.path)) records.splice(i, 1);
    }
  }

  for (const r of records) {
    if (r.type === 'Action') summary.linkedActionCount += 1;
    if (r.type === 'Obligation') summary.linkedObligationCount += 1;
    if (r.type === 'ImpactAssessment') summary.linkedAssessmentCount += 1;
    if (r.type === 'Risk') summary.linkedRiskCount += 1;
    if (r.type === 'Control') summary.linkedControlCount += 1;
    if (r.type === 'Evidence') summary.linkedEvidenceCount += 1;
    if (r.type === 'AssuranceFinding' || r.type === 'AssuranceReview') summary.linkedAssuranceCount += 1;
  }

  const seedPrimary = seeds.filter((s) => {
    if (primaryType === 'Assurance') return s.type === 'AssuranceFinding' || s.type === 'AssuranceReview';
    return s.type === primaryType;
  });
  let primaryCount = seedPrimary.length;
  if (!primaryCount || primaryType === 'Control') {
    if (primaryType === 'Obligation') primaryCount = [...new Set(records.filter((r) => r.type === 'Obligation').map((r) => r.id))].length;
    else if (primaryType === 'Change') primaryCount = changeIdSet.size || [...new Set(records.filter((r) => r.type === 'Change').map((r) => r.id))].length;
    else if (primaryType === 'Control') primaryCount = [...new Set(records.filter((r) => r.type === 'Control').map((r) => r.id))].length;
    else primaryCount = primaryIds.size || changeIdSet.size;
  }

  if (targets.has('Action') && summary.linkedActionCount === 0 && primaryCount > 0) secondaryGaps.push('linked-actions');
  if (plan.statusFilters?.some((f) => f.id === 'open' && f.appliesTo?.includes('Obligation')) && summary.linkedObligationCount === 0 && primaryCount > 0) {
    secondaryGaps.push('linked-open-obligations');
  }
  if (targets.has('Control') && summary.linkedControlCount === 0 && primaryCount > 0) secondaryGaps.push('linked-controls');
  if ((targets.has('Evidence') || targets.has('Assurance') || targets.has('AssuranceFinding')) && summary.linkedEvidenceCount === 0 && summary.linkedAssuranceCount === 0 && primaryCount > 0) {
    secondaryGaps.push('linked-evidence-assurance');
  }


  return {
    records,
    summary,
    secondaryGaps,
    primaryCount,
    graphMeta: {
      conflicts: graph.conflicts,
      blockedEdgeCount: graph.blockedEdgeKeys.size,
      maxDepth: MAX_TRAVERSAL_DEPTH,
    },
    asOfDate,
  };
}

/** @deprecated use executeGraphRetrieval */
export function resolvePrimaryChangeIds(state, plan) {
  const { changeIdSet } = buildSeeds(state, plan);
  let list = [...changeIdSet];
  if (plan.requireLinkedTo?.includes('Action')) {
    list = list.filter((id) => actionsForChange(state, id).length > 0);
  }
  return list;
}

/** @deprecated use executeGraphRetrieval */
export function expandFromChanges(state, changeIds, plan) {
  const exec = executeGraphRetrieval(state, { ...plan, primaryTargetType: plan.primaryTargetType || 'Change' }, {});
  return { records: exec.records, summary: exec.summary, secondaryGaps: exec.secondaryGaps };
}

export function buildActionStatusFacts(state, records, asOfDate = labTodayISO()) {
  const actions = records.filter((r) => r.type === 'Action').map((r) => state.actions?.find((a) => a.id === r.id)).filter(Boolean);
  return {
    asOfDate,
    linkedActionStatuses: actions.map((a) => ({
      actionId: a.id,
      status: a.status,
      dueDate: a.dueDate,
      overdueAsOf: actionIsOverdueAsOf(a, asOfDate),
    })),
  };
}

export function formatAsOfLabel(isoDate) {
  try {
    const slice = parseDemoDate(isoDate);
    if (!slice) return isoDate;
    const d = new Date(`${slice}T12:00:00`);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return isoDate;
  }
}
