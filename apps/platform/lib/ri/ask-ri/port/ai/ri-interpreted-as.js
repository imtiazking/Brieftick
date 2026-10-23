/**
 * Deterministic plain-English "Interpreted as" from validated Ask RI plans.
 */
import { ASK_RI_RESULT_STATES } from './ri-query-executor.js';
import { formatAsOfLabel } from './ri-graph-traverse.js';

function anchorPhrase(plan) {
  const ents = plan?.resolvedEntities || plan?.targetPredicate?.anchors || [];
  if (!ents.length) return '';
  return ents.map((e) => e.label || e.id).join(' and ');
}

function statusPhrase(plan) {
  const filters = plan?.statusFilters || [];
  const bits = [];
  for (const f of filters) {
    if (f.id === 'current') bits.push('currently relevant');
    if (f.id === 'open') bits.push('open / in-progress');
    if (f.id === 'overdue') bits.push('overdue');
    if (f.id === 'draft') bits.push('draft');
  }
  return bits.length ? bits.join(', ') : '';
}

function predicatePhrase(tp) {
  if (!tp) return '';
  const req = (tp.requiredRelationships || []).map((r) => {
    const min = r.minimum ?? 1;
    return `at least ${min} linked ${r.type}`;
  });
  const excl = (tp.excludedRelationships || []).map((r) => {
    const max = r.maximum ?? 0;
    return `no linked ${r.type}${max === 0 ? '' : ` (max ${max})`}`;
  });
  const rel = [...req, ...excl].join('; ');
  const target = tp.targetType === 'Obligation' ? 'Obligations' : tp.targetType === 'Change' ? 'Regulatory Changes' : tp.targetType;
  let core = `${target}`;
  if (rel.includes('Evidence') && rel.includes('AssuranceFinding')) {
    core = 'Obligations with direct Evidence and attributable Assurance Findings';
  } else if (rel.includes('no linked Evidence')) {
    core = 'Obligations with no directly attributed Evidence';
  } else if (rel.includes('Evidence') && excl.some((e) => e.includes('AssuranceFinding'))) {
    core = 'Obligations with direct Evidence and no attributable Assurance Findings';
  } else if (rel.includes('ImpactAssessment') && excl.length) {
    core = 'Regulatory Changes with no Impact Assessment';
  } else if (rel) {
    core = `${target} where ${rel}`;
  }
  return core;
}

export function buildInterpretedAsPlainEnglish(plan, filters, resultState, options = {}) {
  const asOf = options.asOfLabel || (options.asOfDate ? formatAsOfLabel(options.asOfDate) : null);
  const anchors = anchorPhrase(plan);
  const status = statusPhrase(plan);
  const intent = filters?.intent;

  if (resultState === ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS) {
    if (plan?.resolvedEntities?.length) {
      const anchors = anchorPhrase(plan);
      return anchors
        ? `Partial scope: ${anchors}. The requested query structure is not supported by the deterministic grammar planner.`
        : 'This question could not be mapped safely to a supported Ask RI query plan.';
    }
    return 'This question could not be mapped safely to a supported Ask RI query plan.';
  }

  if (resultState === ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE) {
    return 'Named entity or domain is not present in verified RI catalogue data.';
  }

  if (intent === 'target-predicate' && plan?.targetPredicate) {
    let line = predicatePhrase(plan.targetPredicate);
    if (anchors) line += ` scoped to ${anchors}`;
    if (asOf) line += ` as of ${asOf}`;
    if (resultState === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS) {
      line += '. Zero records met the criteria in the current RI dataset.';
    }
    return line;
  }

  const primary = plan?.primaryTargetType || 'Change';
  let line = '';
  if (primary === 'Change') {
    line = `Regulatory Changes${anchors ? ` mapped to ${anchors}` : ''}`;
    if (status) line += ` (${status})`;
  } else if (primary === 'Obligation') {
    line = `Obligations${anchors ? ` on changes mapped to ${anchors}` : ''}`;
    if (status) line += ` (${status})`;
  } else if (primary === 'Control') {
    line = `Controls${anchors ? ` supporting obligations on changes mapped to ${anchors}` : ''}`;
    if (status) line += ` (${status})`;
  } else if (primary === 'Action') {
    line = `Actions${anchors ? ` linked to changes mapped to ${anchors}` : ''}`;
    if (status) line += ` (${status})`;
  } else {
    line = `${primary} records${anchors ? ` for ${anchors}` : ''}`;
  }

  if (asOf) line += ` as of ${asOf}`;

  const secondary = (plan?.secondaryIntents || []).map((s) => s.replace('linked-', '')).join(', ');
  if (secondary) line += `; also retrieving linked ${secondary}`;

  if (options.dueWithinDays) {
    line += `. Interpreted as: due within ${options.dueWithinDays} days${asOf ? ` as of ${asOf}` : ''}.`;
  }

  if (resultState === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS) {
    line += '. Zero qualifying records in the current RI dataset.';
  }

  return line;
}

export const SUPPORTED_QUESTION_EXAMPLES = [
  'What regulatory changes currently affect the Banking sector?',
  'Which Consumer Duty obligations have evidence but no assurance findings?',
  'How many open obligations are there?',
  'What Basel developments are linked to PRA implementation?',
];
