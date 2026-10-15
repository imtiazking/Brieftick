/**
 * Normalized Ask RI target + relationship predicate planning (generic phrases).
 */
import { HUB_NODE_TYPES } from './ri-graph-normalized.js';

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

export function parseTargetOperation(question) {
  const q = norm(question);
  if (/^how many\b/.test(q) || /\bhow many\b/.test(q)) return 'COUNT';
  if (/\bsummarize\b|\bsummary\b|\boverview\b/.test(q)) return 'SUMMARIZE';
  return 'LIST';
}

function negatedBefore(term, question) {
  const q = norm(question);
  const idx = q.indexOf(term);
  if (idx < 0) return false;
  const window = q.slice(Math.max(0, idx - 40), idx);
  return /\b(no|without|zero|lack)\b/.test(window) || /\bhave no\b/.test(window);
}

export function parseRelationshipConstraints(question, targetType) {
  const q = String(question || '');
  const required = [];
  const excluded = [];

  const evidenceTerm = 'evidence';
  const findingTerm = 'assurance';
  const hasFindingPhrase = /\bassurance\b[\s\S]{0,40}\bfindings?\b/i.test(q) || /\bfindings?\b[\s\S]{0,20}\bassurance\b/i.test(q);
  const hasEvidencePhrase = /\bevidence\b/i.test(q);
  const hasControlPhrase = /\bcontrols?\b/i.test(q);
  const hasActionPhrase = /\bactions?\b/i.test(q);
  const hasIAPhrase = /\bimpact assessments?\b/i.test(q) || /\bimpact assessment\b/i.test(q);

  if (hasEvidencePhrase && targetType === 'Obligation') {
    if (negatedBefore(evidenceTerm, q) || /\b(no|without)\s+evidence\b/i.test(q) || /\bhave no evidence\b/i.test(q)) {
      excluded.push({ type: 'Evidence', maximum: 0 });
    } else if (/\b(have|with)\s+evidence\b/i.test(q) || /\bwith evidence\b/i.test(q) || /\bevidence\b.*\bbut\b/i.test(q)) {
      required.push({ type: 'Evidence', minimum: 1 });
    }
  }

  if (hasFindingPhrase && (targetType === 'Obligation' || targetType === 'Change')) {
    if (/\b(no|without)\s+assurance\b/i.test(q) || /\bwithout assurance findings?\b/i.test(q) || (negatedBefore('findings', q) && /\bassurance\b/i.test(q))) {
      excluded.push({ type: 'AssuranceFinding', maximum: 0 });
    } else if (/\b(have|with)\s+assurance\b/i.test(q) || /\bassurance findings?\b/i.test(q)) {
      required.push({ type: 'AssuranceFinding', minimum: 1 });
    }
  }

  if (hasControlPhrase && targetType === 'Obligation') {
    if (/\b(no|without)\s+controls?\b/i.test(q)) excluded.push({ type: 'Control', maximum: 0 });
    else if (/\b(have|with)\s+controls?\b/i.test(q)) required.push({ type: 'Control', minimum: 1 });
  }

  if (hasActionPhrase && targetType === 'Obligation') {
    if (/\b(no|without)\s+actions?\b/i.test(q)) excluded.push({ type: 'Action', maximum: 0 });
    else if (/\b(have|with)\s+actions?\b/i.test(q)) required.push({ type: 'Action', minimum: 1 });
  }

  if (hasIAPhrase && targetType === 'Change') {
    if (/\b(no|without)\s+impact assessments?\b/i.test(q) || /\bhave no impact assessments?\b/i.test(q)) {
      excluded.push({ type: 'ImpactAssessment', maximum: 0 });
    } else if (/\b(have|with)\s+impact assessments?\b/i.test(q)) {
      required.push({ type: 'ImpactAssessment', minimum: 1 });
    }
  }

  return { requiredRelationships: required, excludedRelationships: excluded };
}

export function buildTargetPredicatePlan(question, resolvedEntities, primaryTargetType, anchorIntersection) {
  if (!primaryTargetType) return null;
  const { requiredRelationships, excludedRelationships } = parseRelationshipConstraints(question, primaryTargetType);
  if (!requiredRelationships.length && !excludedRelationships.length) return null;

  const anchors = (resolvedEntities || []).filter((e) => HUB_NODE_TYPES.has(e.type));
  const anchorLogic = anchorIntersection && anchors.length >= 2 ? 'AND' : anchors.length > 1 ? 'OR' : 'AND';

  return {
    anchors,
    anchorLogic,
    targetType: primaryTargetType,
    operation: parseTargetOperation(question),
    requiredRelationships,
    excludedRelationships,
    statusFilters: [],
    temporalFilters: [],
    secondaryTargets: [],
  };
}

export function planHasTargetPredicate(plan) {
  return Boolean(plan?.targetPredicate);
}
