/**
 * Public-catalogue eligibility gate (Phase 2C.2). Fail-closed — no redact-and-send.
 */

const TENANT_PRONOUN_RE =
  /\b(our organisation|our organization|our firm|our open|we have|my team|internal assessment|our controls|our obligations|our records)\b/i;

const CONFIDENTIAL_HINT_RE =
  /\b(customer name|date of birth|national insurance|passport number|account number|@(?:\w+\.)+\w+)\b/i;

const PERSON_NAME_CONTEXT_RE = /\b(mr|mrs|ms|dr)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/;

export const ELIGIBILITY_OUTCOMES = {
  PUBLIC_REGULATORY_QUESTION: 'PUBLIC_REGULATORY_QUESTION',
  TENANT_CONTEXT_REQUIRED: 'TENANT_CONTEXT_REQUIRED',
  CONFIDENTIAL_OR_PERSONAL_DATA: 'CONFIDENTIAL_OR_PERSONAL_DATA',
  AMBIGUOUS_ELIGIBILITY: 'AMBIGUOUS_ELIGIBILITY',
};

/**
 * @param {object} caseRow — frozen eval case or { question, tenantDataRequired, testId, questionCategory }
 */
export function classifyQuestionEligibility(caseRow) {
  const question = String(caseRow?.question || '').trim();
  const testId = caseRow?.testId || null;

  if (caseRow?.operatorHeldOut || caseRow?.reserved) {
    return {
      eligible: false,
      classification: ELIGIBILITY_OUTCOMES.AMBIGUOUS_ELIGIBILITY,
      reason: 'operator_held_out_reserved',
      testId,
    };
  }

  if (!question) {
    return {
      eligible: false,
      classification: ELIGIBILITY_OUTCOMES.AMBIGUOUS_ELIGIBILITY,
      reason: 'empty_question',
      testId,
    };
  }

  if (caseRow?.tenantDataRequired === true) {
    return {
      eligible: false,
      classification: ELIGIBILITY_OUTCOMES.TENANT_CONTEXT_REQUIRED,
      reason: 'tenant_data_required_flag',
      testId,
    };
  }

  if (caseRow?.evidenceAvailability === 'TENANT_FIXTURE') {
    return {
      eligible: false,
      classification: ELIGIBILITY_OUTCOMES.TENANT_CONTEXT_REQUIRED,
      reason: 'tenant_fixture_evidence',
      testId,
    };
  }

  if (caseRow?.questionCategory === 'F') {
    return {
      eligible: false,
      classification: ELIGIBILITY_OUTCOMES.TENANT_CONTEXT_REQUIRED,
      reason: 'tenant_category_F',
      testId,
    };
  }

  if (CONFIDENTIAL_HINT_RE.test(question) || PERSON_NAME_CONTEXT_RE.test(question)) {
    return {
      eligible: false,
      classification: ELIGIBILITY_OUTCOMES.CONFIDENTIAL_OR_PERSONAL_DATA,
      reason: 'confidential_or_personal_pattern',
      testId,
    };
  }

  if (TENANT_PRONOUN_RE.test(question)) {
    return {
      eligible: false,
      classification: ELIGIBILITY_OUTCOMES.TENANT_CONTEXT_REQUIRED,
      reason: 'tenant_pronoun_or_possessive',
      testId,
    };
  }

  if (caseRow?.tenantDataRequired === null) {
    return {
      eligible: false,
      classification: ELIGIBILITY_OUTCOMES.AMBIGUOUS_ELIGIBILITY,
      reason: 'unset_tenant_eligibility',
      testId,
    };
  }

  return {
    eligible: true,
    classification: ELIGIBILITY_OUTCOMES.PUBLIC_REGULATORY_QUESTION,
    reason: 'public_regulatory',
    testId,
  };
}

/** Build allowlist from suite cases (eligible IDs only). */
export function buildPublicEvalAllowlist(cases) {
  const allowed = [];
  const blocked = [];
  for (const c of cases) {
    const gate = classifyQuestionEligibility(c);
    if (gate.eligible) allowed.push(c.testId);
    else blocked.push({ testId: c.testId, ...gate });
  }
  return { allowedTestIds: allowed, blocked };
}

export function assertAllowlisted(testId, allowlist) {
  return allowlist.allowedTestIds.includes(testId);
}
