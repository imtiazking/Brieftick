/**
 * Enterprise governance — derived status, SoD, authority, closure (mock, deterministic).
 */
import { DEMO_TODAY, personName, getPerson, daysBetween, parseDemoDate } from './workflow-helpers.js';

export const SOD = { PASS: 'PASS', WARNING: 'WARNING', BLOCKED: 'BLOCKED' };

export function getPersonRoles(state, personId) {
  const p = getPerson(state, personId);
  if (!p?.governanceRoleIds?.length) return [];
  return (state.governanceRoles || []).filter((r) => p.governanceRoleIds.includes(r.id));
}

export function getRoleById(state, roleId) {
  return (state.governanceRoles || []).find((r) => r.id === roleId);
}

export function getPolicyForEntity(state, entityType, materiality) {
  const mat = (materiality || 'Medium').toLowerCase();
  return (state.governancePolicies || []).find((p) => {
    if (!p.active) return false;
    if (!p.entityTypes?.includes(entityType)) return false;
    const threshold = (p.materialityThreshold || '').toLowerCase();
    const order = ['low', 'medium', 'high', 'critical'];
    return order.indexOf(mat) >= order.indexOf(threshold);
  });
}

export function getApprovalChain(state, entityType, entityId) {
  return (state.approvalChains || []).find((c) => c.entityType === entityType && c.entityId === entityId);
}

export function getAttestationsForEntity(state, entityType, entityId) {
  return (state.attestations || []).filter((a) => a.entityType === entityType && a.entityId === entityId);
}

export function activeDelegationFor(state, personId, scope, materiality) {
  const today = DEMO_TODAY;
  return (state.delegations || []).find((d) => {
    if (d.status !== 'Active') return false;
    if (d.delegateId !== personId && d.delegatorId !== personId) return false;
    if (d.startDate > today || d.endDate < today) return false;
    if (d.scope && scope && !d.scope.includes(scope)) return false;
    if (d.maxMateriality) {
      const order = ['Low', 'Medium', 'High', 'Critical'];
      if (order.indexOf(materiality) > order.indexOf(d.maxMateriality)) return false;
    }
    return d.delegateId === personId;
  });
}

export function approvalAuthorityLevel(state, personId) {
  const roles = getPersonRoles(state, personId);
  const levels = roles.map((r) => r.approvalAuthorityMax || 'Medium');
  const order = ['Low', 'Medium', 'High', 'Critical'];
  let max = 'Low';
  levels.forEach((l) => {
    if (order.indexOf(l) > order.indexOf(max)) max = l;
  });
  return max;
}

export function canApproveMateriality(state, personId, materiality) {
  const max = approvalAuthorityLevel(state, personId);
  const order = ['Low', 'Medium', 'High', 'Critical'];
  return order.indexOf(materiality || 'Medium') <= order.indexOf(max);
}

export function checkMakerChecker(state, { submitterId, approverId, policy }) {
  if (!policy?.makerCheckerRequired) return { result: SOD.PASS, message: 'Maker/checker not required' };
  if (!submitterId || !approverId) return { result: SOD.PASS, message: 'No submitter recorded' };
  if (submitterId !== approverId) return { result: SOD.PASS, message: 'Different reviewer' };
  return {
    result: SOD.BLOCKED,
    message: 'Segregation of duties check — this item requires approval by a different authorised reviewer.',
  };
}

export function checkEvidenceReviewerSoD(state, evidence, reviewerId) {
  const uploaderId = evidence.uploadedById || evidence.ownerId;
  if (!uploaderId || uploaderId !== reviewerId) return { result: SOD.PASS, message: 'Independent reviewer' };
  return {
    result: SOD.WARNING,
    message: 'Evidence uploader is performing review — independent review recommended by policy.',
  };
}

export function getGovernanceWarnings(state, entityType, entityId) {
  const warnings = [];
  const chain = getApprovalChain(state, entityType, entityId);
  if (chain) {
    chain.steps?.forEach((st) => {
      if (st.status === 'Pending' && st.dueDate && daysBetween(DEMO_TODAY, st.dueDate) < 0) {
        warnings.push({ code: 'APPROVAL_OVERDUE', message: `Approval step overdue: ${st.name}`, severity: 'High' });
      }
      if (st.status === 'Pending' && !st.assigneeId) {
        warnings.push({ code: 'MISSING_APPROVER', message: `No approver assigned: ${st.name}`, severity: 'Medium' });
      }
    });
    if (chain.committeeReviewRequired && !chain.committeeDecision) {
      warnings.push({ code: 'COMMITTEE_REQUIRED', message: 'Regulatory Change Committee review required', severity: 'High' });
    }
  }
  const ch = entityType === 'Regulatory Change' ? state.changes.find((c) => c.id === entityId) : null;
  if (ch?.reanalysisRequired || ch?.governanceReviewRequired) {
    warnings.push({ code: 'REANALYSIS', message: 'Source update — governance review required', severity: 'High' });
  }
  return warnings;
}

export function getEvidenceAssuranceStatus(evidence) {
  const st = evidence.reviewStatus || evidence.approvalStatus || 'Submitted';
  if (evidence.expiryDate && daysBetween(DEMO_TODAY, evidence.expiryDate) < 0) return 'Expired';
  if (st === 'Accepted' || st === 'Approved') return 'Accepted';
  if (evidence.reviewDueDate && daysBetween(DEMO_TODAY, evidence.reviewDueDate) <= 0) return 'Review Due';
  if (['Submitted', 'Under Review'].includes(st)) return 'Awaiting Review';
  return st;
}

export function getClosureReadiness(state, changeId) {
  const ch = state.changes.find((c) => c.id === changeId);
  if (!ch) return { ready: false, items: [] };
  const items = [];
  const ok = (label, met, detail) => {
    items.push({ label, met, detail });
    return met;
  };

  const applicabilityOk = ch.applicabilityDecision === 'Applicable' || ch.applicabilityDecision === 'Not Applicable';
  ok('Applicability decision recorded', applicabilityOk, ch.applicabilityDecision || 'Pending');

  const ias = state.assessments.filter((a) => a.changeId === changeId);
  const iaApproved = ias.length === 0 || ias.every((a) => a.approvalStatus === 'Approved' || a.status === 'Implementation');
  ok('Impact Assessment approved', iaApproved, ias.map((a) => `${a.id}: ${a.approvalStatus || a.status}`).join(', ') || '—');

  const chain = getApprovalChain(state, 'Regulatory Change', changeId);
  const requiredSteps = chain?.steps?.filter((s) => s.status !== 'Not Started') || [];
  const approvalsOk = !chain || requiredSteps.every((s) => ['Approved', 'Skipped'].includes(s.status));
  ok('Governance approvals complete', approvalsOk, chain?.status || 'No chain');

  const committeeOk = !chain?.committeeReviewRequired || Boolean(chain.committeeDecision);
  ok('Committee review complete', committeeOk, chain?.committeeDecision || 'Pending');

  const oblIds = new Set();
  state.obligations.filter((o) => o.changeId === changeId).forEach((o) => oblIds.add(o.id));
  ok('Obligations mapped', oblIds.size > 0, `${oblIds.size} obligation(s)`);

  const actions = state.actions.filter((a) => oblIds.has(a.sourceId) || a.changeId === changeId);
  const actionsOk = actions.length === 0 || actions.every((a) => a.status === 'Complete');
  ok('Implementation actions complete', actionsOk, actions.map((a) => `${a.id}: ${a.status}`).join(', ') || '—');

  const evIds = new Set();
  actions.forEach((a) => (a.evidenceIds || []).forEach((e) => evIds.add(e)));
  (ch.linkedEvidenceIds || []).forEach((e) => evIds.add(e));
  getAttestationsForEntity(state, 'Regulatory Change', changeId).forEach((att) =>
    (att.supportingEvidenceIds || []).forEach((e) => evIds.add(e))
  );
  const evList = [...evIds].map((id) => state.evidence.find((e) => e.id === id)).filter(Boolean);
  const evidenceOk = evList.length === 0 || evList.every((e) => getEvidenceAssuranceStatus(e) === 'Accepted');
  ok('Evidence accepted', evidenceOk, evList.map((e) => `${e.id}: ${getEvidenceAssuranceStatus(e)}`).join(', ') || '—');

  const att = getAttestationsForEntity(state, 'Regulatory Change', changeId).find((a) => a.attestationType === 'Final Implementation');
  const attOk = att?.status === 'Attested';
  ok('Final implementation attestation', attOk, att?.status || 'Not attested');

  const ready = items.every((i) => i.met) && getGovernanceWarnings(state, 'Regulatory Change', changeId).filter((w) => w.severity === 'High').length === 0;
  return { ready, items, change: ch };
}

export function getGovernanceStatus(state, entityType, entityId) {
  const chain = getApprovalChain(state, entityType, entityId);
  if (!chain) return 'Not configured';
  if (chain.steps.some((s) => s.status === 'Rejected')) return 'Rejected';
  if (chain.steps.some((s) => s.status === 'Returned for Changes')) return 'Returned for Changes';
  if (chain.steps.every((s) => ['Approved', 'Skipped'].includes(s.status))) return 'Approved';
  if (chain.steps.some((s) => s.status === 'Pending')) return 'Pending Approval';
  return chain.status || 'In Progress';
}

export function getEscalationLevel(state, entityType, entityId) {
  const esc = (state.governanceEscalations || []).filter((e) => e.entityType === entityType && e.entityId === entityId);
  if (!esc.length) return null;
  return esc.sort((a, b) => (b.level || 0) - (a.level || 0))[0];
}

export function governanceMetrics(state) {
  const chains = state.approvalChains || [];
  const pending = chains.filter((c) => getGovernanceStatus(state, c.entityType, c.entityId) === 'Pending Approval').length;
  const overdue = chains.flatMap((c) => c.steps || []).filter((s) => s.status === 'Pending' && s.dueDate && daysBetween(DEMO_TODAY, s.dueDate) < 0).length;
  const attestations = state.attestations || [];
  const attDue = attestations.filter((a) => a.status === 'Pending').length;
  const exceptions = (state.governanceExceptions || []).filter((e) => e.status === 'Approved' || e.status === 'Requested').length;
  const expiredEv = (state.evidence || []).filter((e) => getEvidenceAssuranceStatus(e) === 'Expired').length;
  const failedTests = (state.controlTests || []).filter((t) => t.result === 'Fail').length;
  return { pending, overdue, attDue, exceptions, expiredEv, failedTests };
}
