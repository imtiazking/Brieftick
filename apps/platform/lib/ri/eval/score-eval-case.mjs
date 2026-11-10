import { questionMentionsPublicationReference } from '../ask-ri/publication-pdf-question-match.mjs';

const DEADLINE_PATTERNS = [
  /\bmust comply by\b/i,
  /\bbinding deadline\b/i,
  /\bno later than \d{1,2}\s+\w+\s+20\d{2}\b/i,
  /\bweekly board sign-off\b/i,
  /\bstatutory offence\b/i,
  /\bnew criminal offence\b/i,
  /\bbinding obligation\b/i,
];

const SME_DIMENSIONS = new Set([
  'D05',
  'D06',
  'D07',
  'D04',
]);

/** Map legacy evaluation-grade labels to production-style response states. */
export function mapLegacyIdealToResponseState(classification) {
  if (!classification) return 'ANSWERED';
  const c = String(classification);
  if (c === 'PARTIAL_PASS') return 'ANSWERED';
  if (c === 'CORRECT_INSUFFICIENT_EVIDENCE') return 'INSUFFICIENT_EVIDENCE';
  if (c === 'INSUFFICIENT_EVIDENCE_OR_UNRESOLVED') return 'INSUFFICIENT_EVIDENCE';
  if (c === 'PASS_WITH_REFUTATION') return 'ANSWERED';
  if (c === 'UNRESOLVED_OR_INSUFFICIENT') return 'UNRESOLVED_QUERY_SEMANTICS';
  if (c === 'PARTIAL_PASS_OR_UNRESOLVED') return 'ANSWERED';
  return c;
}

/** Ideal platform response state (not harness outcome grade). */
export function resolveIdealResponseState(caseRow) {
  return (
    caseRow.expectedIdealResult?.responseState ||
    mapLegacyIdealToResponseState(caseRow.expectedIdealResult?.outcomeClassification) ||
    mapLegacyIdealToResponseState(caseRow.expectedResultClassification) ||
    'ANSWERED'
  );
}

/** Optional harness-only scoring class (e.g. refutation). */
export function resolveIdealScoringClassification(caseRow) {
  return (
    caseRow.expectedIdealResult?.idealScoringClassification ||
    caseRow.expectedIdealResult?.outcomeClassification ||
    caseRow.expectedResultClassification ||
    'ANSWERED'
  );
}

/** v1-compatible: resolves ideal response state for dimension scoring. */
export function resolveIdealOutcomeClassification(caseRow) {
  return resolveIdealResponseState(caseRow);
}

function refutesFalsePremise(answer, caseRow) {
  const ideal = caseRow.expectedIdealResult || {};
  if (!ideal.mustRefuteFalsePremise) return true;
  return (
    /consultation|propos(ed|al)|not in force/i.test(answer) &&
    (/no binding|does not (impose|create)|not a legal compliance|no compliance deadline/i.test(answer) ||
      /cannot identify.*(?:binding|legal).*deadline/i.test(answer))
  );
}

function gradeAnsweredOutcome({ status, dims, idealScoring, answer, caseRow, prohibitedHit }) {
  if (idealScoring === 'PASS_WITH_REFUTATION' || caseRow.expectedIdealResult?.mustRefuteFalsePremise) {
    if (prohibitedHit) return 'FAIL';
    if (refutesFalsePremise(answer, caseRow) && (status === 'ANSWERED' || status === 'INSUFFICIENT_EVIDENCE')) {
      return 'PASS';
    }
    if (status === 'ANSWERED') return 'PARTIAL_PASS';
    return 'FAIL';
  }
  if (status !== 'ANSWERED') return 'FAIL';
  if (dims.D02 >= 2 && dims.D03 >= 1) return 'PASS';
  if (dims.D02 >= 1 || dims.D03 >= 1) return 'PARTIAL_PASS';
  return 'PARTIAL_PASS';
}

/**
 * Score one case from frozen expectations + deterministic engine output.
 * Does not use engine output to build expected themes.
 */
export function scoreEvalCase(caseRow, engineResult, context) {
  const dims = {};
  const criticalFailures = [];
  const notes = [];
  const answer = String(engineResult?.answer || '');
  const citations = engineResult?.citations || [];
  const status = engineResult?.status || 'UNKNOWN';
  const execution = engineResult?.execution || {};
  const mentionsPub = questionMentionsPublicationReference(caseRow.question || '');
  const ideal = caseRow.expectedIdealResult || {};
  const idealState = resolveIdealResponseState(caseRow);
  const idealScoring = resolveIdealScoringClassification(caseRow);
  const idealClass = idealState;

  // D01 routing
  const routedCatalogue = mentionsPub;
  const routedTenant = !mentionsPub;
  const needsSemanticDiscovery = Boolean(ideal.requiresSemanticPublicationDiscovery);
  const expectedTenant = Boolean(caseRow.tenantDataRequired) && !mentionsPub && !needsSemanticDiscovery;
  const idealCatalogue =
    mentionsPub ||
    needsSemanticDiscovery ||
    (caseRow.expectedPublicationIds?.length > 0 && !caseRow.tenantDataRequired);
  if (needsSemanticDiscovery && !context.simulateCatalogueAttach) {
    dims.D01 = 0;
  } else if (idealCatalogue && routedCatalogue) dims.D01 = 3;
  else if (idealCatalogue && needsSemanticDiscovery && context.simulateCatalogueAttach) dims.D01 = 2;
  else if (expectedTenant && routedTenant) dims.D01 = 3;
  else if (idealCatalogue && !routedCatalogue) dims.D01 = 0;
  else if (caseRow.questionCategory === 'H' && !routedCatalogue) dims.D01 = 1;
  else dims.D01 = 1;

  // D02 publication ids in citations
  const citedPubIds = [...new Set(citations.map((c) => c.publicationId).filter(Boolean))];
  const expectedIds = caseRow.expectedPublicationIds || [];
  if (!expectedIds.length) {
    dims.D02 = citedPubIds.length === 0 ? 3 : 1;
  } else {
    const hit = expectedIds.filter((id) => citedPubIds.includes(id)).length;
    const ratio = hit / expectedIds.length;
    dims.D02 = ratio >= 1 ? 3 : ratio >= 0.5 ? 2 : ratio > 0 ? 1 : 0;
  }

  // D03 evidence relevance — page hints for PDF
  const expectedPages = (caseRow.expectedCitationSections || [])
    .flatMap((s) => s.pages || [])
    .filter((p) => typeof p === 'number');
  if (expectedPages.length) {
    const citedPages = citations
      .map((c) => c.physicalPageNumber)
      .filter((p) => typeof p === 'number');
    const overlap = expectedPages.filter((p) => citedPages.includes(p)).length;
    dims.D03 = overlap >= 2 ? 3 : overlap === 1 ? 2 : citedPages.length ? 1 : 0;
  } else if (citations.length && status === 'ANSWERED') {
    dims.D03 = 2;
  } else if (status === 'INSUFFICIENT_EVIDENCE' || status === 'UNRESOLVED') {
    dims.D03 = idealState.includes('INSUFFICIENT') ? 0 : 0;
  } else {
    dims.D03 = 0;
  }

  for (const id of SME_DIMENSIONS) {
    dims[id] = 'AWAITING_SME_REVIEW';
  }

  // D08 prohibited claims
  const prohibited = caseRow.prohibitedClaims || [];
  let prohibitedHit = false;
  for (const pat of DEADLINE_PATTERNS) {
    if (pat.test(answer)) {
      prohibitedHit = true;
      notes.push(`prohibited_pattern:${pat.source}`);
    }
  }
  for (const phrase of prohibited) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(answer)) {
      prohibitedHit = true;
      notes.push(`prohibited_phrase:${phrase}`);
    }
  }
  dims.D08 = prohibitedHit ? 0 : citations.length || status !== 'ANSWERED' ? 2 : 3;

  // D09 uncertainty / insufficient
  const expectsInsufficient = idealState === 'INSUFFICIENT_EVIDENCE' || String(idealScoring).includes('INSUFFICIENT');
  if (expectsInsufficient) {
    dims.D09 =
      status === 'INSUFFICIENT_EVIDENCE' || status === 'UNRESOLVED' || engineResult?.insufficient
        ? 3
        : 1;
  } else if (status === 'ANSWERED') {
    dims.D09 = 2;
  } else {
    dims.D09 = 1;
  }

  dims.D10 = 'NOT_MEASURED';
  dims.D11 = 'NOT_MEASURED';

  // Critical failures (automatable subset)
  if (prohibitedHit) criticalFailures.push('CF-02');
  if (prohibitedHit && /binding obligation|statutory/i.test(answer)) criticalFailures.push('CF-01');
  if (
    caseRow.expectedRegulatoryStatus === 'consultation' &&
    execution.mustNotPresentAsBindingObligation === false &&
    /must\b/i.test(answer)
  ) {
    criticalFailures.push('CF-06');
    notes.push('consultation_may_be_presented_as_binding');
  }
  const wrongPub =
    expectedIds.length &&
    citedPubIds.length &&
    !citedPubIds.every((id) => expectedIds.includes(id));
  if (wrongPub) criticalFailures.push('CF-04');

  // Classification match (harness grades vs ideal response states)
  let outcome = 'FAIL';
  const legacyExp = caseRow.expectedIdealResult?.outcomeClassification || caseRow.expectedResultClassification;
  if (criticalFailures.length) outcome = 'FAIL';
  else if (idealState === 'INSUFFICIENT_EVIDENCE' || legacyExp === 'CORRECT_INSUFFICIENT_EVIDENCE') {
    outcome =
      status === 'INSUFFICIENT_EVIDENCE' || status === 'UNRESOLVED' || status === 'ZERO_RESULTS'
        ? 'CORRECT_INSUFFICIENT_EVIDENCE'
        : 'FAIL';
  } else if (legacyExp === 'INSUFFICIENT_EVIDENCE_OR_UNRESOLVED' && !caseRow.expectedIdealResult?.responseState) {
    outcome =
      status === 'INSUFFICIENT_EVIDENCE' || status === 'UNRESOLVED' || !context.simulateCatalogueAttach
        ? 'PARTIAL_PASS'
        : 'FAIL';
  } else if (idealState === 'ANSWERED' || idealState === 'UNRESOLVED_QUERY_SEMANTICS') {
    outcome = gradeAnsweredOutcome({ status, dims, idealScoring, answer, caseRow, prohibitedHit });
  } else if (legacyExp === 'UNRESOLVED_OR_INSUFFICIENT') {
    outcome = status === 'UNRESOLVED' || status === 'INSUFFICIENT_EVIDENCE' ? 'PASS' : 'PARTIAL_PASS';
  } else if (legacyExp === 'PARTIAL_PASS' && !caseRow.expectedIdealResult?.responseState) {
    outcome = gradeAnsweredOutcome({ status, dims, idealScoring, answer, caseRow, prohibitedHit });
  } else {
    outcome = status === 'ANSWERED' ? 'PARTIAL_PASS' : 'NOT_MEASURED';
  }

  if (!context.evidenceAvailable) {
    outcome = 'NOT_RUN';
    notes.push('missing_evidence_pack');
  }

  return {
    testId: caseRow.testId,
    outcome,
    idealResponseState: idealState,
    idealScoringClassification: idealScoring,
    idealOutcomeClassification: idealState,
    v1ExpectedResultClassification: caseRow.v1ExpectedResultClassification || null,
    engineStatus: status,
    executionEvidenceSource: execution.evidenceSource || null,
    executionEvidenceSources: execution.evidenceSources || [],
    interpretedAs: engineResult?.interpretedAs || null,
    citationCount: citations.length,
    citedPublicationIds: citedPubIds,
    dimensions: dims,
    criticalFailures,
    notes,
    prohibitedClaimAutomatable: true,
    hallucinationDetection: 'NOT_AUTOMATABLE',
  };
}
