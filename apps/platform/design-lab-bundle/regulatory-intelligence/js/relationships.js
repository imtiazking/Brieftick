/**
 * Canonical relationship lookups — single source for traceability and related records.
 */
import { getState, getPublication, getChange, getAssessment, getObligation, getRisk, getControl, getPolicy, getAction, getEvidence } from './store.js';
import { SCENARIOS } from './seed-data.js';

/** Primary demo anchor change per scenario theme */
export const SCENARIO_ANCHOR_CHANGES = {
  'consumer-duty': 'CHG-001',
  'op-resilience': 'CHG-010',
  'third-party': 'CHG-011',
  'financial-crime': 'CHG-012',
};

export const RECORD_ROUTE = {
  Publication: (id) => `#/publication/${id}`,
  'Regulatory Change': (id) => `#/change/${id}`,
  Change: (id) => `#/change/${id}`,
  'Impact Assessment': (id) => `#/assessment/${id}`,
  Obligation: (id) => `#/obligation/${id}`,
  Risk: (id) => `#/risk/${id}`,
  Control: (id) => `#/control/${id}`,
  Policy: (id) => `#/policy/${id}`,
  Action: (id) => `#/action/${id}`,
  Evidence: (id) => `#/evidence/${id}`,
  'Assurance Finding': (id) => `#/finding/${id}`,
  'Assurance Review': (id) => `#/assurance/${id}`,
};

export function routeForRecord(type, id) {
  const fn = RECORD_ROUTE[type];
  return fn ? fn(id) : '#/dashboard';
}

export function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items;
  return items.filter((i) => i.scenario === scenarioId);
}

export function getChangesForPublication(pubId) {
  const s = getState();
  return s.changes.filter((c) => c.publicationId === pubId);
}

export function getPublicationSource(pubId) {
  const s = getState();
  return s.sourceDocuments?.[pubId] || null;
}

export function getCitationSection(pubId, sectionSlug) {
  const doc = getPublicationSource(pubId);
  if (!doc?.sections) return null;
  return doc.sections.find((sec) => sec.id === sectionSlug || sec.citationSlug === sectionSlug);
}

/** Hash route to open publication source tab with optional section highlight */
export function publicationSourceHref(pubId, sectionSlug) {
  if (sectionSlug) return `#/publication/${pubId}/source/${sectionSlug}`;
  return `#/publication/${pubId}/source`;
}

export function normalizePublicationTab(segment) {
  const map = {
    overview: 'Overview',
    source: 'Source',
    changes: 'Changes',
    ai: 'AI Analysis',
    'ai-analysis': 'AI Analysis',
    applicability: 'Applicability',
    related: 'Related Records',
    audit: 'Audit History',
  };
  const key = (segment || 'overview').toLowerCase();
  return map[key] || 'Overview';
}

export function tabToSlug(tabName) {
  const map = {
    Overview: 'overview',
    Source: 'source',
    Changes: 'changes',
    'AI Analysis': 'ai',
    Applicability: 'applicability',
    'Related Records': 'related',
    'Audit History': 'audit',
  };
  return map[tabName] || 'overview';
}

export function getAuditEventsFor(recordType, recordId, includeRelated = false) {
  const s = getState();
  const types = new Set([recordType]);
  const ids = new Set([recordId]);

  if (includeRelated) {
    if (recordType === 'Publication') {
      getChangesForPublication(recordId).forEach((c) => {
        types.add('Regulatory Change');
        types.add('Change');
        ids.add(c.id);
      });
      s.assessments.filter((a) => a.publicationId === recordId).forEach((a) => {
        types.add('Impact Assessment');
        ids.add(a.id);
      });
    }
    if (recordType === 'Regulatory Change' || recordType === 'Change') {
      const ch = getChange(recordId);
      if (ch) {
        types.add('Publication');
        ids.add(ch.publicationId);
        (ch.linkedAssessmentIds || []).forEach((id) => {
          types.add('Impact Assessment');
          ids.add(id);
        });
      }
    }
  }

  const typeAliases = (t) => {
    if (t === 'Change') return ['Change', 'Regulatory Change'];
    if (t === 'Regulatory Change') return ['Change', 'Regulatory Change'];
    return [t];
  };
  const wanted = new Set(typeAliases(recordType));

  return s.auditEvents.filter((e) => {
    if (e.recordId === recordId && wanted.has(e.recordType)) return true;
    if (includeRelated && ids.has(e.recordId) && types.has(e.recordType)) return true;
    if (includeRelated && e.relatedIds?.includes(recordId)) return true;
    if (includeRelated && recordType === 'Publication' && (e.comments || '').includes(recordId)) return true;
    return false;
  });
}

export function collectRelatedForPublication(pubId) {
  const s = getState();
  const changes = getChangesForPublication(pubId);
  const changeIds = new Set(changes.map((c) => c.id));
  const assessments = s.assessments.filter((a) => a.publicationId === pubId || changeIds.has(a.changeId));
  const assessmentIds = new Set(assessments.map((a) => a.id));
  const obligations = s.obligations.filter((o) => o.publicationId === pubId || changeIds.has(o.changeId));
  const oblIds = new Set(obligations.map((o) => o.id));
  const policies = s.policies.filter((p) => (p.changeIds || []).some((id) => changeIds.has(id)) || (p.obligationIds || []).some((id) => oblIds.has(id)));
  const risks = s.risks.filter((r) => changeIds.has(r.originatingChangeId) || (r.obligationIds || []).some((id) => oblIds.has(id)));
  const controls = s.controls.filter((c) => c.publicationId === pubId || changeIds.has(c.changeId) || (c.obligationIds || []).some((id) => oblIds.has(id)));
  const actions = s.actions.filter((a) => {
    if (a.sourceId && oblIds.has(a.sourceId)) return true;
    if (a.sourceId && assessmentIds.has(a.sourceId)) return true;
    return false;
  });
  const evidence = s.evidence.filter((e) => e.publicationId === pubId || oblIds.has(e.obligationId));
  return { changes, assessments, obligations, policies, risks, controls, actions, evidence };
}

export function collectRelatedForChange(changeId) {
  const ch = getChange(changeId);
  if (!ch) return null;
  const s = getState();
  const assessments = s.assessments.filter((a) => a.changeId === changeId || (ch.linkedAssessmentIds || []).includes(a.id));
  const obligations = s.obligations.filter((o) => o.changeId === changeId || (ch.linkedObligationIds || []).includes(o.id));
  const oblIds = new Set(obligations.map((o) => o.id));
  const policies = s.policies.filter((p) => (p.changeIds || []).includes(changeId) || (p.obligationIds || []).some((id) => oblIds.has(id)));
  const risks = s.risks.filter((r) => r.originatingChangeId === changeId || (r.obligationIds || []).some((id) => oblIds.has(id)));
  const controls = s.controls.filter((c) => c.changeId === changeId || (ch.linkedControlIds || []).includes(c.id));
  const actions = s.actions.filter((a) => oblIds.has(a.sourceId) || assessments.some((ia) => ia.id === a.sourceId));
  const evidence = s.evidence.filter((e) => e.publicationId === ch.publicationId && (oblIds.has(e.obligationId) || (ch.linkedEvidenceIds || []).includes(e.id)));
  return { change: ch, assessments, obligations, policies, risks, controls, actions, evidence };
}

/** Build forward trace chain from central store for a regulatory change */
export function buildCanonicalChainForChange(changeId) {
  const ch = getChange(changeId);
  if (!ch) return [];
  const s = getState();
  const chain = [];
  if (getPublication(ch.publicationId)) chain.push({ type: 'Publication', id: ch.publicationId });
  chain.push({ type: 'Regulatory Change', id: ch.id });

  const ia = s.assessments.find((a) => a.changeId === changeId);
  if (ia) chain.push({ type: 'Impact Assessment', id: ia.id });

  const obls = s.obligations.filter((o) => o.changeId === changeId);
  const obl = obls.find((o) => (o.policyIds?.length || o.riskIds?.length) && o.controlIds?.length) || obls[0];
  if (obl) {
    chain.push({ type: 'Obligation', id: obl.id });
    if (obl.policyIds?.[0] && getPolicy(obl.policyIds[0])) chain.push({ type: 'Policy', id: obl.policyIds[0] });
    else {
      const pol = s.policies.find((p) => (p.changeIds || []).includes(changeId));
      if (pol) chain.push({ type: 'Policy', id: pol.id });
    }
    if (obl.riskIds?.[0] && getRisk(obl.riskIds[0])) chain.push({ type: 'Risk', id: obl.riskIds[0] });
    else {
      const r = s.risks.find((x) => x.originatingChangeId === changeId);
      if (r) chain.push({ type: 'Risk', id: r.id });
    }
    if (obl.controlIds?.[0] && getControl(obl.controlIds[0])) chain.push({ type: 'Control', id: obl.controlIds[0] });
    else {
      const c = s.controls.find((x) => x.changeId === changeId);
      if (c) chain.push({ type: 'Control', id: c.id });
    }
    let actId = obl.actionIds?.[0];
    if (!actId || !getAction(actId)) {
      actId = s.actions.find((a) => a.sourceId === obl.id)?.id;
    }
    const ctrlInChain = chain.find((x) => x.type === 'Control');
    if ((!actId || !getAction(actId)) && ctrlInChain) {
      actId = s.actions.find((a) => a.sourceId === ctrlInChain.id)?.id;
    }
    if (actId && getAction(actId)) chain.push({ type: 'Action', id: actId });
    let evdId = obl.evidenceIds?.[0];
    if (!evdId || !getEvidence(evdId)) {
      evdId = s.evidence.find((e) => e.obligationId === obl.id)?.id;
    }
    if (actId && (!evdId || !getEvidence(evdId))) {
      evdId = s.evidence.find((e) => e.actionId === actId)?.id;
    }
    if (evdId && getEvidence(evdId)) chain.push({ type: 'Evidence', id: evdId });
  }
  return chain;
}

export function getCanonicalForwardChain() {
  return buildCanonicalChainForChange(SCENARIO_ANCHOR_CHANGES['consumer-duty']);
}

/** Dashboard module 08 — scenario-aware traceability */
export function getDashboardTraceBlocks() {
  const sid = getState().scenarioId || 'consumer-duty';
  if (sid === 'all') {
    return Object.entries(SCENARIO_ANCHOR_CHANGES).map(([scenarioId, changeId]) => ({
      scenarioId,
      label: SCENARIOS.find((s) => s.id === scenarioId)?.label || scenarioId,
      chain: withLabels(buildCanonicalChainForChange(changeId)),
    }));
  }
  const changeId = SCENARIO_ANCHOR_CHANGES[sid];
  if (!changeId) return [];
  const label = SCENARIOS.find((s) => s.id === sid)?.label || sid;
  return [{ scenarioId: sid, label, chain: withLabels(buildCanonicalChainForChange(changeId)) }];
}

function chainsForTraceLookup(entityType, entityId) {
  const entity = lookupEntity(entityType, entityId);
  const scenario = entity?.scenario;
  if (scenario && SCENARIO_ANCHOR_CHANGES[scenario]) {
    return [buildCanonicalChainForChange(SCENARIO_ANCHOR_CHANGES[scenario])];
  }
  return Object.values(SCENARIO_ANCHOR_CHANGES).map((id) => buildCanonicalChainForChange(id));
}

function lookupEntity(entityType, entityId) {
  const norm = entityType === 'Change' ? 'Regulatory Change' : entityType;
  const map = {
    Publication: getPublication,
    'Regulatory Change': getChange,
    Change: getChange,
    'Impact Assessment': getAssessment,
    Obligation: getObligation,
    Risk: getRisk,
    Control: getControl,
    Policy: getPolicy,
    Action: getAction,
    Evidence: getEvidence,
  };
  return map[norm]?.(entityId);
}

function withLabels(chain) {
  return chain.map((item) => ({ ...item, label: lookupLabel(item.type, item.id) || item.id }));
}

function lookupLabel(type, id) {
  if (type === 'Publication') return getPublication(id)?.title;
  if (type === 'Regulatory Change' || type === 'Change') return getChange(id)?.title;
  if (type === 'Impact Assessment') return getAssessment(id)?.title;
  if (type === 'Obligation') return getObligation(id)?.statement;
  if (type === 'Policy') return getPolicy(id)?.name;
  if (type === 'Risk') return getRisk(id)?.title;
  if (type === 'Control') return getControl(id)?.name;
  if (type === 'Action') return getAction(id)?.description;
  if (type === 'Evidence') return getEvidence(id)?.fileName;
  return id;
}

export function buildTraceFrom(entityType, entityId) {
  const norm = entityType === 'Change' ? 'Regulatory Change' : entityType;
  for (const raw of chainsForTraceLookup(entityType, entityId)) {
    const idx = raw.findIndex((x) => x.type === norm && x.id === entityId);
    if (idx >= 0) {
      const chain = withLabels(raw);
      return {
        forward: chain.slice(idx),
        backward: chain.slice(0, idx + 1).reverse(),
      };
    }
  }
  const dynamic = buildDynamicTrace(entityType, entityId);
  return {
    forward: withLabels(dynamic.forward),
    backward: withLabels(dynamic.backward),
  };
}

function buildDynamicTrace(entityType, entityId) {
  const backward = [];
  const forward = [];

  if (entityType === 'Evidence') {
    const e = getEvidence(entityId);
    if (!e) return { forward: [], backward: [] };
    backward.push({ type: 'Evidence', id: e.id, label: e.fileName });
    if (e.actionId) pushActionChain(backward, forward, e.actionId);
    else if (e.obligationId) pushOblChain(backward, forward, e.obligationId);
  } else if (entityType === 'Action') {
    pushActionChain(backward, forward, entityId);
  } else if (entityType === 'Control') {
    const c = getControl(entityId);
    if (c) {
      backward.push({ type: 'Control', id: c.id, label: c.name });
      forward.push({ type: 'Control', id: c.id, label: c.name });
      const rid = c.riskIds?.[0];
      const oid = c.obligationIds?.[0];
      if (oid) prependObl(backward, oid);
      if (rid) {
        const r = getRisk(rid);
        if (r?.originatingObligationId) prependObl(backward, r.originatingObligationId);
      }
      (c.evidenceIds || []).forEach((eid) => forward.push({ type: 'Evidence', id: eid, label: getEvidence(eid)?.fileName || eid }));
    }
  } else if (entityType === 'Obligation') {
    prependObl(backward, entityId);
    forward.push({ type: 'Obligation', id: entityId, label: getObligation(entityId)?.statement || entityId });
  } else if (entityType === 'Regulatory Change' || entityType === 'Change') {
    const ch = getChange(entityId);
    if (ch) {
      backward.push({ type: 'Regulatory Change', id: ch.id, label: ch.title });
      forward.push({ type: 'Regulatory Change', id: ch.id, label: ch.title });
      const p = getPublication(ch.publicationId);
      if (p) backward.unshift({ type: 'Publication', id: p.id, label: p.title });
    }
  }

  return { forward: dedupeChain(forward), backward: dedupeChain(backward) };
}

function pushActionChain(backward, forward, actionId) {
  const a = getAction(actionId);
  if (!a) return;
  backward.push({ type: 'Action', id: a.id, label: a.description });
  if (a.sourceId?.startsWith('OBL')) prependObl(backward, a.sourceId);
  (a.evidenceIds || []).forEach((eid) => forward.push({ type: 'Evidence', id: eid, label: getEvidence(eid)?.fileName || eid }));
}

function prependObl(backward, oblId) {
  const o = getObligation(oblId);
  if (!o) return;
  const items = [{ type: 'Obligation', id: o.id, label: o.statement }];
  if (o.assessmentId) {
    const ia = getAssessment(o.assessmentId);
    if (ia) items.push({ type: 'Impact Assessment', id: ia.id, label: ia.title });
  }
  if (o.changeId) {
    const ch = getChange(o.changeId);
    if (ch) items.push({ type: 'Regulatory Change', id: ch.id, label: ch.title });
    if (ch?.publicationId) {
      const p = getPublication(ch.publicationId);
      if (p) items.push({ type: 'Publication', id: p.id, label: p.title });
    }
  }
  items.reverse().forEach((it) => {
    if (!backward.find((b) => b.type === it.type && b.id === it.id)) backward.unshift(it);
  });
  const pol = o.policyIds?.[0];
  if (pol) backward.push({ type: 'Policy', id: pol, label: getPolicy(pol)?.name || pol });
  const rsk = o.riskIds?.[0];
  if (rsk) backward.push({ type: 'Risk', id: rsk, label: getRisk(rsk)?.title || rsk });
  const ctrl = o.controlIds?.[0];
  if (ctrl) backward.push({ type: 'Control', id: ctrl, label: getControl(ctrl)?.name || ctrl });
}

function pushOblChain(backward, forward, oblId) {
  prependObl(backward, oblId);
}

function dedupeChain(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    const k = `${x.type}:${x.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
