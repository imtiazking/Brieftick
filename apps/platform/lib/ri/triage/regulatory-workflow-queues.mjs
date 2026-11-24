/**
 * Six-queue regulatory workflow (presentation layer). Underlying finding rows are not duplicated;
 * effective queue is derived from persisted decisions, dispositions and human verification.
 */
import { DISPOSITIONS, TRIAGE_QUEUES } from '../classification/regulatory-classification-policy.mjs';

export const WORKFLOW_QUEUES = Object.freeze({
  AI_FINDINGS: 'AI_FINDINGS',
  VERIFIED_OBLIGATIONS: 'VERIFIED_OBLIGATIONS',
  NON_OBLIGATIONS: 'NON_OBLIGATIONS',
  REJECTED_FINDINGS: 'REJECTED_FINDINGS',
  EXCEPTIONS: 'EXCEPTIONS',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  ALL_FINDINGS: 'ALL_FINDINGS',
});

export const WORKFLOW_QUEUE_ORDER = Object.freeze([
  WORKFLOW_QUEUES.AI_FINDINGS,
  WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS,
  WORKFLOW_QUEUES.NON_OBLIGATIONS,
  WORKFLOW_QUEUES.REJECTED_FINDINGS,
  WORKFLOW_QUEUES.EXCEPTIONS,
  WORKFLOW_QUEUES.NOT_APPLICABLE,
]);

const LEGACY_QUEUE_TO_WORKFLOW = Object.freeze({
  OBLIGATION_TRIAGE: WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS,
  NON_OBLIGATION_TRIAGE: WORKFLOW_QUEUES.NON_OBLIGATIONS,
  EXCEPTION_TRIAGE: WORKFLOW_QUEUES.EXCEPTIONS,
});

export function isWorkflowQueue(value) {
  if (!value || typeof value !== 'string') return false;
  return (
    WORKFLOW_QUEUE_ORDER.includes(value) ||
    value === WORKFLOW_QUEUES.ALL_FINDINGS ||
    Object.keys(LEGACY_QUEUE_TO_WORKFLOW).includes(value)
  );
}

export function resolveWorkflowQueueParam(queue) {
  if (!queue) return null;
  if (queue === WORKFLOW_QUEUES.ALL_FINDINGS) return WORKFLOW_QUEUES.ALL_FINDINGS;
  if (LEGACY_QUEUE_TO_WORKFLOW[queue]) return LEGACY_QUEUE_TO_WORKFLOW[queue];
  if (WORKFLOW_QUEUE_ORDER.includes(queue)) return queue;
  return null;
}

/**
 * @param {{
 *   hasPersistedDecision?: boolean;
 *   humanVerification?: string;
 *   decision?: string | null;
 *   disposition?: string | null;
 *   classificationQueue?: string | null;
 * }} input
 */
export function deriveWorkflowQueue(input) {
  const hasPersistedDecision = Boolean(input.hasPersistedDecision);
  const humanVerification = String(input.humanVerification || 'UNVERIFIED');
  const decision = input.decision || null;
  const disposition = input.disposition || null;
  const classificationQueue = input.classificationQueue || null;

  if (!hasPersistedDecision) {
    return WORKFLOW_QUEUES.AI_FINDINGS;
  }

  if (decision === 'REJECTED' || humanVerification === 'REJECTED') {
    return WORKFLOW_QUEUES.REJECTED_FINDINGS;
  }

  if (disposition === DISPOSITIONS.ORGANISATION_NOT_APPLICABLE) {
    return WORKFLOW_QUEUES.NOT_APPLICABLE;
  }

  if (
    disposition === DISPOSITIONS.RECLASSIFY ||
    humanVerification === 'NEEDS_REVIEW' ||
    humanVerification === 'RE_VERIFICATION_REQUIRED'
  ) {
    return WORKFLOW_QUEUES.EXCEPTIONS;
  }

  if (decision === 'ACCEPTED') {
    if (classificationQueue === TRIAGE_QUEUES.NON_OBLIGATION) {
      return WORKFLOW_QUEUES.NON_OBLIGATIONS;
    }
    if (
      disposition === DISPOSITIONS.CONVERT ||
      disposition === DISPOSITIONS.LINK ||
      (classificationQueue === TRIAGE_QUEUES.OBLIGATION && humanVerification === 'VERIFIED')
    ) {
      return WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS;
    }
    if (
      [DISPOSITIONS.SUPPORTING, DISPOSITIONS.HORIZON, DISPOSITIONS.ARCHIVE, DISPOSITIONS.LINK].includes(disposition)
    ) {
      return WORKFLOW_QUEUES.NON_OBLIGATIONS;
    }
    if (humanVerification === 'VERIFIED') {
      return classificationQueue === TRIAGE_QUEUES.OBLIGATION
        ? WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS
        : WORKFLOW_QUEUES.NON_OBLIGATIONS;
    }
  }

  return WORKFLOW_QUEUES.EXCEPTIONS;
}

export function emptyWorkflowCounts() {
  return Object.fromEntries(WORKFLOW_QUEUE_ORDER.map((q) => [q, 0]));
}

export function countWorkflowQueues(rows) {
  const counts = emptyWorkflowCounts();
  for (const row of rows) {
    const q = row.workflowQueue;
    if (q && counts[q] !== undefined) counts[q] += 1;
  }
  counts[WORKFLOW_QUEUES.ALL_FINDINGS] = rows.length;
  return counts;
}

export const WORKFLOW_LABELS = Object.freeze({
  [WORKFLOW_QUEUES.AI_FINDINGS]: 'AI Findings',
  [WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS]: 'Verified Obligations',
  [WORKFLOW_QUEUES.NON_OBLIGATIONS]: 'Non-Obligations',
  [WORKFLOW_QUEUES.REJECTED_FINDINGS]: 'Rejected Findings',
  [WORKFLOW_QUEUES.EXCEPTIONS]: 'Exceptions',
  [WORKFLOW_QUEUES.NOT_APPLICABLE]: 'Not Applicable',
  [WORKFLOW_QUEUES.ALL_FINDINGS]: 'All Findings',
});