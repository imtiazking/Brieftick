/**
 * Generic Ask RI graph query plan (deterministic, data-driven).
 */
import {
  buildRiEntityCatalog,
  resolveRegulatorsInQuestion,
  resolveSectorsInQuestion,
  resolveFrameworksInQuestion,
} from './ri-entity-catalog.js';
import { detectSecondaryIntents, EVIDENCE_DISPLAY_CAP } from './ri-ask-planner.js';
import { HUB_NODE_TYPES } from './ri-graph-normalized.js';
import { buildTargetPredicatePlan } from './target-predicate-plan.js';

const STATUS_FILTER_PATTERNS = [
  { id: 'open', re: /\b(open|remain open|still open)\b/i, appliesTo: ['Obligation', 'Action', 'Change'] },
  { id: 'overdue', re: /\boverdue\b/i, appliesTo: ['Action', 'Obligation'] },
  { id: 'draft', re: /\bdraft\b/i, appliesTo: ['Obligation', 'ImpactAssessment', 'Change'] },
  { id: 'approved', re: /\bapproved\b/i, appliesTo: ['ImpactAssessment', 'Change'] },
  { id: 'current', re: /\bcurrently affect|currently relevant|in force\b/i, appliesTo: ['Change'] },
  { id: 'horizon', re: /\bhorizon|upcoming|future\b/i, appliesTo: ['Change'] },
];

const RELATIONSHIP_PATTERNS = [
  { id: 'Obligation->Action', re: /\b(obligations?[\s\S]{0,40}linked actions?|linked actions?)\b/i, from: 'Obligation', to: 'Action' },
  { id: 'Change->Action', re: /\b(actions?|linked actions?|have linked actions?)\b/i, from: 'Change', to: 'Action' },
  { id: 'Change->Obligation', re: /\b(obligations?|linked obligations?|remain open)\b/i, from: 'Change', to: 'Obligation' },
  { id: 'Control->Obligation', re: /\bcontrols?[\s\S]{0,30}linked to open obligations?|\bcontrols? linked\b/i, from: 'Control', to: 'Obligation' },
  { id: 'Change->ImpactAssessment', re: /\b(impact assessments?|assessments?)\b/i, from: 'Change', to: 'ImpactAssessment' },
  { id: 'Change->Risk', re: /\b(risks?)\b/i, from: 'Change', to: 'Risk' },
  { id: 'Change->Control', re: /\b(controls?)\b/i, from: 'Change', to: 'Control' },
  { id: 'Obligation->Evidence', re: /\b(evidence)\b/i, from: 'Obligation', to: 'Evidence' },
  { id: 'Obligation->Assurance', re: /\b(assurance)\b/i, from: 'Obligation', to: 'Assurance' },
  { id: 'Change->Assurance', re: /\b(assurance)\b/i, from: 'Change', to: 'Assurance' },
];

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function resolveThemesInQuestion(question, state) {
  const lower = norm(question);
  return (state.complianceThemes || []).filter((t) => {
    const name = norm(t.name);
    return name.length >= 4 && lower.includes(name);
  });
}

function resolveFrameworksExtended(question, state) {
  const catalog = buildRiEntityCatalog(state);
  const fromCatalog = resolveFrameworksInQuestion(question, catalog);
  const ids = new Set(fromCatalog.map((f) => f.id));
  return (state.regulatoryFrameworks || []).filter((f) => {
    if (ids.has(f.id)) return true;
    const name = norm(f.name);
    const short = norm(f.shortName);
    return (name.length >= 4 && lowerIncludes(question, f.name)) || (short.length >= 3 && lowerIncludes(question, f.shortName));
  });
}

function lowerIncludes(hay, needle) {
  const n = norm(needle);
  if (!n) return false;
  return norm(hay).includes(n);
}

export function parseStatusFilters(question) {
  const q = String(question || '');
  return STATUS_FILTER_PATTERNS.filter((p) => p.re.test(q)).map((p) => {
    if (p.id === 'overdue') {
      const actionOverdue = /\b(actions?|those actions?)\s+(?:are|is)\s+overdue\b/i.test(q) || /\boverdue\s+actions?\b/i.test(q);
      const oblOverdue = /\boverdue\s+obligations?\b/i.test(q) || /\bobligations?\s+(?:are|is)\s+overdue\b/i.test(q);
      const appliesTo = [];
      if (actionOverdue || (!oblOverdue && /\boverdue\b/i.test(q))) appliesTo.push('Action');
      if (oblOverdue) appliesTo.push('Obligation');
      return { id: p.id, appliesTo: appliesTo.length ? appliesTo : ['Action', 'Obligation'] };
    }
    return { id: p.id, appliesTo: p.appliesTo };
  });
}

export function parseRelationshipRequests(question) {
  return RELATIONSHIP_PATTERNS.filter((p) => p.re.test(question)).map((p) => ({
    id: p.id,
    from: p.from,
    to: p.to,
  }));
}

function requiresAnchorIntersection(question, resolvedEntities) {
  const hubs = (resolvedEntities || []).filter((e) => HUB_NODE_TYPES.has(e.type));
  if (hubs.length < 2) return false;
  const q = norm(question);
  if (/\band\b/.test(q)) {
    if (/\b(linked to|connected to|affecting|linked)\b/.test(q)) return true;
    if (/\bchanges?\b/.test(q) && (/\bcurrently\b/.test(q) || /\bwhat\b/.test(q))) return true;
    if (/\bcontrols?\b/.test(q) && /\bconnected\b/.test(q)) return true;
    return /\b(to|with)\b/.test(q);
  }
  if (/\bchanges?\b/.test(q) && /\b(linked to|connected to)\b/.test(q)) return true;
  if (/\bcurrently\b/.test(q) && /\b(linked|affect)\b/.test(q)) return true;
  return false;
}

export function buildAskQueryPlan(question, state) {
  const q = String(question || '').trim();
  if (/\b(due soon|due within)\b/i.test(q)) {
    return {
      query: q,
      resolvedEntities: [],
      unresolvedSemantics: true,
      unresolvedReason: 'parameterised-due-date-not-supported',
    };
  }
  if (/\bpolicies\b/i.test(q) && !/\bregulatory changes\b/i.test(q) && !/\bchanges\b/i.test(q)) {
    return {
      query: q,
      resolvedEntities: [],
      unresolvedSemantics: true,
      unresolvedReason: 'policy-primary-not-supported',
    };
  }
  const lower = norm(q);
  const catalog = buildRiEntityCatalog(state);
  const sectors = resolveSectorsInQuestion(q, catalog).map((s) => ({ type: 'Sector', id: s.id, label: s.label, slug: s.slug }));
  const regulators = resolveRegulatorsInQuestion(q, catalog).map((r) => ({ type: 'Regulator', id: r.id, label: r.label }));
  const frameworks = resolveFrameworksExtended(q, state).map((f) => ({ type: 'Framework', id: f.id, label: f.name }));
  const themes = resolveThemesInQuestion(q, state).map((t) => ({ type: 'Theme', id: t.id, label: t.name }));

  const resolvedEntities = [...sectors, ...regulators, ...frameworks, ...themes];
  const relationshipRequests = parseRelationshipRequests(q);
  const statusFilters = parseStatusFilters(q);
  const secondaryIntents = detectSecondaryIntents(q);

  let primaryTargetType = null;
  if (/how many open obligation/i.test(q)) primaryTargetType = 'Obligation';
  else if (/\bcontrols\b/i.test(q)) primaryTargetType = 'Control';
  else if (/\bobligations\b/i.test(q)) primaryTargetType = 'Obligation';
  else if (/\bchanges\b|\bchange\b/i.test(q)) primaryTargetType = 'Change';
  else if (/\bactions\b/i.test(q)) primaryTargetType = 'Action';
  else if (/\bevidence\b/i.test(q) && /\bassurance\b/i.test(q)) primaryTargetType = 'Obligation';
  else if (/\bassurance\b/i.test(q)) primaryTargetType = 'Assurance';
  else if (/\bevidence\b/i.test(q)) primaryTargetType = 'Evidence';

  const temporalFilters = [];
  if (statusFilters.some((f) => f.id === 'current') || /currently affect/i.test(lower)) temporalFilters.push('current');
  if (statusFilters.some((f) => f.id === 'horizon')) temporalFilters.push('horizon');

  const requireLinkedTo = /\b(have linked|with linked|linked)\b/i.test(q)
    ? relationshipRequests.map((r) => r.to).filter(Boolean)
    : [];

  const aggregationRequests = [];
  if (/how many open obligation/i.test(q)) aggregationRequests.push({ type: 'count-open-obligations' });

  const compound =
    relationshipRequests.length > 0 &&
    (primaryTargetType === 'Change' || secondaryIntents.length > 0 || statusFilters.some((f) => f.appliesTo?.includes('Obligation')));

  const anchorIntersection = requiresAnchorIntersection(q, resolvedEntities);
  const targetPredicate = buildTargetPredicatePlan(q, resolvedEntities, primaryTargetType, anchorIntersection);

  return {
    query: q,
    resolvedEntities,
    primaryTargetType: targetPredicate?.targetType || primaryTargetType,
    targetPredicate,
    anchorIntersection,
    anchorLogic: targetPredicate?.anchorLogic || (anchorIntersection ? 'AND' : 'AND'),
    secondaryTargetTypes: [...new Set(relationshipRequests.map((r) => r.to))],
    relationshipRequests,
    statusFilters,
    temporalFilters,
    secondaryIntents,
    requireLinkedTo,
    aggregationRequests,
    compound,
    evidenceDisplayCap: EVIDENCE_DISPLAY_CAP,
  };
}
