/**
 * Assess whether D01–D11 / CF-01–CF-10 can be reproduced from stored evidence.
 * Does not invoke scoreEvalCase — inventory only.
 */

const FORBIDDEN_IN_REPORT = ['answer', 'citations', 'modelOutput', 'dimensions', 'criticalFailures', 'themeCoverage'];

/**
 * @param {object} reportRow - one result row from a persisted eval report
 * @param {object|null} suiteCaseRow - matching case from frozen suite JSON (if loaded)
 * @returns {{ reconstructable: boolean, status: string, missing: string[], notes: string[] }}
 */
export function assessScoringReconstructionInputs(reportRow, suiteCaseRow = null) {
  const missing = [];
  const notes = [];
  if (!reportRow?.testId) {
    return { reconstructable: false, status: 'NOT_RECONSTRUCTABLE', missing: ['testId'], notes: ['no_report_row'] };
  }

  const isSanitised = reportRow.sanitised === true || reportRow.answerPreview != null;
  if (isSanitised || !reportRow.answer || reportRow.answer === reportRow.answerPreview) {
    if (!reportRow.answer || String(reportRow.answer).length <= 400) {
      missing.push('full_engine_answer_text');
      notes.push('Persisted reports retain answerPreview only (≤400 chars); scorer needs full answer for D08/D09/theme checks.');
    }
  }
  if (!Array.isArray(reportRow.citations) && (reportRow.citationCount == null || reportRow.citationCount === 0)) {
    missing.push('citations_array');
    notes.push('D02/D03/CF-04 require citation objects with publicationId and optional physicalPageNumber.');
  } else if (!Array.isArray(reportRow.citations)) {
    missing.push('citations_array');
    notes.push(`Only citationCount=${reportRow.citationCount} retained; citation payloads not stored.`);
  }

  if (reportRow.engineStatus == null && reportRow.status == null) {
    missing.push('engine_status');
  }
  if (reportRow.dimensions == null) {
    missing.push('stored_dimensions_D01_D11');
    notes.push('Observed dimensions are not written to sanitised V2 eval reports.');
  }
  if (reportRow.criticalFailures == null) {
    missing.push('stored_criticalFailures_CF01_CF10');
  }

  if (!suiteCaseRow) {
    missing.push('suite_case_row');
    notes.push('Need frozen suite case (question, expectedIdealResult, prohibitedClaims, expectedPublicationIds).');
  }

  const reconstructable = missing.length === 0;
  return {
    reconstructable,
    status: reconstructable ? 'RECONSTRUCTABLE' : 'NOT_RECONSTRUCTABLE',
    missing,
    notes,
    observedHistoricalOnly: Boolean(reportRow.outcome),
    forbiddenIfPresentInReport: FORBIDDEN_IN_REPORT.filter((k) => reportRow[k] != null),
  };
}
