/**
 * Minimal schema validation for Ask RI evaluation suite JSON.
 * Does not mutate suites; rejects unknown operator-held-out content in default repo suite.
 */

const REQUIRED_TOP = [
  'evaluationVersion',
  'schemaVersion',
  'scoringDimensions',
  'criticalFailureConditions',
  'cases',
];

const REQUIRED_CASE = ['testId', 'questionCategory'];

export function validateEvalSuite(doc, { allowOperatorHeldOut = true, requireQuestions = true } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: ['suite_not_object'] };

  for (const key of REQUIRED_TOP) {
    if (!(key in doc)) errors.push(`missing_top_level:${key}`);
  }
  if (!Array.isArray(doc.cases)) errors.push('cases_not_array');
  if (errors.length) return { ok: false, errors };

  for (const c of doc.cases) {
    for (const key of REQUIRED_CASE) {
      if (!(key in c)) errors.push(`case_missing_${key}:${c?.testId || 'unknown'}`);
    }
    if (c.operatorHeldOut && !allowOperatorHeldOut) {
      errors.push(`operator_held_out_not_allowed:${c.testId}`);
    }
    if (requireQuestions && !c.operatorHeldOut && !c.reserved && !String(c.question || '').trim()) {
      errors.push(`empty_question:${c.testId}`);
    }
  }

  if (!Array.isArray(doc.scoringDimensions) || !doc.scoringDimensions.length) {
    errors.push('scoring_dimensions_empty');
  }

  return { ok: errors.length === 0, errors };
}

export function selectRunnableCases(suite, { includeOperatorHeldOut = false } = {}) {
  return (suite.cases || []).filter((c) => {
    if (c.operatorHeldOut || c.reserved) return includeOperatorHeldOut;
    return true;
  });
}
