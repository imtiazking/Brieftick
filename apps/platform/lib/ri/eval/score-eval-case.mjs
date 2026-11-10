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

  // D01 routing
  const routedCatalogue = mentionsPub;
  const routedTenant = !mentionsPub;
  const expectedTenant = Boolean(caseRow.tenantDataRequired) && !mentionsPub;
  const expectedCatalogue = mentionsPub;
  if (expectedCatalogue && routedCatalogue) dims.D01 = 3;
  else if (expectedTenant && routedTenant) dims.D01 = 3;
  else if (expectedCatalogue && !routedCatalogue) dims.D01 = 0;
  else if (caseRow.questionCategory === 'H' && !routedCatalogue) dims.D01 = 2;
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
    dims.D03 = caseRow.expectedResultClassification?.includes('INSUFFICIENT') ? 2 : 0;
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
  const expectsInsufficient = String(caseRow.expectedResultClassification || '').includes('INSUFFICIENT');
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

  // Classification match
  let outcome = 'FAIL';
  const exp = caseRow.expectedResultClassification || 'ANSWERED';
  if (criticalFailures.length) outcome = 'FAIL';
  else if (exp === 'CORRECT_INSUFFICIENT_EVIDENCE') {
    outcome =
      status === 'INSUFFICIENT_EVIDENCE' || status === 'UNRESOLVED' || status === 'ZERO_RESULTS'
        ? 'CORRECT_INSUFFICIENT_EVIDENCE'
        : 'FAIL';
  } else if (exp === 'INSUFFICIENT_EVIDENCE_OR_UNRESOLVED') {
    outcome =
      status === 'INSUFFICIENT_EVIDENCE' || status === 'UNRESOLVED' || !context.simulateCatalogueAttach
        ? 'PARTIAL_PASS'
        : 'FAIL';
  } else if (exp === 'PASS_WITH_REFUTATION') {
    outcome = prohibitedHit ? 'PASS' : status === 'ANSWERED' ? 'PARTIAL_PASS' : 'FAIL';
  } else if (exp === 'ANSWERED') {
    outcome = status === 'ANSWERED' && dims.D02 >= 2 ? 'PASS' : status === 'ANSWERED' ? 'PARTIAL_PASS' : 'FAIL';
  } else if (exp === 'PARTIAL_PASS') {
    outcome =
      status === 'ANSWERED' || status === 'INSUFFICIENT_EVIDENCE' ? 'PARTIAL_PASS' : dims.D09 === 3 ? 'CORRECT_INSUFFICIENT_EVIDENCE' : 'FAIL';
  } else if (exp === 'UNRESOLVED_OR_INSUFFICIENT') {
    outcome = status === 'UNRESOLVED' || status === 'INSUFFICIENT_EVIDENCE' ? 'PASS' : 'PARTIAL_PASS';
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
