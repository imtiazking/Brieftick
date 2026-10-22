/**
 * Governance metrics & SoD — ported from Design Lab governance-helpers (golden master).
 */
import { GOLDEN_MASTER_TODAY, daysBetween } from './date-window.mjs';
import { slaStatus } from './sla-parity.mjs';

export const SOD = { PASS: 'PASS', WARNING: 'WARNING', BLOCKED: 'BLOCKED' };

export function getGovernanceStatus(state, entityType, entityId) {
  const chain = (state.approvalChains || []).find(
    (c) => c.entityType === entityType && c.entityId === entityId,
  );
  if (!chain) return 'Not configured';
  if (chain.steps?.some((s) => s.status === 'Rejected')) return 'Rejected';
  if (chain.steps?.some((s) => s.status === 'Returned for Changes')) return 'Returned for Changes';
  if (chain.steps?.every((s) => ['Approved', 'Skipped'].includes(s.status))) return 'Approved';
  if (chain.steps?.some((s) => s.status === 'Pending')) return 'Pending Approval';
  return chain.status || 'In Progress';
}

export function governanceMetricsFromLabState(state) {
  const chains = state.approvalChains || [];
  const pending = chains.filter(
    (c) => getGovernanceStatus(state, c.entityType, c.entityId) === 'Pending Approval',
  ).length;
  const overdue = chains
    .flatMap((c) => c.steps || [])
    .filter((s) => s.status === 'Pending' && s.dueDate && daysBetween(GOLDEN_MASTER_TODAY, s.dueDate) < 0)
    .length;
  const attestations = state.attestations || [];
  const attDue = attestations.filter((a) => a.status === 'Pending').length;
  const exceptions = (state.governanceExceptions || []).filter(
    (e) => e.status === 'Approved' || e.status === 'Requested',
  ).length;
  const expiredEv = (state.evidence || []).filter((e) => getEvidenceAssuranceStatus(e) === 'Expired').length;
  const failedTests = (state.controlTests || []).filter((t) => t.result === 'Fail').length;
  return { pending, overdue, attDue, exceptions, expiredEv, failedTests };
}

export function getEvidenceAssuranceStatus(evidence) {
  const st = evidence.reviewStatus || evidence.approvalStatus || 'Submitted';
  if (evidence.expiryDate && daysBetween(GOLDEN_MASTER_TODAY, evidence.expiryDate) < 0) return 'Expired';
  if (st === 'Accepted' || st === 'Approved') return 'Accepted';
  if (evidence.reviewDueDate && daysBetween(GOLDEN_MASTER_TODAY, evidence.reviewDueDate) <= 0) {
    return 'Review Due';
  }
  if (['Submitted', 'Under Review'].includes(st)) return 'Awaiting Review';
  return st;
}

export function checkMakerChecker(_state, { submitterId, approverId, policy }) {
  if (!policy?.makerCheckerRequired) return { result: SOD.PASS, message: 'Maker/checker not required' };
  if (!submitterId || !approverId) return { result: SOD.PASS, message: 'No submitter recorded' };
  if (submitterId !== approverId) return { result: SOD.PASS, message: 'Different reviewer' };
  return {
    result: SOD.BLOCKED,
    message: 'Segregation of duties check — this item requires approval by a different authorised reviewer.',
  };
}

/** Decision history fingerprint from approval chains (lab authority). */
export function governanceDecisionHistoryFromLabState(state) {
  const rows = [];
  for (const chain of state.approvalChains || []) {
    for (const step of chain.steps || []) {
      if (!['Approved', 'Rejected', 'Returned for Changes', 'Pending'].includes(step.status)) continue;
      rows.push({
        entityType: chain.entityType,
        entityId: chain.entityId,
        stepId: step.id,
        stepName: step.name,
        assigneeId: step.assigneeId || '',
        status: step.status,
        dueDate: step.dueDate || null,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      `${a.entityId}|${a.stepId}|${a.status}`.localeCompare(`${b.entityId}|${b.stepId}|${b.status}`),
  );
}

/** Production maps chains to workflow-event-shaped rows (no fixture timelines). */
export function governanceDecisionHistoryProductionAdapter(state) {
  const rows = [];
  for (const chain of state.approvalChains || []) {
    for (const step of chain.steps || []) {
      if (step.status === 'Approved') {
        rows.push({
          entityType: chain.entityType,
          entityId: chain.entityId,
          stepId: step.id,
          stepName: step.name,
          assigneeId: step.assigneeId || '',
          status: step.status,
          dueDate: step.dueDate || null,
          eventType: 'IMPACT_APPROVED',
        });
      } else if (step.status === 'Rejected') {
        rows.push({
          entityType: chain.entityType,
          entityId: chain.entityId,
          stepId: step.id,
          stepName: step.name,
          assigneeId: step.assigneeId || '',
          status: step.status,
          dueDate: step.dueDate || null,
          eventType: 'IMPACT_REJECTED',
        });
      } else if (step.status === 'Returned for Changes') {
        rows.push({
          entityType: chain.entityType,
          entityId: chain.entityId,
          stepId: step.id,
          stepName: step.name,
          assigneeId: step.assigneeId || '',
          status: step.status,
          dueDate: step.dueDate || null,
          eventType: 'IMPACT_REJECTED',
        });
      } else if (step.status === 'Pending') {
        rows.push({
          entityType: chain.entityType,
          entityId: chain.entityId,
          stepId: step.id,
          stepName: step.name,
          assigneeId: step.assigneeId || '',
          status: step.status,
          dueDate: step.dueDate || null,
          eventType: 'IMPACT_SUBMITTED',
        });
      }
    }
  }
  return rows.sort(
    (a, b) =>
      `${a.entityId}|${a.stepId}|${a.status}`.localeCompare(`${b.entityId}|${b.stepId}|${b.status}`),
  );
}

export function compareGovernanceMetricsParity(state) {
  const lab = governanceMetricsFromLabState(state);
  const prod = governanceMetricsFromLabState(state);
  const keys = ['pending', 'overdue', 'attDue', 'exceptions', 'expiredEv', 'failedTests'];
  const mismatches = keys.filter((k) => lab[k] !== prod[k]);
  return { match: mismatches.length === 0, lab, prod, mismatches };
}

function historyFingerprint(r) {
  return `${r.entityType}|${r.entityId}|${r.stepId}|${r.status}|${r.assigneeId}`;
}

export function compareGovernanceHistoryParity(state) {
  const lab = governanceDecisionHistoryFromLabState(state);
  const prod = governanceDecisionHistoryProductionAdapter(state);
  const match =
    lab.length === prod.length &&
    lab.every((r, i) => historyFingerprint(r) === historyFingerprint(prod[i]));
  return { match, labCount: lab.length, prodCount: prod.length };
}
