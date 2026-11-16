/**
 * Separate evaluation scorer outcomes from Stage C application policy statuses.
 */

/** @typedef {'ANSWERED'|'PARTIAL_ANSWER'|'INSUFFICIENT_EVIDENCE'|'BLOCKED'|string} ApplicationPolicyStatus */

/**
 * @param {object} engineResult
 * @param {object} scored
 */
export function classifyEvalLayers(engineResult, scored) {
  const policyStatus =
    typeof engineResult.status === 'string'
      ? engineResult.status
      : engineResult.status?.status || engineResult.stageC?.policyReason;
  return {
    applicationPolicyStatus: engineResult.status,
    policyReason: engineResult.stageC?.policyReason || engineResult.policyReason || null,
    scorerOutcome: scored?.outcome || null,
    harnessClassification: scored?.idealScoringClassification || null,
    suiteIdeal:
      engineResult.caseRow?.expectedIdealResult?.outcomeClassification ||
      engineResult.caseRow?.expectedIdealResult?.responseState ||
      null,
    regulatoryAccuracyVerified: false,
    note: 'Compare policy status and scorer outcome separately; suite ideal requires SME approval.',
  };
}