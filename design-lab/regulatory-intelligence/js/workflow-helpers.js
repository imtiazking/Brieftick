/**
 * Derived workflow intelligence — DEMO deterministic dates and SLA rules.
 */
import { filterByScenario } from './relationships.js';
import { getEvidenceAssuranceStatus, getGovernanceWarnings } from './governance-helpers.js';
import { getHumanReviewStatus, getAIReviewRequirement, getCurrentAnalysis } from './ai-governance-helpers.js';
import {
  getAssuranceVariance,
  getBoardAttentionItems,
  getAssuranceReview,
  getAssuranceStaleness,
} from './assurance-helpers.js';
import { classifyObligationPrimaryStatus } from './ai/obligation-portfolio.js';

export const DEMO_TODAY = '2026-10-14';
export const DEMO_DUE_SOON_DAYS = 14;
export const AI_PROVENANCE = {
  engine: 'FORGENIQ Regulatory Intelligence AI — Demo',
  version: 'RI-DEMO-2.1',
  orgProfileVersion: 'ORG-DEMO-04',
};

export function parseDemoDate(iso) {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return d;
}

export function daysBetween(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  return Math.round((b - a) / 86400000);
}

/** True when event date falls on or after DEMO_TODAY and within the next windowDays (inclusive). */
export function isWithinForwardDateWindow(isoDate, windowDays) {
  if (!isoDate || !windowDays) return false;
  const days = daysBetween(DEMO_TODAY, parseDemoDate(isoDate));
  return days >= 0 && days <= Number(windowDays);
}

export function teamMemberIds(state, teamId) {
  if (!teamId) return [];
  return (state.people || []).filter((p) => p.teamId === teamId).map((p) => p.id);
}

export function isCompleteStatus(entityType, status) {
  const s = (status || '').toLowerCase();
  if (entityType === 'Action') return s === 'complete';
  if (entityType === 'Impact Assessment') return ['approved', 'implementation', 'complete'].includes(s);
  if (entityType === 'Publication') return ['complete', 'closed', 'historic', 'in implementation'].includes(s.replace(/\s/g, ' '));
  if (entityType === 'Obligation') return s === 'complete' || s === 'historic';
  return s === 'complete';
}

/** @returns {'On Track'|'Due Soon'|'Overdue'|'Escalated'|'Complete'} */
export function slaStatus(dueDate, complete, escalated = false) {
  if (complete) return 'Complete';
  if (escalated) return 'Escalated';
  if (!dueDate) return 'On Track';
  const due = parseDemoDate(dueDate);
  if (!due) return 'On Track';
  const days = daysBetween(DEMO_TODAY, due);
  if (days < 0) return 'Overdue';
  if (days <= DEMO_DUE_SOON_DAYS) return 'Due Soon';
  return 'On Track';
}

export function slaBadgeClass(status) {
  const map = {
    'On Track': 'ok',
    'Due Soon': 'warn',
    Overdue: 'danger',
    Escalated: 'danger',
    Complete: 'muted',
  };
  return map[status] || 'muted';
}

export function publicationInWorkflow(pub) {
  const accepted = pub.triageStatus === 'Accepted' || pub.intakeAccepted;
  const ws = pub.workflowStatus || '';
  return accepted || ['Impact Review', 'Assessment Required', 'In Implementation', 'Complete'].includes(ws);
}

export function isIntakeCandidate(pub) {
  if (pub.triageStatus === 'Not Relevant') return false;
  if (publicationInWorkflow(pub) && pub.triageStatus === 'Accepted') return true;
  const intakeStates = ['New', 'AI Analysed', 'Review Required', 'Assigned', 'In Review', 'Escalated'];
  return intakeStates.includes(pub.triageStatus) || pub.workflowStatus === 'New' || pub.unreviewed;
}

export function deriveEscalated(entity, entityType) {
  if (entity.escalated || entity.escalation === 'Escalated') return true;
  const due = entity.triageSlaDue || entity.dueDate || entity.slaDue;
  const complete = isCompleteStatus(entityType, entity.status || entity.triageStatus || entity.workflowStatus);
  if (entity.triageStatus === 'Escalated') return true;
  if (due && slaStatus(due, complete) === 'Overdue' && (entity.priority === 'High' || entity.materiality === 'High')) return true;
  return false;
}

export function getPerson(state, id) {
  return state.people?.find((p) => p.id === id) || state.users?.find((u) => u.id === id);
}

export function getTeam(state, id) {
  return state.teams?.find((t) => t.id === id);
}

export function personName(state, id) {
  const p = getPerson(state, id);
  return p?.name || id || '—';
}

export function currentDemoUser(state) {
  const id = state.currentDemoUserId;
  return getPerson(state, id) || state.people?.[0];
}

export function buildWorkQueue(state, scenarioId) {
  const items = [];
  const sid = scenarioId || state.scenarioId;

  const pubs = filterByScenario(state.publications, sid).filter(isIntakeCandidate);
  pubs.forEach((p) => {
    const pubTeam = p.assignedTeamId || getPerson(state, p.assignedReviewerId || p.ownerId)?.teamId;
    if (['New', 'AI Analysed', 'Review Required', 'Assigned', 'In Review', 'Escalated'].includes(p.triageStatus)) {
      items.push(workItem('Publication', p.id, p.title, p.assignedReviewerId || p.ownerId, p.priority, p.triageSlaDue || p.slaDue, p.triageStatus, p.scenario, p.regulator, 'Triage', pubTeam));
    }
    if (p.workflowStatus === 'Awaiting Review' || p.unreviewed) {
      items.push(workItem('Publication', p.id, `${p.title} — applicability`, p.assignedReviewerId, p.priority, p.applicabilityDue, 'Review Required', p.scenario, p.regulator, 'Applicability review', pubTeam));
    }
  });

  filterByScenario(state.changes, sid).forEach((c) => {
    if (c.applicabilityDecision === 'Review Required' || c.status === 'Awaiting review') {
      items.push(workItem('Regulatory Change', c.id, c.title, c.reviewerId || c.ownerId, c.materiality, c.dueDate, c.status, c.scenario, null, 'Change review', c.assignedTeamId));
    }
  });

  filterByScenario(state.assessments, sid).forEach((a) => {
    const st = a.status;
    const iaTeam = a.assignedTeamId || getPerson(state, a.ownerId)?.teamId;
    if (!['Approved', 'Implementation', 'Complete'].includes(st)) {
      items.push(workItem('Impact Assessment', a.id, a.title, a.ownerId || a.reviewerId, a.materiality, a.dueDate, st, a.scenario, null, 'Assessment', iaTeam));
    }
    if (st === 'Awaiting Approval' || st === 'Submitted for Review' || st === 'Review') {
      items.push(workItem('Impact Assessment', a.id, `${a.title} — approval`, a.approverId || a.reviewerId, a.materiality, a.dueDate, st, a.scenario, null, 'Approval', iaTeam));
    }
  });

  filterByScenario(state.obligations, sid).forEach((o) => {
    if (classifyObligationPrimaryStatus(o.status) !== 'CLOSED' && classifyObligationPrimaryStatus(o.status) !== 'DRAFT' && o.coverage !== 'Full') {
      items.push(workItem('Obligation', o.id, o.statement, o.ownerId || o.owner, o.priority, o.reviewDate || o.effectiveDate, o.status, o.scenario, null, 'Obligation review', getPerson(state, o.ownerId)?.teamId));
    }
  });

  filterByScenario(state.actions, sid).forEach((a) => {
    if (a.status !== 'Complete') {
      items.push(workItem('Action', a.id, a.description, a.ownerId || a.owner, a.priority, a.dueDate, a.status, a.scenario, null, 'Implementation', a.assignedTeamId || getPerson(state, a.ownerId)?.teamId));
    }
  });

  filterByScenario(state.evidence, sid).forEach((e) => {
    if (e.reviewDate && e.approvalStatus !== 'Approved') {
      items.push(workItem('Evidence', e.id, e.fileName, e.ownerId, 'Medium', e.reviewDate, 'Review Required', e.scenario, null, 'Evidence review', getPerson(state, e.ownerId)?.teamId));
    }
  });

  (state.changeCandidates || [])
    .filter((c) => ['Proposed', 'Review Required'].includes(c.status))
    .forEach((c) => {
      const pub = state.publications.find((p) => p.id === c.publicationId);
      if (pub && (sid === 'all' || pub.scenario === sid || !c.publicationId)) {
        items.push(
          workItem(
            'Change Candidate',
            c.id,
            c.proposedTitle,
            'u-smith',
            c.materialityRecommendation,
            DEMO_TODAY,
            c.status,
            pub?.scenario || 'all',
            null,
            'Candidate review',
            'team-rc'
          )
        );
      }
    });

  filterByScenario(state.publications, sid)
    .filter((p) => p.reanalysisRequired)
    .forEach((p) => {
      items.push(
        workItem('Publication', p.id, `${p.title} — re-analysis`, p.ownerId || p.assignedReviewerId, p.priority, p.triageSlaDue, 'Re-analysis Required', p.scenario, p.regulator, 'Source update review', getPerson(state, p.ownerId)?.teamId)
      );
    });

  (state.aiAnalyses || []).forEach((a) => {
    const ent = a.entityType === 'Regulatory Change' ? state.changes.find((c) => c.id === a.entityId) : null;
    if (ent && sid !== 'all' && ent.scenario !== sid) return;
    const st = getHumanReviewStatus(state, a);
    if (st !== 'Review Required') return;
    const owner = ent?.reviewerId || ent?.ownerId || 'u-reed';
    const label =
      a.groundingStatus === 'Source Conflict'
        ? 'Source conflict review'
        : a.groundingStatus === 'Insufficient Source Evidence'
          ? 'Unsupported claim review'
          : (a.confidence ?? 100) < 70
            ? 'Low confidence AI review'
            : 'AI review required';
    items.push(
      workItem('AI Analysis', a.id, `${a.entityId} — ${label}`, owner, ent?.materiality || 'Medium', a.generatedAt?.slice(0, 10), 'Review Required', ent?.scenario, null, label, 'team-compliance')
    );
  });

  (state.approvalChains || []).forEach((chain) => {
    const ent = chain.entityType === 'Regulatory Change' ? state.changes.find((c) => c.id === chain.entityId) : state.assessments.find((a) => a.id === chain.entityId);
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
            getPerson(state, st.assigneeId)?.teamId
          )
        );
      });
  });

  (state.attestations || [])
    .filter((a) => a.status === 'Pending')
    .forEach((a) => {
      items.push(workItem('Attestation', a.id, a.statement.slice(0, 60), a.attestedById || 'u-smith', 'High', a.expiryDate, 'Pending', 'consumer-duty', null, 'Attestation required', 'team-rc'));
    });

  (state.governanceExceptions || [])
    .filter((e) => e.status === 'Requested')
    .forEach((e) => {
      items.push(workItem('Governance Exception', e.id, e.type, e.approverId, 'High', e.expiryDate, e.status, 'all', null, 'Exception approval', 'team-compliance'));
    });

  (state.evidence || [])
    .filter((e) => getEvidenceAssuranceStatus(e) === 'Expired' || getEvidenceAssuranceStatus(e) === 'Review Due')
    .forEach((e) => {
      if (sid !== 'all' && e.scenario !== sid) return;
      items.push(workItem('Evidence', e.id, `${e.fileName} — review`, e.reviewerId || 'u-grant', 'Medium', e.reviewDueDate, 'Review Required', e.scenario, null, 'Evidence review', 'team-risk'));
    });

  (state.assuranceReviews || [])
    .filter((r) => ['Planned', 'In Progress', 'Awaiting Evidence', 'Under Review'].includes(r.reviewStatus))
    .forEach((r) => {
      const ch = r.changeId ? state.changes.find((c) => c.id === r.changeId) : state.changes.find((c) => c.id === r.entityId);
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
          r.reviewerTeamId
        )
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
          getPerson(state, f.ownerId)?.teamId
        )
      );
    });

  (state.assuranceFindings || [])
    .filter((f) => f.status === 'Awaiting Validation')
    .forEach((f) => {
      const review = getAssuranceReview(state, f.assuranceReviewId);
      items.push(
        workItem(
          'Finding Validation',
          f.id,
          `Validate: ${f.title}`,
          review?.reviewerId || 'u-grant',
          'Medium',
          f.dueDate,
          'Validation required',
          'all',
          null,
          'Validation',
          review?.reviewerTeamId || 'team-risk'
        )
      );
    });

  (state.managementAttestations || [])
    .filter((a) => a.status === 'Due' || a.status === 'Overdue')
    .forEach((a) => {
      items.push(
        workItem(
          'Management Attestation',
          a.id,
          a.scope.slice(0, 50),
          a.attestorId,
          'High',
          a.dueDate,
          a.status,
          'all',
          null,
          'Management attestation due',
          getPerson(state, a.attestorId)?.teamId
        )
      );
    });

  (state.boardPacks || [])
    .filter((p) => p.status === 'Ready for Review')
    .forEach((p) => {
      items.push(
        workItem(
          'Board Pack Review',
          p.id,
          p.title,
          'u-smith',
          'High',
          null,
          'Ready for Review',
          'all',
          null,
          'Board Pack Review',
          'team-rc'
        )
      );
    });

  return items.map((item) => enrichWorkItem(item, state));
}

function workItem(entityType, id, title, ownerId, priority, dueDate, status, scenario, regulator, category, assignedTeamId) {
  return { entityType, id, title, ownerId, priority, dueDate, status, scenario, regulator, category, assignedTeamId };
}

function enrichWorkItem(item, state) {
  const complete = isCompleteStatus(item.entityType, item.status);
  const escalated = item.status === 'Escalated';
  const sla = slaStatus(item.dueDate, complete, escalated);
  const days = item.dueDate ? daysBetween(DEMO_TODAY, parseDemoDate(item.dueDate)) : null;
  const ownerTeam = getPerson(state, item.ownerId)?.teamId;
  return {
    ...item,
    assignedTeamId: item.assignedTeamId || ownerTeam || null,
    slaStatus: sla,
    daysRemaining: days,
    overdue: sla === 'Overdue',
  };
}

export function buildNotifications(state, scenarioId) {
  const sid = scenarioId || state.scenarioId;
  const read = new Set(state.notificationReadIds || []);
  const notes = [];

  filterByScenario(state.publications, sid).forEach((p) => {
    if (p.triageStatus === 'New' && p.priority === 'High') {
      notes.push(note('intake', 'High', 'Publication', p.id, p.detectedAt, `New high-priority publication detected: ${p.title}`, `#/intake/${p.id}`));
    }
    const sla = slaStatus(p.triageSlaDue, p.triageStatus === 'Accepted');
    if (sla === 'Due Soon' && isIntakeCandidate(p)) {
      notes.push(note('sla', 'Medium', 'Publication', p.id, p.triageSlaDue, `Triage SLA approaching for ${p.reference}`, `#/intake/${p.id}`));
    }
    if (p.workflowStatus === 'Awaiting Review' && slaStatus(p.applicabilityDue, false) === 'Overdue') {
      notes.push(note('applicability', 'High', 'Publication', p.id, p.applicabilityDue, `Applicability review overdue: ${p.id}`, `#/publication/${p.id}/applicability`));
    }
    if (p.effectiveDate) {
      const d = daysBetween(DEMO_TODAY, p.effectiveDate);
      if (d >= 0 && d <= 30) {
        notes.push(note('effective', 'Medium', 'Publication', p.id, p.effectiveDate, `Effective date approaching (${p.effectiveDate})`, `#/publication/${p.id}`));
      }
    }
  });

  filterByScenario(state.assessments, sid).forEach((a) => {
    if (['Awaiting Approval', 'Submitted for Review', 'Review'].includes(a.status)) {
      notes.push(note('approval', 'Medium', 'Impact Assessment', a.id, a.dueDate, `IA awaiting approval: ${a.id}`, `#/assessment/${a.id}`));
    }
    if (slaStatus(a.dueDate, false) === 'Overdue' && !['Approved', 'Implementation', 'Complete'].includes(a.status)) {
      notes.push(note('assessment', 'High', 'Impact Assessment', a.id, a.dueDate, `Impact assessment overdue: ${a.id}`, `#/assessment/${a.id}`));
    }
  });

  filterByScenario(state.actions, sid).forEach((a) => {
    if (a.status === 'Overdue' || slaStatus(a.dueDate, a.status === 'Complete') === 'Overdue') {
      notes.push(note('action', 'High', 'Action', a.id, a.dueDate, `Action overdue: ${a.description}`, `#/action/${a.id}`));
    }
  });

  filterByScenario(state.publications, sid)
    .filter((p) => p.reanalysisRequired)
    .forEach((p) => {
      notes.push(note('reanalysis', 'High', 'Publication', p.id, DEMO_TODAY, `Source document updated — re-analysis required: ${p.reference}`, `#/publication/${p.id}`));
    });

  (state.ingestionExceptions || [])
    .filter((e) => e.severity === 'High')
    .forEach((e) => {
      const linkedPub = state.rawSourceItems?.find((r) => r.id === e.rawSourceItemId)?.linkedPublicationId || 'PUB-004';
      notes.push(note('ingestion', 'High', 'Publication', linkedPub, e.timestamp, `Connector ingestion issue: ${e.message}`, `#/ingestion/item/${e.rawSourceItemId}`));
    });

  (state.changeCandidates || [])
    .filter((c) => c.status === 'Review Required')
    .forEach((c) => {
      notes.push(note('candidate', 'Medium', 'Publication', c.publicationId || 'PUB-019', DEMO_TODAY, `Candidate Regulatory Change awaiting review: ${c.proposedTitle}`, `#/ingestion/candidate/${c.id}`));
    });

  (state.evidence || []).forEach((e) => {
    if (getEvidenceAssuranceStatus(e) === 'Expired') {
      notes.push(note('evidence', 'High', 'Evidence', e.id, e.expiryDate, `Evidence expired: ${e.fileName}`, `#/evidence/${e.id}`));
    }
  });

  (state.attestations || [])
    .filter((a) => a.status === 'Pending')
    .forEach((a) => {
      notes.push(note('attestation', 'Medium', 'Regulatory Change', a.entityId, DEMO_TODAY, `Attestation required: ${a.id}`, `#/attestation/${a.id}`));
    });

  (state.governanceExceptions || [])
    .filter((e) => e.expiryDate && daysBetween(DEMO_TODAY, e.expiryDate) <= 7 && e.status === 'Approved')
    .forEach((e) => {
      notes.push(note('exception', 'High', 'Action', e.entityId, e.expiryDate, `Exception expiring: ${e.id}`, `#/exception/${e.id}`));
    });

  (state.controlTests || [])
    .filter((t) => t.result === 'Fail')
    .forEach((t) => {
      notes.push(note('control', 'High', 'Control', t.controlId, t.testDate, `Control test failed: ${t.id}`, `#/control-test/${t.id}`));
    });

  (state.aiAnalyses || []).forEach((a) => {
    const req = getAIReviewRequirement(state, a);
    if (req.required && getHumanReviewStatus(state, a) === 'Review Required') {
      const ch = a.entityType === 'Regulatory Change' ? state.changes.find((c) => c.id === a.entityId) : null;
      if (ch && sid !== 'all' && ch.scenario !== sid) return;
      notes.push(note('ai', 'Medium', 'AI Analysis', a.id, DEMO_TODAY, `AI review required: ${a.id}`, `#/ai-analysis/${a.id}`));
    }
    if (a.reanalysisStatus === 'Re-analysis Recommended') {
      notes.push(note('ai', 'High', 'AI Analysis', a.id, DEMO_TODAY, `Model update — re-analysis recommended: ${a.id}`, `#/ai-analysis/${a.id}`));
    }
    if (a.groundingStatus === 'Source Conflict' && !a.conflictResolution) {
      notes.push(note('ai', 'High', 'AI Analysis', a.id, DEMO_TODAY, `Source conflict requires review: ${a.id}`, `#/ai-analysis/${a.id}`));
    }
  });

  filterByScenario(state.changes, sid).forEach((ch) => {
    getGovernanceWarnings(state, 'Regulatory Change', ch.id)
      .filter((w) => w.severity === 'High')
      .forEach((w) => {
        notes.push(note('governance', 'High', 'Regulatory Change', ch.id, DEMO_TODAY, w.message, `#/change/${ch.id}#governance-${ch.id}`));
      });
  });

  getBoardAttentionItems(state, sid).forEach((item) => {
    notes.push(note('assurance', item.severity, 'Regulatory Change', item.changeId || 'CHG-001', DEMO_TODAY, item.title, item.href));
  });

  (state.assuranceFindings || [])
    .filter((f) => ['High', 'Critical'].includes(f.severity) && f.status !== 'Closed' && f.dueDate && daysBetween(DEMO_TODAY, f.dueDate) < 0)
    .forEach((f) => {
      notes.push(note('assurance', 'High', 'Assurance Finding', f.id, f.dueDate, `Finding remediation overdue: ${f.title}`, `#/finding/${f.id}`));
    });

  (state.assuranceReviews || [])
    .filter((r) => r.nextReviewDate && daysBetween(DEMO_TODAY, r.nextReviewDate) < 0 && r.reviewStatus === 'Complete')
    .forEach((r) => {
      const st = getAssuranceStaleness(state, r);
      if (st.status === 'Stale' || st.status === 'Review Due') {
        notes.push(note('assurance', 'Medium', 'Assurance Review', r.id, r.nextReviewDate, `Assurance review overdue/stale: ${r.id}`, `#/assurance/${r.id}`));
      }
    });

  (state.assurancePacks || [])
    .filter((p) => p.packStatus === 'Incomplete')
    .forEach((p) => {
      const ch = state.changes.find((c) => c.id === p.changeId);
      if (sid !== 'all' && ch && ch.scenario !== sid) return;
      notes.push(note('assurance', 'Medium', 'Regulatory Change', p.changeId, DEMO_TODAY, `Evidence pack incomplete: ${p.id}`, `#/assurance-pack/${p.id}`));
    });

  filterByScenario(state.changes, sid)
    .filter((c) => c.materiality === 'High')
    .forEach((c) => {
      const v = getAssuranceVariance(state, c.id);
      if (v.variance === 'Material Variance') {
        notes.push(note('assurance', 'High', 'Regulatory Change', c.id, DEMO_TODAY, v.detail, `#/change/${c.id}#assurance-${c.id}`));
      }
    });

  return notes
    .map((n) => {
      const id = `NTF-${n.entityType}-${n.entityId}-${n.type}`;
      return { ...n, id, read: read.has(id) };
    })
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

function note(type, severity, entityType, entityId, at, message, href) {
  return { type, severity, entityType, entityId, at: at || DEMO_TODAY, message, href };
}

export function pipelineCounts(state, scenarioId) {
  const pubs = filterByScenario(state.publications, scenarioId || state.scenarioId);
  return {
    new: pubs.filter((p) => p.triageStatus === 'New' || p.workflowStatus === 'New').length,
    inTriage: pubs.filter((p) => ['AI Analysed', 'Review Required', 'Assigned', 'In Review'].includes(p.triageStatus)).length,
    applicability: pubs.filter((p) => p.workflowStatus === 'Awaiting Review' || p.workflowStatus === 'Assessment Required').length,
    impact: filterByScenario(state.assessments, scenarioId).filter((a) => !['Approved', 'Implementation', 'Complete'].includes(a.status)).length,
    implementation: filterByScenario(state.actions, scenarioId).filter((a) => a.status !== 'Complete').length,
    complete: pubs.filter((p) => ['Complete', 'Historic', 'Closed'].includes(p.workflowStatus)).length,
  };
}
