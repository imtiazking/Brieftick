/**
 * Governance workflow actions (mock enterprise controls).
 */
import {
  checkMakerChecker,
  canApproveMateriality,
  activeDelegationFor,
  getApprovalChain,
  getClosureReadiness,
  getPolicyForEntity,
  SOD,
} from './governance-helpers.js';
import { personName, DEMO_TODAY } from './workflow-helpers.js';

export function approveGovernanceStep(state, chainId, stepId, userId, comments, addAudit) {
  const chain = state.approvalChains.find((c) => c.id === chainId);
  const step = chain?.steps?.find((s) => s.id === stepId);
  if (!chain || !step) return { ok: false, error: 'Approval step not found' };

  const ch = state.changes.find((c) => c.id === chain.entityId);
  const materiality = ch?.materiality || 'High';
  const delegation = activeDelegationFor(state, userId, 'Regulatory Change', materiality);
  const actingAsDelegate = delegation && userId === delegation.delegateId;

  if (!canApproveMateriality(state, userId, materiality) && !actingAsDelegate) {
    return { ok: false, error: 'Approval authority insufficient for this materiality level.' };
  }

  step.status = 'Approved';
  step.decision = 'Approved';
  step.completedDate = DEMO_TODAY;
  step.comments = comments || '';
  step.completedById = userId;
  if (actingAsDelegate) step.delegatedFromId = delegation.delegatorId;

  addAudit({
    user: personName(state, userId),
    action: actingAsDelegate ? 'Approval granted (delegated authority)' : 'Approval granted',
    recordType: chain.entityType,
    recordId: chain.entityId,
    previousValue: 'Pending',
    newValue: 'Approved',
    comments: `${step.name}: ${comments || ''}`,
    relatedIds: [chain.entityId, chainId, stepId],
  });

  if (chain.steps.every((s) => ['Approved', 'Skipped'].includes(s.status))) chain.status = 'Approved';
  return { ok: true };
}

export function returnGovernanceStep(state, chainId, stepId, userId, comments, addAudit) {
  const chain = state.approvalChains.find((c) => c.id === chainId);
  const step = chain?.steps?.find((s) => s.id === stepId);
  if (!chain || !step) return { ok: false };
  step.status = 'Returned for Changes';
  step.decision = 'Returned for Changes';
  step.completedDate = DEMO_TODAY;
  step.comments = comments;
  chain.status = 'Returned for Changes';
  if (chain.entityType === 'Impact Assessment') {
    const ia = state.assessments.find((a) => a.id === chain.entityId);
    if (ia) {
      ia.status = 'Draft';
      ia.approvalStatus = 'Returned for Changes';
      ia.reviewHistory = [...(ia.reviewHistory || []), { reviewerId: userId, date: DEMO_TODAY, comment: comments, decision: 'Return' }];
    }
  }
  addAudit({
    user: personName(state, userId),
    action: 'Returned for changes',
    recordType: chain.entityType,
    recordId: chain.entityId,
    comments,
    relatedIds: [chain.entityId],
  });
  return { ok: true };
}

export function recordCommitteeDecision(state, chainId, decision, reference, notes, userId, addAudit) {
  const chain = state.approvalChains.find((c) => c.id === chainId);
  if (!chain) return { ok: false };
  chain.committeeDecision = decision;
  chain.committeeReference = reference;
  chain.committeeNotes = notes;
  chain.committeeDecisionDate = DEMO_TODAY;
  addAudit({
    user: personName(state, userId),
    action: 'Committee review completed',
    recordType: chain.entityType,
    recordId: chain.entityId,
    newValue: decision,
    comments: notes,
    relatedIds: [chain.entityId, chain.committeeId],
  });
  return { ok: true };
}

export function reviewEvidence(state, evidenceId, outcome, userId, comments, addAudit, sodCheck) {
  const ev = state.evidence.find((e) => e.id === evidenceId);
  if (!ev) return { ok: false };
  const sod = sodCheck(state, ev, userId);
  if (sod.result === SOD.BLOCKED) return { ok: false, error: sod.message, sod };
  ev.reviewStatus = outcome === 'accept' ? 'Accepted' : 'Rejected';
  ev.approvalStatus = ev.reviewStatus;
  ev.reviewedById = userId;
  ev.reviewedAt = DEMO_TODAY;
  ev.reviewComments = comments;
  addAudit({
    user: personName(state, userId),
    action: outcome === 'accept' ? 'Evidence accepted' : 'Evidence rejected',
    recordType: 'Evidence',
    recordId: evidenceId,
    comments,
    relatedIds: [evidenceId, ev.actionId, ev.controlId].filter(Boolean),
  });
  return { ok: true, sod };
}

export function completeAttestation(state, attestationId, userId, comments, addAudit) {
  const att = state.attestations.find((a) => a.id === attestationId);
  if (!att) return { ok: false };
  if (att.entityType === 'Regulatory Change') {
    const readiness = getClosureReadiness(state, att.entityId);
    const blockers = readiness.items.filter((i) => !i.met && i.label !== 'Final implementation attestation');
    if (blockers.length) {
      return { ok: false, error: 'Cannot attest — outstanding closure requirements', blockers };
    }
  }
  att.status = 'Attested';
  att.attestedById = userId;
  att.attestedAt = DEMO_TODAY;
  att.comments = comments;
  addAudit({
    user: personName(state, userId),
    action: 'Attestation completed',
    recordType: 'Attestation',
    recordId: attestationId,
    relatedIds: [att.entityId, ...(att.supportingEvidenceIds || [])],
    comments,
  });
  return { ok: true };
}

export function closeRegulatoryChange(state, changeId, userId, comments, addAudit) {
  const readiness = getClosureReadiness(state, changeId);
  if (!readiness.ready) {
    return { ok: false, error: 'Cannot close — governance requirements outstanding', items: readiness.items.filter((i) => !i.met) };
  }
  const ch = state.changes.find((c) => c.id === changeId);
  ch.closureStatus = 'Closed';
  ch.status = 'Implemented';
  ch.closedAt = DEMO_TODAY;
  ch.closedById = userId;
  addAudit({ user: personName(state, userId), action: 'Change closed', recordType: 'Regulatory Change', recordId: changeId, comments, relatedIds: [changeId] });
  return { ok: true };
}

export function reopenRegulatoryChange(state, changeId, reason, userId, addAudit) {
  const ch = state.changes.find((c) => c.id === changeId);
  if (!ch) return { ok: false };
  ch.closureStatus = 'Open';
  ch.status = ch.status === 'Implemented' ? 'Assessment in progress' : ch.status;
  ch.reopenReason = reason;
  ch.reopenedAt = DEMO_TODAY;
  addAudit({ user: personName(state, userId), action: 'Change reopened', recordType: 'Regulatory Change', recordId: changeId, comments: reason, relatedIds: [changeId] });
  return { ok: true };
}

export function recordVersionImpactReview(state, publicationId, decision, justification, userId, addAudit) {
  const pub = state.publications.find((p) => p.id === publicationId);
  if (!pub) return { ok: false };
  pub.versionImpactReview = { decision, justification, reviewerId: userId, date: DEMO_TODAY };
  if (decision === 'Minor update — no reapproval' || decision === 'No governance impact') {
    state.changes.filter((c) => c.publicationId === publicationId).forEach((ch) => {
      ch.governanceReviewRequired = false;
    });
  }
  if (decision === 'Material update — reapproval required') {
    state.changes.filter((c) => c.publicationId === publicationId).forEach((ch) => {
      ch.governanceReviewRequired = true;
      const chain = getApprovalChain(state, 'Regulatory Change', ch.id);
      if (chain) {
        chain.status = 'In Progress';
        const horc = chain.steps.find((s) => s.roleId === 'GR-HORC');
        if (horc) {
          horc.status = 'Pending';
          horc.completedDate = null;
        }
      }
    });
  }
  addAudit({
    user: personName(state, userId),
    action: 'Version impact review recorded',
    recordType: 'Publication',
    recordId: publicationId,
    newValue: decision,
    comments: justification,
    relatedIds: [publicationId],
  });
  return { ok: true };
}

export function tryApproveAssessment(state, assessmentId, decision, comments, userId, addAudit) {
  const a = state.assessments.find((x) => x.id === assessmentId);
  if (!a) return { ok: false };
  const policy = getPolicyForEntity(state, 'Impact Assessment', a.materiality) || { makerCheckerRequired: a.makerCheckerRequired };
  const sod = checkMakerChecker(state, {
    submitterId: a.submittedById,
    approverId: userId,
    policy,
  });
  if (decision === 'approve' && sod.result === SOD.BLOCKED) {
    addAudit({
      user: personName(state, userId),
      action: 'Maker/checker block triggered',
      recordType: 'Impact Assessment',
      recordId: assessmentId,
      comments: sod.message,
      relatedIds: [assessmentId],
    });
    return { ok: false, error: sod.message, sod };
  }
  if (decision === 'approve' && !canApproveMateriality(state, userId, a.materiality)) {
    return { ok: false, error: 'Approval authority insufficient' };
  }
  return { ok: true, sod };
}
