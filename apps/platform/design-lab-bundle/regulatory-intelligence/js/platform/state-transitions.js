import { APP_ERRORS, appError } from './app-errors.js';

const IA_TRANSITIONS = {
  Draft: ['Submitted for Review', 'In Progress'],
  'In Progress': ['Submitted for Review', 'Draft'],
  'Submitted for Review': ['Review', 'Returned for Changes'],
  Review: ['Awaiting Approval', 'Returned for Changes'],
  'Awaiting Approval': ['Approved', 'Returned for Changes'],
  Approved: ['Implementation'],
  Implementation: ['Complete'],
};

const FINDING_TRANSITIONS = {
  Open: ['Remediation In Progress'],
  'Remediation In Progress': ['Awaiting Validation', 'Open'],
  'Awaiting Validation': ['Closed', 'Remediation In Progress'],
};

export function canTransitionImpactAssessment(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  const allowed = IA_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertImpactAssessmentTransition(assessment, nextStatus) {
  if (!assessment) return appError(APP_ERRORS.NOT_FOUND, 'Assessment not found');
  const from = assessment.status;
  if (from === nextStatus) return { ok: true };
  if (!canTransitionImpactAssessment(from, nextStatus)) {
    return appError(APP_ERRORS.INVALID_STATE_TRANSITION, `Cannot move Impact Assessment from ${from} to ${nextStatus}`);
  }
  return { ok: true };
}

export function canTransitionFinding(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  const allowed = FINDING_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertFindingTransition(finding, nextStatus) {
  if (!finding) return appError(APP_ERRORS.NOT_FOUND, 'Finding not found');
  const from = finding.status;
  if (from === nextStatus) return { ok: true };
  if (!canTransitionFinding(from, nextStatus)) {
    return appError(APP_ERRORS.INVALID_STATE_TRANSITION, `Cannot move Finding from ${from} to ${nextStatus}`);
  }
  return { ok: true };
}
