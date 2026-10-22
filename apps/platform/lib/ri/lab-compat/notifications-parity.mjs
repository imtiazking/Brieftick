/**
 * In-app notification parity (non-AI subset) — derived from Design Lab rules.
 */
import { GOLDEN_MASTER_TODAY, daysBetween } from './date-window.mjs';
import { slaStatus } from './sla-parity.mjs';
import { getEvidenceAssuranceStatus } from './governance-parity.mjs';

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

function isIntakeCandidate(pub) {
  if (pub.triageStatus === 'Not Relevant') return false;
  const intakeStates = ['New', 'AI Analysed', 'Review Required', 'Assigned', 'In Review', 'Escalated'];
  return intakeStates.includes(pub.triageStatus) || pub.workflowStatus === 'New' || pub.unreviewed;
}

function note(type, severity, entityType, entityId, at, message) {
  return { type, severity, entityType, entityId, at: at || GOLDEN_MASTER_TODAY, message };
}

/** Production-equivalent notification derivation (no AI review / re-analysis AI notes). */
export function buildProductionNotificationsFromLabState(state) {
  const sid = state.scenarioId || 'all';
  const notes = [];

  filterByScenario(state.publications, sid).forEach((p) => {
    if (p.triageStatus === 'New' && p.priority === 'High') {
      notes.push(
        note('intake', 'High', 'Publication', p.id, p.detectedAt, `New high-priority publication detected: ${p.title}`),
      );
    }
    const sla = slaStatus(p.triageSlaDue, p.triageStatus === 'Accepted');
    if (sla === 'Due Soon' && isIntakeCandidate(p)) {
      notes.push(
        note('sla', 'Medium', 'Publication', p.id, p.triageSlaDue, `Triage SLA approaching for ${p.reference}`),
      );
    }
    if (p.workflowStatus === 'Awaiting Review' && slaStatus(p.applicabilityDue, false) === 'Overdue') {
      notes.push(
        note(
          'applicability',
          'High',
          'Publication',
          p.id,
          p.applicabilityDue,
          `Applicability review overdue: ${p.id}`,
        ),
      );
    }
    if (p.effectiveDate) {
      const d = daysBetween(GOLDEN_MASTER_TODAY, p.effectiveDate);
      if (d >= 0 && d <= 30) {
        notes.push(
          note(
            'effective',
            'Medium',
            'Publication',
            p.id,
            p.effectiveDate,
            `Effective date approaching (${p.effectiveDate})`,
          ),
        );
      }
    }
  });

  filterByScenario(state.assessments, sid).forEach((a) => {
    if (['Awaiting Approval', 'Submitted for Review', 'Review'].includes(a.status)) {
      notes.push(
        note('approval', 'Medium', 'Impact Assessment', a.id, a.dueDate, `IA awaiting approval: ${a.id}`),
      );
    }
    if (slaStatus(a.dueDate, false) === 'Overdue' && !['Approved', 'Implementation', 'Complete'].includes(a.status)) {
      notes.push(
        note('assessment', 'High', 'Impact Assessment', a.id, a.dueDate, `Impact assessment overdue: ${a.id}`),
      );
    }
  });

  filterByScenario(state.actions, sid).forEach((a) => {
    if (a.status === 'Overdue' || slaStatus(a.dueDate, a.status === 'Complete') === 'Overdue') {
      notes.push(note('action', 'High', 'Action', a.id, a.dueDate, `Action overdue: ${a.description}`));
    }
  });

  filterByScenario(state.publications, sid)
    .filter((p) => p.reanalysisRequired)
    .forEach((p) => {
      notes.push(
        note(
          'reanalysis',
          'High',
          'Publication',
          p.id,
          GOLDEN_MASTER_TODAY,
          `Source document updated — re-analysis required: ${p.reference}`,
        ),
      );
    });

  (state.evidence || []).forEach((e) => {
    if (getEvidenceAssuranceStatus(e) === 'Expired') {
      notes.push(note('evidence', 'High', 'Evidence', e.id, e.expiryDate, `Evidence expired: ${e.fileName}`));
    }
  });

  (state.assuranceFindings || [])
    .filter((f) => ['High', 'Critical'].includes(f.severity) && f.status !== 'Closed' && f.dueDate && daysBetween(GOLDEN_MASTER_TODAY, f.dueDate) < 0)
    .forEach((f) => {
      notes.push(
        note('assurance', 'High', 'Assurance Finding', f.id, f.dueDate, `Finding remediation overdue: ${f.title}`),
      );
    });

  return notes
    .map((n) => ({
      ...n,
      id: `NTF-${n.entityType}-${n.entityId}-${n.type}`,
    }))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

export function notificationFingerprint(n) {
  return `${n.type}|${n.entityType}|${n.entityId}|${n.severity}|${n.at}|${n.message}`;
}

/** Filter lab notifications to production-equivalent (exclude AI / ingestion demo noise optional). */
export function filterLabNotificationsForParity(labNotes) {
  /** Production in-app events in Phase 7 — no AI, board-pack assurance narratives, or ingestion demo noise. */
  const skipTypes = new Set([
    'ai',
    'candidate',
    'ingestion',
    'control',
    'attestation',
    'exception',
    'governance',
    'assurance',
  ]);
  return (labNotes || []).filter((n) => !skipTypes.has(n.type));
}

export function compareNotificationsParity(state, labNotes) {
  const lab = filterLabNotificationsForParity(labNotes).map(notificationFingerprint).sort();
  const prod = buildProductionNotificationsFromLabState(state).map(notificationFingerprint).sort();
  const match = lab.length === prod.length && lab.every((r, i) => r === prod[i]);
  return { match, labCount: lab.length, prodCount: prod.length };
}
