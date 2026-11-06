import {
  getState,
  personName,
  getViewImpactAssessments,
  getViewWorkflowEvents,
  getConnectedGovernanceMetrics,
} from './store.js';
import { isConnectedBackendActive } from './platform/connected-mode.js';
import { connectedCatalogueBanner } from './platform/connected-catalogue.js';
import {
  connectedReadOnlyGovernanceBanner,
  renderConnectedWorkflowEventsTable,
  renderConnectedGovernanceMetrics,
  connectedGovernanceUnavailableNote,
  connectedRegisterEmpty,
} from './platform/connected-governance-ui.js';
import { esc, badge, pageHeader, dataTable, formatDate, entityHero, notFoundState, linkRecord } from './components.js';
import {
  getApprovalChain,
  getClosureReadiness,
  getGovernanceWarnings,
  getGovernanceStatus,
  governanceMetrics,
  getEvidenceAssuranceStatus,
  checkMakerChecker,
  getPolicyForEntity,
} from './governance-helpers.js';

export function viewGovernanceRegister() {
  const s = getState();
  if (isConnectedBackendActive(s)) {
    const impacts = getViewImpactAssessments();
    const pendingReview = impacts.filter((a) => /review|draft|pending/i.test(String(a.status)));
    const impactRows = pendingReview.map(
      (a) => `<tr>
        <td><a href="#/assessment/${esc(a.id)}">${esc(a.externalKey || a.id.slice(0, 8))}</a></td>
        <td>${esc(a.title)}</td>
        <td>${badge(a.materiality)}</td>
        <td>${badge(a.status)}</td>
        <td>${esc(a.ownerLabel || '—')}</td>
      </tr>`,
    );
    const events = getViewWorkflowEvents();
    return `${pageHeader('Governance Register', 'Tenant workflow history and pending approvals · connected')}
      ${connectedCatalogueBanner(s)}
      ${connectedReadOnlyGovernanceBanner(s)}
      ${renderConnectedGovernanceMetrics(getConnectedGovernanceMetrics())}
      <div data-connected-governance-pending-load class="ri-muted">Loading pending approvals…</div>
      <section class="ri-panel"><h2>Impact assessments — review pipeline</h2>
        ${impactRows.length ? dataTable(['ID', 'Title', 'Materiality', 'Status', 'Owner'], impactRows) : connectedRegisterEmpty('impact assessments awaiting review')}
        <p class="ri-muted">Formal approval chains and attestations in the Design Lab are demonstration-only. Production impact approval state is reflected in persisted assessment status and workflow events below.</p>
      </section>
      <section class="ri-panel"><h2>Workflow &amp; decision history</h2>
        ${renderConnectedWorkflowEventsTable(events)}
      </section>
      <section class="ri-panel"><h2>Enterprise approvals, attestations &amp; exceptions</h2>
        ${connectedGovernanceUnavailableNote(
          'Approval chains',
          'No persisted approval-chain, attestation or governance-exception entities in production RI. These screens remain available in demo mode only.',
        )}
      </section>`;
  }
  const m = governanceMetrics(s);
  const approvals = (s.approvalChains || [])
    .flatMap((c) =>
      (c.steps || [])
        .filter((st) => ['Pending', 'Not Started'].includes(st.status))
        .map((st) => ({ chain: c, step: st }))
    )
    .map(
      ({ chain, step }) => `<tr>
      <td><a href="#/approval/${esc(step.id)}">${esc(step.name)}</a></td>
      <td>${esc(chain.entityType)} ${linkRecord(chain.entityType === 'Regulatory Change' ? 'Regulatory Change' : 'Impact Assessment', chain.entityId, chain.entityId)}</td>
      <td>${esc(personName(s, step.assigneeId))}</td>
      <td>${badge(step.status)}</td>
      <td>${formatDate(step.dueDate)}</td>
    </tr>`
    );

  const attestations = (s.attestations || [])
    .filter((a) => a.status !== 'Attested')
    .map(
      (a) => `<tr><td><a href="#/attestation/${esc(a.id)}">${esc(a.id)}</a></td>
      <td>${esc(a.attestationType)}</td><td>${esc(a.entityType)} ${esc(a.entityId)}</td><td>${badge(a.status)}</td></tr>`
    );

  const exceptions = (s.governanceExceptions || []).map(
    (e) => `<tr><td><a href="#/exception/${esc(e.id)}">${esc(e.id)}</a></td><td>${esc(e.type)}</td>
    <td>${esc(e.entityId)}</td><td>${badge(e.status)}</td><td>${formatDate(e.expiryDate)}</td></tr>`
  );

  return `${pageHeader('Governance Register', 'Approvals, attestations, exceptions and escalations (mock enterprise governance)')}
    <p class="ri-metrics-inline">
      <span>Pending approvals: <strong>${m.pending}</strong></span>
      <span>Overdue steps: <strong>${m.overdue}</strong></span>
      <span>Attestations due: <strong>${m.attDue}</strong></span>
      <span>Open exceptions: <strong>${m.exceptions}</strong></span>
      <span>Expired evidence: <strong>${m.expiredEv}</strong></span>
    </p>
    <section class="ri-panel"><h2>Pending approvals</h2>${dataTable(['Step', 'Entity', 'Assignee', 'Status', 'Due'], approvals, 'No pending approvals')}</section>
    <section class="ri-panel"><h2>Attestations</h2>${dataTable(['ID', 'Type', 'Entity', 'Status'], attestations, 'No pending attestations')}</section>
    <section class="ri-panel"><h2>Exceptions &amp; waivers</h2>${dataTable(['ID', 'Type', 'Entity', 'Status', 'Expiry'], exceptions)}</section>`;
}

export function viewApprovalStep(stepId) {
  if (isConnectedBackendActive(getState())) {
    return `${pageHeader('Approval', 'Unavailable in connected mode')}
      ${connectedGovernanceUnavailableNote('Approvals', 'Approval-chain steps are Design Lab demonstration only. Use Impact Assessments and workflow events for production review state.')}
      <p><a href="#/governance">← Governance register</a></p>`;
  }
  const s = getState();
  const chain = (s.approvalChains || []).find((c) => c.steps?.some((st) => st.id === stepId));
  const step = chain?.steps?.find((st) => st.id === stepId);
  if (!step) return notFoundState('Approval step', stepId);
  const policy = s.governancePolicies?.find((p) => p.id === chain.policyId);
  return `${pageHeader('Approval', step.name)}
    <p>Entity: ${esc(chain.entityType)} <a href="#/${chain.entityType === 'Regulatory Change' ? 'change' : 'assessment'}/${esc(chain.entityId)}">${esc(chain.entityId)}</a></p>
    <p>Policy: ${esc(policy?.name || chain.policyId)}</p>
    <p>Assignee: ${esc(personName(s, step.assigneeId))} · Status: ${badge(step.status)}</p>
    ${step.comments ? `<p class="ri-muted">${esc(step.comments)}</p>` : ''}
    <div class="ri-form__actions" data-approval-chain="${esc(chain.id)}" data-approval-step="${esc(step.id)}">
      <button type="button" class="ri-btn ri-btn--primary" data-gov-approve-step>Approve step</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-gov-return-step>Return for changes</button>
    </div>
    <p><a href="#/governance">← Governance register</a></p>`;
}

export function viewAttestation(id) {
  if (isConnectedBackendActive(getState())) {
    return `${pageHeader('Attestation', 'Unavailable in connected mode')}
      ${connectedGovernanceUnavailableNote('Attestations', 'Management attestations are not persisted as tenant entities in production RI.')}
      <p><a href="#/governance">← Governance register</a></p>`;
  }
  const s = getState();
  const att = s.attestations?.find((a) => a.id === id);
  if (!att) return notFoundState('Attestation', id);
  const readiness = att.entityType === 'Regulatory Change' ? getClosureReadiness(s, att.entityId) : null;
  return `${pageHeader('Attestation', id)}
    <p class="ri-body-copy">${esc(att.statement)}</p>
    <dl class="ri-dl">
      <dt>Entity</dt><dd>${esc(att.entityType)} ${esc(att.entityId)}</dd>
      <dt>Status</dt><dd>${badge(att.status)}</dd>
      <dt>Role</dt><dd>${esc(s.governanceRoles?.find((r) => r.id === att.roleId)?.name || att.roleId)}</dd>
      <dt>Evidence</dt><dd>${(att.supportingEvidenceIds || []).map((e) => linkRecord('Evidence', e, e)).join(', ')}</dd>
    </dl>
    ${readiness && !readiness.ready ? `<div class="ri-alert">Closure blockers prevent attestation:<ul>${readiness.items.filter((i) => !i.met).map((i) => `<li>${esc(i.label)}</li>`).join('')}</ul></div>` : ''}
    ${att.status === 'Pending' ? `<button type="button" class="ri-btn ri-btn--primary" data-complete-attestation="${esc(id)}">Complete attestation</button>` : ''}
    <p><a href="#/governance">← Governance register</a></p>`;
}

export function viewException(id) {
  if (isConnectedBackendActive(getState())) {
    return `${pageHeader('Governance exception', 'Unavailable in connected mode')}
      ${connectedGovernanceUnavailableNote('Exceptions', 'Governance exceptions/waivers are Design Lab demonstration only.')}
      <p><a href="#/governance">← Governance register</a></p>`;
  }
  const s = getState();
  const ex = s.governanceExceptions?.find((e) => e.id === id);
  if (!ex) return notFoundState('Exception', id);
  return `${pageHeader('Governance exception', id)}
    <p><strong>${esc(ex.type)}</strong></p>
    <p>${esc(ex.reason)}</p>
    <dl class="ri-dl">
      <dt>Entity</dt><dd>${esc(ex.entityType)} ${linkRecord(ex.entityType === 'Action' ? 'Action' : 'Regulatory Change', ex.entityId, ex.entityId)}</dt>
      <dt>Requested by</dt><dd>${esc(personName(s, ex.requestedById))}</dt>
      <dt>Approver</dt><dd>${esc(personName(s, ex.approverId))}</dt>
      <dt>Expiry</dt><dd>${formatDate(ex.expiryDate)}</dt>
      <dt>Residual risk</dt><dd>${esc(ex.residualRisk || '—')}</dt>
      <dt>Conditions</dt><dd>${esc(ex.conditions || '—')}</dd>
    </dl>
    <p>Status: ${badge(ex.status)}</p>
    <p><a href="#/governance">← Governance register</a></p>`;
}

export function viewControlTest(id) {
  if (isConnectedBackendActive(getState())) {
    return `${pageHeader('Control test', 'Unavailable in connected mode')}
      ${connectedGovernanceUnavailableNote('Control tests', 'Separate control test records are Design Lab demonstration only. Production stores testing status on controls and results on assurance reviews when recorded.')}
      <p><a href="#/governance">← Governance register</a></p>`;
  }
  const s = getState();
  const t = s.controlTests?.find((x) => x.id === id);
  if (!t) return notFoundState('Control test', id);
  return `${pageHeader('Control test', id)}
    <p>Control: ${linkRecord('Control', t.controlId, t.controlId)}</p>
    <p>Result: ${badge(t.result)} · Period: ${esc(t.testPeriod)}</p>
    <p>Tester: ${esc(personName(s, t.testerId))} · ${formatDate(t.testDate)}</p>
    <p>${esc(t.findings)}</p>
    <p>Evidence: ${(t.evidenceIds || []).map((e) => linkRecord('Evidence', e, e)).join(', ')}</p>
    <p>Remediation: ${(t.remediationActionIds || []).map((a) => linkRecord('Action', a, a)).join(', ')}</p>
    <p><a href="#/governance">← Governance register</a></p>`;
}

export function renderChangeGovernancePanel(changeId) {
  const s = getState();
  const ch = s.changes.find((c) => c.id === changeId);
  if (!ch) return '';
  const policy = s.governancePolicies?.find((p) => p.id === ch.governancePolicyId) || getPolicyForEntity(s, 'Regulatory Change', ch.materiality);
  const chain = getApprovalChain(s, 'Regulatory Change', changeId);
  const warnings = getGovernanceWarnings(s, 'Regulatory Change', changeId);
  const closure = getClosureReadiness(s, changeId);
  const raci = ch.raci;

  const steps = (chain?.steps || [])
    .map(
      (st) => `<li>${st.sequence}. ${esc(st.name)} — ${badge(st.status)} ${st.assigneeId ? `(${esc(personName(s, st.assigneeId))})` : ''} 
      ${st.status === 'Pending' ? `<a href="#/approval/${esc(st.id)}">Review</a>` : ''}</li>`
    )
    .join('');

  const checklist = closure.items
    .map((i) => `<li>${i.met ? '✓' : '○'} ${esc(i.label)}${i.detail ? ` <span class="ri-muted">— ${esc(i.detail)}</span>` : ''}</li>`)
    .join('');

  return `<section class="ri-panel ri-governance-panel" id="governance-${esc(changeId)}">
    <h2>Governance</h2>
    <p>Materiality: ${badge(ch.materiality)} · Policy: ${esc(policy?.name || '—')} · Status: ${badge(getGovernanceStatus(s, 'Regulatory Change', changeId))}</p>
    ${raci ? `<h3>Responsibility (RACI)</h3>
      <ul class="ri-bullet-list">
        <li><strong>Responsible:</strong> ${esc(raci.responsible?.label || personName(s, raci.responsible?.personId))}</li>
        <li><strong>Accountable:</strong> ${esc(raci.accountable?.label || personName(s, raci.accountable?.personId))}</li>
        <li><strong>Consulted:</strong> ${(raci.consulted || []).map((c) => esc(c.label)).join('; ')}</li>
        <li><strong>Informed:</strong> ${(raci.informed || []).map((c) => esc(c.label)).join('; ')}</li>
      </ul>` : ''}
    <h3>Approval chain</h3><ol>${steps || '<li class="ri-muted">No approval chain</li>'}</ol>
    ${chain?.committeeReviewRequired ? `<p>Committee: ${esc(s.committees?.find((c) => c.id === chain.committeeId)?.name || 'Required')} 
      ${chain.committeeDecision ? badge(chain.committeeDecision) : badge('Pending')}
      ${!chain.committeeDecision ? `<button type="button" class="ri-btn ri-btn--sm" data-committee-approve="${esc(chain.id)}">Record committee approval</button>` : ''}
    </p>` : ''}
    ${warnings.length ? `<div class="ri-alert"><strong>Governance warnings</strong><ul>${warnings.map((w) => `<li>${esc(w.message)}</li>`).join('')}</ul></div>` : ''}
    <h3>Closure checklist</h3><ul>${checklist}</ul>
    <div class="ri-form__actions">
      <button type="button" class="ri-btn ri-btn--primary" data-close-change="${esc(changeId)}">Close Regulatory Change</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-reopen-change="${esc(changeId)}">Reopen</button>
      ${ch.governanceReviewRequired ? `<button type="button" class="ri-btn ri-btn--ghost" data-version-impact="minor">Record minor source update review</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-version-impact="material">Record material source update review</button>` : ''}
    </div>
  </section>`;
}

export function renderDashboardGovernanceSummaryConnected() {
  const s = getState();
  const m = getConnectedGovernanceMetrics();
  return `<section class="ri-panel ri-panel--compact"><h2>Governance</h2>
    ${renderConnectedGovernanceMetrics(m)}
    <p class="ri-muted">Metrics derive from tenant regulatory changes, impact assessments, findings, controls and workflow events — not Design Lab mock approvals.</p>
    <p><a href="#/governance">Open Governance Register</a></p></section>`;
}

export function renderDashboardGovernanceSummary() {
  const m = governanceMetrics(getState());
  return `<section class="ri-panel ri-panel--compact"><h2>Governance</h2>
    <p class="ri-muted">Approvals pending: ${m.pending} · Overdue: ${m.overdue} · Attestations due: ${m.attDue} · Control test failures: ${m.failedTests}</p>
    <p><a href="#/governance">Open Governance Register</a></p></section>`;
}

export function renderAssessmentGovernance(assessmentId) {
  const s = getState();
  const a = s.assessments.find((x) => x.id === assessmentId);
  if (!a) return '';
  const policy = { makerCheckerRequired: a.makerCheckerRequired };
  const demo = s.currentDemoUserId;
  const sod = checkMakerChecker(s, { submitterId: a.submittedById, approverId: demo, policy });
  return `<p class="ri-muted">Maker/checker: ${badge(sod.result)} ${esc(sod.message)}</p>`;
}
