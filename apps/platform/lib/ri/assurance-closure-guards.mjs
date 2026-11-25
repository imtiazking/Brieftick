/**
 * Mandatory assurance / compliance lifecycle closure criteria.
 */

export const ASSURANCE_WF = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  TESTING_READY: 'TESTING_READY',
  REMEDIATION_REQUIRED: 'REMEDIATION_REQUIRED',
  RETEST_REQUIRED: 'RETEST_REQUIRED',
  READY_FOR_CLOSURE: 'READY_FOR_CLOSURE',
  CLOSED: 'CLOSED',
};

export function assuranceWorkflowStatus(metadata) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  return String(m.assuranceStatus || (m.stage5PrimaryPlan ? ASSURANCE_WF.DRAFT : 'OPEN'));
}

/**
 * @param {{
 *   result: string;
 *   metadata: Record<string, unknown> | null | undefined;
 *   openFindingsCount?: number;
 *   incompleteRemediationCount?: number;
 * }} input
 * @returns {{ ok: boolean; gaps: string[] }}
 */
export function evaluateAssuranceLifecycleClosure(input) {
  const gaps = [];
  const meta = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const status = assuranceWorkflowStatus(meta);

  if (status !== ASSURANCE_WF.READY_FOR_CLOSURE) {
    gaps.push('assurance_not_ready_for_closure');
  }
  if (input.result !== 'PASS') {
    gaps.push('assurance_result_not_pass');
  }
  if (!meta.controlTestCompleted) {
    gaps.push('control_test_not_completed');
  }
  if (!meta.evidenceReviewed) {
    gaps.push('evidence_not_reviewed');
  }
  const evidenceIds = meta.assuranceEvidenceIds;
  if (!Array.isArray(evidenceIds) || evidenceIds.length < 1) {
    gaps.push('missing_linked_evidence');
  }
  const openFindings = input.openFindingsCount ?? 0;
  const accepted = Array.isArray(meta.acceptedFindingExceptions) ? meta.acceptedFindingExceptions : [];
  if (openFindings > 0 && accepted.length < openFindings) {
    gaps.push('open_findings_without_exception');
  }
  if ((input.incompleteRemediationCount ?? 0) > 0) {
    gaps.push('remediation_incomplete');
  }
  if (meta.requiresRetest === true && meta.retestCompleted !== true) {
    gaps.push('retest_not_completed');
  }

  return { ok: gaps.length === 0, gaps };
}

/**
 * Plan approval must not satisfy lifecycle closure.
 * @param {string} wfStatus
 */
export function assertCanCloseComplianceLifecycle(wfStatus) {
  if (wfStatus !== ASSURANCE_WF.READY_FOR_CLOSURE) {
    const err = new Error('premature_compliance_lifecycle_closure');
    err.name = 'RiConflictError';
    throw err;
  }
}