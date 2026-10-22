/**
 * Work queue golden-master parity — production contract derived from lab state (no lab runtime in app).
 */
import { GOLDEN_MASTER_TODAY, daysBetween } from './date-window.mjs';
import { classifyObligationPrimaryStatus } from './obligation-portfolio.mjs';
import { isCompleteStatus, slaStatus } from './sla-parity.mjs';
import { getEvidenceAssuranceStatus } from './governance-parity.mjs';

/** Excluded from non-AI production (Phase 7C.5). */
export const QUEUE_EXCLUDED_NON_AI = new Set(['AI Analysis', 'Board Pack Review']);

/** Committee / attestation registers not modelled in production schema yet. */
export const QUEUE_DEFERRED_PRODUCTION = new Set([
  'Attestation',
  'Governance Exception',
  'Management Attestation',
  'Finding Validation',
  'Change Candidate',
]);

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

function getPerson(state, id) {
  return state.people?.find((p) => p.id === id) || state.users?.find((u) => u.id === id);
}

function teamMemberIds(state, teamId) {
  if (!teamId) return [];
  return (state.people || []).filter((p) => p.teamId === teamId).map((p) => p.id);
}

function publicationInWorkflow(pub) {
  const accepted = pub.triageStatus === 'Accepted' || pub.intakeAccepted;
  const ws = pub.workflowStatus || '';
  return accepted || ['Impact Review', 'Assessment Required', 'In Implementation', 'Complete'].includes(ws);
}

function isIntakeCandidate(pub) {
  if (pub.triageStatus === 'Not Relevant') return false;
  if (publicationInWorkflow(pub) && pub.triageStatus === 'Accepted') return true;
  const intakeStates = ['New', 'AI Analysed', 'Review Required', 'Assigned', 'In Review', 'Escalated'];
  return intakeStates.includes(pub.triageStatus) || pub.workflowStatus === 'New' || pub.unreviewed;
}

function workItem(entityType, id, title, ownerId, priority, dueDate, status, scenario, regulator, category, assignedTeamId) {
  return { entityType, id, title, ownerId, priority, dueDate, status, scenario, regulator, category, assignedTeamId };
}

function enrichWorkItem(item, state) {
  const complete = isCompleteStatus(item.entityType, item.status);
  const escalated = item.status === 'Escalated';
  const sla = slaStatus(item.dueDate, complete, escalated);
  const days = item.dueDate ? daysBetween(GOLDEN_MASTER_TODAY, String(item.dueDate).slice(0, 10)) : null;
  const ownerTeam = getPerson(state, item.ownerId)?.teamId;
  return {
    ...item,
    assignedTeamId: item.assignedTeamId || ownerTeam || null,
    slaStatus: sla,
    daysRemaining: days,
    overdue: sla === 'Overdue',
  };
}

function getAssuranceReview(state, id) {
  return (state.assuranceReviews || []).find((r) => r.id === id);
}

/**
 * Production work-queue derivation from golden-master lab-shaped state.
 * Mirrors Design Lab `buildWorkQueue` for in-scope entity types.
 */
export function buildProductionWorkQueueFromLabState(state) {
  const items = [];
  const sid = state.scenarioId || 'all';

  const pubs = filterByScenario(state.publications, sid).filter(isIntakeCandidate);
  pubs.forEach((p) => {
    const pubTeam = p.assignedTeamId || getPerson(state, p.assignedReviewerId || p.ownerId)?.teamId;
    if (['New', 'AI Analysed', 'Review Required', 'Assigned', 'In Review', 'Escalated'].includes(p.triageStatus)) {
      items.push(
        workItem(
          'Publication',
          p.id,
          p.title,
          p.assignedReviewerId || p.ownerId,
          p.priority,
          p.triageSlaDue || p.slaDue,
          p.triageStatus,
          p.scenario,
          p.regulator,
          'Triage',
          pubTeam,
        ),
      );
    }
    if (p.workflowStatus === 'Awaiting Review' || p.unreviewed) {
      items.push(
        workItem(
          'Publication',
          p.id,
          `${p.title} — applicability`,
          p.assignedReviewerId,
          p.priority,
          p.applicabilityDue,
          'Review Required',
          p.scenario,
          p.regulator,
          'Applicability review',
          pubTeam,
        ),
      );
    }
  });

  filterByScenario(state.changes, sid).forEach((c) => {
    if (c.applicabilityDecision === 'Review Required' || c.status === 'Awaiting review') {
      items.push(
        workItem(
          'Regulatory Change',
          c.id,
          c.title,
          c.reviewerId || c.ownerId,
          c.materiality,
          c.dueDate,
          c.status,
          c.scenario,
          null,
          'Change review',
          c.assignedTeamId,
        ),
      );
    }
  });

  filterByScenario(state.assessments, sid).forEach((a) => {
    const st = a.status;
    const iaTeam = a.assignedTeamId || getPerson(state, a.ownerId)?.teamId;
    if (!['Approved', 'Implementation', 'Complete'].includes(st)) {
      items.push(
        workItem(
          'Impact Assessment',
          a.id,
          a.title,
          a.ownerId || a.reviewerId,
          a.materiality,
          a.dueDate,
          st,
          a.scenario,
          null,
          'Assessment',
          iaTeam,
        ),
      );
    }
    if (st === 'Awaiting Approval' || st === 'Submitted for Review' || st === 'Review') {
      items.push(
        workItem(
          'Impact Assessment',
          a.id,
          `${a.title} — approval`,
          a.approverId || a.reviewerId,
          a.materiality,
          a.dueDate,
          st,
          a.scenario,
          null,
          'Approval',
          iaTeam,
        ),
      );
    }
  });

  filterByScenario(state.obligations, sid).forEach((o) => {
    if (
      classifyObligationPrimaryStatus(o.status) !== 'CLOSED' &&
      classifyObligationPrimaryStatus(o.status) !== 'DRAFT' &&
      o.coverage !== 'Full'
    ) {
      items.push(
        workItem(
          'Obligation',
          o.id,
          o.statement,
          o.ownerId || o.owner,
          o.priority,
          o.reviewDate || o.effectiveDate,
          o.status,
          o.scenario,
          null,
          'Obligation review',
          getPerson(state, o.ownerId)?.teamId,
        ),
      );
    }
  });

  filterByScenario(state.actions, sid).forEach((a) => {
    if (a.status !== 'Complete') {
      items.push(
        workItem(
          'Action',
          a.id,
          a.description,
          a.ownerId || a.owner,
          a.priority,
          a.dueDate,
          a.status,
          a.scenario,
          null,
          'Implementation',
          a.assignedTeamId || getPerson(state, a.ownerId)?.teamId,
        ),
      );
    }
  });

  filterByScenario(state.evidence, sid).forEach((e) => {
    if (e.reviewDate && e.approvalStatus !== 'Approved') {
      items.push(
        workItem(
          'Evidence',
          e.id,
          e.fileName,
          e.ownerId,
          'Medium',
          e.reviewDate,
          'Review Required',
          e.scenario,
          null,
          'Evidence review',
          getPerson(state, e.ownerId)?.teamId,
        ),
      );
    }
  });

  (state.approvalChains || []).forEach((chain) => {
    const ent =
      chain.entityType === 'Regulatory Change'
        ? state.changes.find((c) => c.id === chain.entityId)
        : state.assessments.find((a) => a.id === chain.entityId);
    if (ent && sid !== 'all' && ent.scenario !== sid) return;
    (chain.steps || [])
      .filter((st) => st.status === 'Pending')
      .forEach((st) => {
        items.push(
          workItem(
            'Governance Approval',
            st.id,
            `${chain.entityId} — ${st.name}`,
            st.assigneeId,
            ent?.materiality || 'Medium',
            st.dueDate,
            'Pending',
            ent?.scenario,
            null,
            'Approval required',
            getPerson(state, st.assigneeId)?.teamId,
          ),
        );
      });
  });

  (state.evidence || [])
    .filter((e) => getEvidenceAssuranceStatus(e) === 'Expired' || getEvidenceAssuranceStatus(e) === 'Review Due')
    .forEach((e) => {
      if (sid !== 'all' && e.scenario !== sid) return;
      items.push(
        workItem(
          'Evidence',
          e.id,
          `${e.fileName} — review`,
          e.reviewerId || 'u-grant',
          'Medium',
          e.reviewDueDate,
          'Review Required',
          e.scenario,
          null,
          'Evidence review',
          'team-risk',
        ),
      );
    });

  (state.assuranceReviews || [])
    .filter((r) => ['Planned', 'In Progress', 'Awaiting Evidence', 'Under Review'].includes(r.reviewStatus))
    .forEach((r) => {
      const ch = r.changeId
        ? state.changes.find((c) => c.id === r.changeId)
        : state.changes.find((c) => c.id === r.entityId);
      if (sid !== 'all' && ch && ch.scenario !== sid) return;
      items.push(
        workItem(
          'Assurance Review',
          r.id,
          `${r.assuranceType} — ${r.entityId}`,
          r.reviewerId,
          ch?.materiality || 'Medium',
          r.nextReviewDate,
          r.reviewStatus,
          ch?.scenario || 'all',
          null,
          'Assurance',
          r.reviewerTeamId,
        ),
      );
    });

  (state.assuranceFindings || [])
    .filter((f) => f.status === 'Remediation In Progress' || f.status === 'Open')
    .forEach((f) => {
      const ch = f.changeId ? state.changes.find((c) => c.id === f.changeId) : null;
      if (sid !== 'all' && ch && ch.scenario !== sid) return;
      items.push(
        workItem(
          'Assurance Finding',
          f.id,
          f.title,
          f.ownerId,
          f.severity === 'Critical' || f.severity === 'High' ? 'High' : 'Medium',
          f.dueDate,
          f.status,
          ch?.scenario || 'consumer-duty',
          null,
          'Finding remediation',
          getPerson(state, f.ownerId)?.teamId,
        ),
      );
    });

  filterByScenario(state.publications, sid)
    .filter((p) => p.reanalysisRequired)
    .forEach((p) => {
      items.push(
        workItem(
          'Publication',
          p.id,
          `${p.title} — re-analysis`,
          p.ownerId || p.assignedReviewerId,
          p.priority,
          p.triageSlaDue,
          'Re-analysis Required',
          p.scenario,
          p.regulator,
          'Source update review',
          getPerson(state, p.ownerId)?.teamId,
        ),
      );
    });

  return items
    .map((item) => enrichWorkItem(item, state))
    .filter(
      (w) => !QUEUE_EXCLUDED_NON_AI.has(w.entityType) && !QUEUE_DEFERRED_PRODUCTION.has(w.entityType),
    );
}

export function workQueueFingerprint(w) {
  return `${w.entityType}|${w.id}|${w.ownerId || ''}|${w.priority || ''}|${w.dueDate || ''}|${w.status}|${w.overdue ? 1 : 0}|${w.slaStatus}|${w.category || ''}`;
}

export function filterLabWorkQueueForParity(labItems) {
  return (labItems || []).filter(
    (w) => !QUEUE_EXCLUDED_NON_AI.has(w.entityType) && !QUEUE_DEFERRED_PRODUCTION.has(w.entityType),
  );
}

export function compareWorkQueueParity(state, labItems) {
  const lab = filterLabWorkQueueForParity(labItems)
    .map(workQueueFingerprint)
    .sort();
  const prod = buildProductionWorkQueueFromLabState(state).map(workQueueFingerprint).sort();
  const match = lab.length === prod.length && lab.every((r, i) => r === prod[i]);
  return { match, labCount: lab.length, prodCount: prod.length };
}

export function filterMyWork(items, ownerId) {
  return items.filter((w) => w.ownerId === ownerId);
}

export function filterMyTeam(items, state, ownerId) {
  const teamId = getPerson(state, ownerId)?.teamId;
  const teammates = new Set(teamMemberIds(state, teamId));
  return items.filter((w) => w.ownerId && teammates.has(w.ownerId));
}

export function compareMyWorkParity(state, labItems, demoUserId) {
  const lab = filterMyWork(filterLabWorkQueueForParity(labItems), demoUserId)
    .map(workQueueFingerprint)
    .sort();
  const prod = filterMyWork(buildProductionWorkQueueFromLabState(state), demoUserId)
    .map(workQueueFingerprint)
    .sort();
  return { match: lab.length === prod.length && lab.every((r, i) => r === prod[i]), labCount: lab.length, prodCount: prod.length };
}

export function compareMyTeamParity(state, labItems, demoUserId) {
  const lab = filterMyTeam(filterLabWorkQueueForParity(labItems), state, demoUserId)
    .map(workQueueFingerprint)
    .sort();
  const prod = filterMyTeam(buildProductionWorkQueueFromLabState(state), state, demoUserId)
    .map(workQueueFingerprint)
    .sort();
  return { match: lab.length === prod.length && lab.every((r, i) => r === prod[i]), labCount: lab.length, prodCount: prod.length };
}
