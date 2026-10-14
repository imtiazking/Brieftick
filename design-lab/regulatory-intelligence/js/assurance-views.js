import {
  getState,
  getChange,
  getObligation,
  getControl,
  getEvidence,
  getPublication,
  personName,
  scenarioFilter,
} from './store.js';
import { collectRelatedForChange, getAuditEventsFor } from './relationships.js';
import {
  esc,
  badge,
  dataTable,
  formatDate,
  linkRecord,
  pageHeader,
  notFoundState,
  recordLane,
  executiveSummary,
  sectionHeader,
  intelligenceLabel,
} from './components.js';
import {
  assuranceMetrics,
  filterAssuranceReviews,
  getAssuranceReview,
  getAssuranceOpinion,
  getIndependenceStatus,
  getAssuranceMethodology,
  getAssuranceStatusForChange,
  getObligationCoverage,
  getEvidenceCoverage,
  getEvidenceQuality,
  getEvidenceAgeing,
  getControlAssurance,
  getAssurancePack,
  getAssurancePackCompleteness,
  getBoardPack,
  getCurrentReportingPeriod,
  getPreviousReportingPeriod,
  getPeriodDeltas,
  getPeriodTrendMetrics,
  getBoardAttentionItems,
  getManagementAttestation,
  ratingLabel,
  getFindingsForReview,
  FINDING_CATEGORIES,
} from './assurance-helpers.js';
import { getEvidenceAssuranceStatus } from './governance-helpers.js';
import { filterByScenario } from './relationships.js';

export function renderDashboardAssuranceSummary() {
  const s = getState();
  const m = assuranceMetrics(s, s.scenarioId);
  return `<section class="ri-panel ri-panel--compact">
    <h3>Regulatory assurance</h3>
    <ul class="ri-stats-inline">
      <li>High-materiality changes <strong>${m.significantChanges}</strong></li>
      <li>Assurance reviews due <strong>${m.reviewsDue}</strong></li>
      <li>Open findings <strong>${m.openFindings}</strong></li>
      <li>Obligation coverage gaps <strong>${m.obligationGaps}</strong></li>
    </ul>
    <p><a href="#/assurance">Assurance dashboard</a> · <a href="#/reports/board">Board report</a></p>
  </section>`;
}

export function renderChangeAssurancePanel(changeId) {
  const s = getState();
  const st = getAssuranceStatusForChange(s, changeId);
  const pack = st.packId ? getAssurancePack(s, st.packId) : null;
  const comp = pack ? getAssurancePackCompleteness(s, pack.id) : null;
  const att = (s.managementAttestations || []).filter((a) => a.scope?.includes(changeId) || a.supportingReviewIds?.some((rid) => {
    const r = getAssuranceReview(s, rid);
    return r?.changeId === changeId;
  }));
  const openFindings = (s.assuranceFindings || []).filter((f) => f.changeId === changeId && f.status !== 'Closed');

  const opinionReview = st.primaryReviewId ? getAssuranceReview(s, st.primaryReviewId) : null;
  const opinionBlock = opinionReview
    ? executiveSummary({
        eyebrow: 'ASSURANCE OPINION',
        title: ratingLabel(opinionReview.assuranceRating),
        narrative: esc(opinionReview.assuranceOpinion || 'Independent assurance opinion recorded for this change.'),
        meta: `<span class="ri-mono">${esc(opinionReview.id)}</span> · <span class="ri-muted">Reviewer: ${esc(personName(s, opinionReview.reviewerId))} · ${badge(opinionReview.reviewStatus)}</span>`,
        aside: `<a class="ri-btn ri-btn--sm ri-btn--primary" href="#/assurance/${esc(opinionReview.id)}">Open assurance review ${esc(opinionReview.id)}</a>`,
      })
    : '';

  return `<section class="ri-assurance-block" id="assurance-${esc(changeId)}">
    ${intelligenceLabel('Regulatory assurance')}
    <h2 class="ri-section-head__title">Implementation &amp; independent assurance</h2>
    <p class="ri-muted">Assurance evaluates implementation effectiveness — separate from governance approvals and AI recommendations.</p>
    ${opinionBlock}
    <dl class="ri-dl ri-dl--wide">
      <dt>Implementation health</dt><dd>${badge(st.implementationHealth.status)} ${esc(st.implementationHealth.reasons.join('; ') || '')}</dd>
      <dt>Assurance review</dt><dd>${badge(st.reviewStatus)}</dd>
      <dt>Assurance rating (independent)</dt><dd>${badge(st.assuranceRating)}</dd>
      <dt>Residual regulatory concern</dt><dd>${badge(st.residualConcern)}</dd>
      <dt>Assurance staleness</dt><dd>${badge(st.staleness.status)} ${esc(st.staleness.reason || '')}</dd>
      <dt>Assurance variance</dt><dd>${badge(st.variance.variance)} <span class="ri-muted">${esc(st.variance.detail)}</span></dd>
    </dl>
    <h3>Assurance layers</h3>
    <ul>
      <li>Management: <strong>${esc(st.layers.management)}</strong></li>
      <li>Compliance / Risk assurance: <strong>${esc(st.layers.complianceAssurance)}</strong></li>
      <li>Internal Audit: <strong>${esc(st.layers.internalAudit)}</strong></li>
    </ul>
    <h3>Open assurance findings</h3>
    <ul>${openFindings.map((f) => `<li><a href="#/finding/${esc(f.id)}">${esc(f.id)}</a> — ${badge(f.severity)} ${esc(f.title)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    <h3>Management attestation</h3>
    <ul>${att.map((a) => `<li><a href="#/management-attestation/${esc(a.id)}">${esc(a.id)}</a> — ${badge(a.status)} · ${esc(a.qualification)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    ${st.primaryReviewId ? `<p><a class="ri-btn ri-btn--sm ri-btn--primary" href="#/assurance/${esc(st.primaryReviewId)}">Open assurance review</a></p>` : ''}
    ${pack ? `<p><a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/assurance-pack/${esc(pack.id)}">Assurance / Evidence Pack</a> — Pack completeness (indicator): <strong>${comp?.packCompleteness ?? '—'}%</strong></p>` : ''}
    ${getChange(changeId)?.governanceReviewRequired ? `<p><button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-mark-assurance-stale data-change-id="${esc(changeId)}">Mark assurance stale (source update demo)</button></p>` : ''}
  </section>`;
}

export function renderObligationCoveragePanel(obligationId) {
  const cov = getObligationCoverage(getState(), obligationId);
  if (!cov) return '';
  const checkRows = Object.values(cov.checks).map(
    (c) => `<tr><td>${esc(c.label)}</td><td>${c.ok ? badge('Complete') : badge('Gap')}</td><td>${esc(c.detail)}</td></tr>`
  );
  return `<section class="ri-panel">
    <h3>Obligation coverage</h3>
    <p>Overall coverage indicator (demo): <strong>${cov.overallCoverageIndicator}%</strong> — <em>not a compliance probability score</em></p>
    <p>Status: ${badge(cov.coverageStatus)}</p>
    ${dataTable(['Check', 'Result', 'Detail'], checkRows)}
    ${cov.gaps.length ? `<p><strong>Gaps:</strong> ${cov.gaps.map((g) => esc(g)).join(', ')}</p>` : '<p class="ri-muted">No derived gaps.</p>'}
  </section>`;
}

export function viewAssuranceDashboard() {
  const s = getState();
  const m = assuranceMetrics(s, s.scenarioId);
  const reviews = filterAssuranceReviews(s, s.scenarioId);
  const findings = (s.assuranceFindings || []).filter((f) => {
    if (s.scenarioId === 'all') return true;
    const ch = f.changeId ? s.changes.find((c) => c.id === f.changeId) : null;
    return ch?.scenario === s.scenarioId;
  });
  const sigChanges = scenarioFilter(s.changes).filter((c) => c.materiality === 'High');
  const changeRows = sigChanges.map((c) => {
    const st = getAssuranceStatusForChange(s, c.id);
    return `<tr><td>${linkRecord('Regulatory Change', c.id, c.id)}</td><td>${badge(c.status)}</td><td>${badge(st.implementationHealth.status)}</td>
      <td>${badge(st.assuranceRating)}</td><td>${badge(st.residualConcern)}</td>
      <td>${st.primaryReviewId ? `<a href="#/assurance/${esc(st.primaryReviewId)}">Review</a>` : '—'}</td></tr>`;
  });
  const findingRows = findings
    .filter((f) => f.status !== 'Closed')
    .map(
      (f) => `<tr><td><a href="#/finding/${esc(f.id)}">${esc(f.id)}</a></td><td>${badge(f.severity)}</td><td>${esc(f.title)}</td>
        <td>${badge(f.status)}</td><td>${formatDate(f.dueDate)}</td><td>${personName(s, f.ownerId)}</td></tr>`
    );
  const attRows = (s.managementAttestations || [])
    .filter((a) => a.status !== 'Completed' || s.scenarioId === 'all' || a.scope?.includes('CHG-001'))
    .slice(0, 6)
    .map(
      (a) => `<tr><td><a href="#/management-attestation/${esc(a.id)}">${esc(a.id)}</a></td><td>${esc(a.period)}</td><td>${badge(a.status)}</td><td>${esc(a.qualification)}</td></tr>`
    );

  const flagship = getAssuranceReview(s, 'AR-CHG-001-COMP') || reviews.find((r) => r.independentReview && r.reviewStatus === 'Complete');
  const opinionLead = flagship
    ? executiveSummary({
        eyebrow: 'ASSURANCE OPINION',
        title: ratingLabel(flagship.assuranceRating),
        narrative: esc(flagship.assuranceOpinion || 'No opinion narrative in demo data.'),
        meta: `Residual concern: ${badge(flagship.residualConcern || '—')} · Next review ${formatDate(flagship.nextReviewDate)}`,
        aside: `<a class="ri-btn ri-btn--primary" href="#/assurance/${esc(flagship.id)}">Open review ${esc(flagship.id)}</a>`,
      })
    : '';

  return `${pageHeader({
    eyebrow: 'REGULATORY ASSURANCE',
    title: 'Regulatory Assurance',
    subtitle: 'Implementation health and independent opinions — management overview (DEMO)',
    actions: `<a class="ri-btn ri-btn--ghost" href="#/reports/board">Board report</a>`,
  })}
    ${opinionLead}
    <div class="ri-priority-metrics">
      <div class="ri-metric"><span class="ri-metric__label">Significant changes</span><span class="ri-metric__value"><strong>${m.significantChanges}</strong></span></div>
      <div class="ri-metric"><span class="ri-metric__label">Reviews due</span><span class="ri-metric__value"><strong>${m.reviewsDue}</strong></span></div>
      <div class="ri-metric"><span class="ri-metric__label">Open findings</span><span class="ri-metric__value"><strong>${m.openFindings}</strong></span></div>
      <div class="ri-metric"><span class="ri-metric__label">High findings</span><span class="ri-metric__value"><strong>${m.highFindings}</strong></span></div>
    </div>
    <section class="ri-panel"><h3>Significant regulatory changes — assurance</h3>
      ${dataTable(['Change', 'Implementation', 'Health', 'Assurance rating', 'Residual concern', 'Review'], changeRows)}
    </section>
    <section class="ri-panel"><h3>Open assurance findings</h3>
      ${dataTable(['ID', 'Severity', 'Title', 'Status', 'Due', 'Owner'], findingRows, 'No open findings')}
    </section>
    <section class="ri-panel"><h3>Management attestations</h3>
      ${dataTable(['ID', 'Period', 'Status', 'Qualification'], attRows)}
    </section>
    <section class="ri-panel"><h3>Assurance reviews</h3>
      <ul>${reviews.slice(0, 8).map((r) => `<li><a href="#/assurance/${esc(r.id)}">${esc(r.id)}</a> — ${esc(r.assuranceType)} · ${badge(r.reviewStatus)} · ${ratingLabel(r.assuranceRating)}</li>`).join('')}</ul>
    </section>
    <p><a href="#/reports/board">Board / Executive report</a> · <a href="#/reports/period-changes">What changed since last committee?</a></p>`;
}

export function viewAssuranceReview(id) {
  const s = getState();
  const r = getAssuranceReview(s, id);
  if (!r) return notFoundState('Assurance Review', id);
  const indep = getIndependenceStatus(s, r);
  const meth = getAssuranceMethodology(s, r.methodologyId);
  const opinion = getAssuranceOpinion(s, id);
  const findings = getFindingsForReview(s, id);

  return `${pageHeader(r.assuranceType, r.id)}
    <p><a href="#/assurance">← Assurance dashboard</a></p>
    ${recordLane('1', 'Scope', `<p>${esc(r.scope)}</p><p class="ri-muted">${formatDate(r.periodStart)} — ${formatDate(r.periodEnd)}</p>`, 'neutral')}
    ${recordLane(
      '2',
      'Reviewer / independence',
      `<dl class="ri-dl"><dt>Reviewer</dt><dd>${personName(s, r.reviewerId)}</dd>
        <dt>Line</dt><dd>${esc(r.assuranceLine || '—')}</dd>
        <dt>Independence</dt><dd>${badge(indep.status)} — ${esc(indep.message)}</dd></dl>`,
      'human'
    )}
    ${recordLane(
      '3',
      'Methodology',
      meth
        ? `<p><strong>${esc(meth.name)}</strong> (v${esc(meth.version)})</p><p>${esc(meth.description)}</p>
           <ul>${(meth.requiredChecks || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
        : '<p class="ri-muted">—</p>',
      'neutral'
    )}
    ${recordLane(
      '4',
      'Controls reviewed',
      `<ul>${(r.controlTestIds || []).map((tid) => {
        const t = s.controlTests.find((x) => x.id === tid);
        return `<li><a href="#/control-test/${esc(tid)}">${esc(tid)}</a> — ${t ? badge(t.result) : ''}</li>`;
      }).join('') || '<li class="ri-muted">None</li>'}</ul>`,
      'neutral'
    )}
    ${recordLane(
      '5',
      'Evidence reviewed',
      `<ul>${(r.evidenceIds || []).map((eid) => `<li>${linkRecord('Evidence', eid, eid)} — ${badge(getEvidenceAssuranceStatus(s.evidence.find((e) => e.id === eid) || {}))}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>`,
      'neutral'
    )}
    ${recordLane(
      '6',
      'Findings',
      `<ul>${findings.map((f) => `<li><a href="#/finding/${esc(f.id)}">${esc(f.id)}</a> — ${badge(f.severity)} ${esc(f.title)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>`,
      'neutral'
    )}
    ${recordLane(
      '7',
      'Exceptions',
      `<ul>${(r.exceptionIds || []).map((eid) => `<li><a href="#/exception/${esc(eid)}">${esc(eid)}</a></li>`).join('') || '<li class="ri-muted">None</li>'}</ul>`,
      'neutral'
    )}
    ${recordLane(
      '8',
      'Management representations',
      `<ul>${(r.attestationIds || []).map((aid) => {
        const ma = getManagementAttestation(s, aid);
        const ga = s.attestations?.find((x) => x.id === aid);
        if (ma) return `<li><a href="#/management-attestation/${esc(aid)}">${esc(aid)}</a> — management attestation</li>`;
        if (ga) return `<li><a href="#/attestation/${esc(aid)}">${esc(aid)}</a> — implementation attestation</li>`;
        return `<li>${esc(aid)}</li>`;
      }).join('') || '<li class="ri-muted">None</li>'}</ul>`,
      'human'
    )}
    ${recordLane(
      '9',
      'Assurance opinion',
      `<p><strong>Assurance conclusion:</strong> ${badge(ratingLabel(r.assuranceRating))}</p>
       <p>${esc(r.assuranceOpinion || '—')}</p>
       <p class="ri-muted">This is an assurance opinion — not regulatory approval or certification.</p>`,
      'ai'
    )}
    ${recordLane('10', 'Residual concern & next review', `<p>Residual concern: ${badge(r.residualConcern || '—')}</p><p>Next review: ${formatDate(r.nextReviewDate)}</p>`, 'neutral')}
    <section class="ri-panel"><h3>Audit</h3>
      <ul>${getAuditEventsFor('Assurance Review', id).slice(0, 8).map((e) => `<li>${formatDate(e.timestamp)} — ${esc(e.action)} (${esc(e.user)})</li>`).join('') || '<li class="ri-muted">See audit trail</li>'}</ul>
    </section>`;
}

export function viewFinding(id) {
  const s = getState();
  const f = (s.assuranceFindings || []).find((x) => x.id === id);
  if (!f) return notFoundState('Assurance Finding', id);
  const review = getAssuranceReview(s, f.assuranceReviewId);

  return `${pageHeader(f.title, f.id)}
    <p>${badge(f.severity)} · ${badge(f.status)} · ${esc(f.category)}</p>
    <p>${esc(f.description)}</p>
    <dl class="ri-dl">
      <dt>Source review</dt><dd>${review ? `<a href="#/assurance/${esc(review.id)}">${esc(review.id)}</a>` : '—'}</dd>
      <dt>Affected entity</dt><dd>${esc(f.entityType)} ${linkRecord(f.entityType === 'Regulatory Change' ? 'Regulatory Change' : f.entityType, f.entityId, f.entityId)}</dd>
      <dt>Owner</dt><dd>${personName(s, f.ownerId)}</dd>
      <dt>Due</dt><dd>${formatDate(f.dueDate)}</dd>
      <dt>Linked risk</dt><dd>${f.linkedRiskId ? linkRecord('Risk', f.linkedRiskId, f.linkedRiskId) : '—'}</dd>
    </dl>
    <h3>Remediation</h3>
    <ul>${(f.linkedActionIds || []).map((aid) => `<li>${linkRecord('Action', aid, aid)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    ${f.status === 'Remediation In Progress' || f.status === 'Open' ? `
      <button type="button" class="ri-btn ri-btn--primary" data-finding-remediation="${esc(id)}">Mark remediation complete</button>` : ''}
    ${f.status === 'Awaiting Validation' ? `
      <div class="ri-form" data-finding-validate="${esc(id)}">
        <label>Validation comments <textarea data-finding-validation-comments rows="2"></textarea></label>
        <button type="button" class="ri-btn ri-btn--primary" data-finding-validate-btn="${esc(id)}">Validate &amp; close finding</button>
      </div>` : ''}
    ${f.validatedBy ? `<p>Validated by ${personName(s, f.validatedBy)} on ${formatDate(f.validationDate)} — ${esc(f.validationComments || '')}</p>` : ''}
    <h3>Evidence</h3>
    <ul>${(f.evidenceIds || []).map((eid) => `<li>${linkRecord('Evidence', eid, eid)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    <section class="ri-panel"><h3>Audit</h3>
      <ul>${getAuditEventsFor('Assurance Finding', id).map((e) => `<li>${formatDate(e.timestamp)} — ${esc(e.action)}</li>`).join('') || '<li class="ri-muted">—</li>'}</ul>
    </section>`;
}

export function viewManagementAttestation(id) {
  const s = getState();
  const a = getManagementAttestation(s, id);
  if (!a) return notFoundState('Management Attestation', id);
  return `${pageHeader('Management attestation', a.id)}
    <blockquote>${esc(a.statement)}</blockquote>
    <dl class="ri-dl">
      <dt>Period</dt><dd>${esc(a.period)}</dd>
      <dt>Attestor</dt><dd>${personName(s, a.attestorId)} — ${esc(a.role)}</dd>
      <dt>Status</dt><dd>${badge(a.status)}</dd>
      <dt>Qualification</dt><dd>${badge(a.qualification)}</dd>
      ${a.qualificationExplanation ? `<dt>Qualification detail</dt><dd>${esc(a.qualificationExplanation)}</dd>` : ''}
      <dt>Mock signed</dt><dd>${a.signedAtMock ? formatDate(a.signedAtMock) : '—'}</dd>
    </dl>
    <h3>Exceptions declared</h3>
    <ul>${(a.exceptionsDeclared || []).map((eid) => `<li><a href="#/exception/${esc(eid)}">${esc(eid)}</a></li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    <h3>Linked assurance reviews</h3>
    <ul>${(a.supportingReviewIds || []).map((rid) => `<li><a href="#/assurance/${esc(rid)}">${esc(rid)}</a></li>`).join('')}</ul>
    ${a.status === 'Due' ? `<button type="button" class="ri-btn ri-btn--primary" data-mgmt-attest="${esc(id)}">Complete attestation (mock)</button>` : ''}
    <p class="ri-muted">Mock attestation — not an electronic signature.</p>`;
}

export function viewAssurancePack(id) {
  const s = getState();
  const pack = getAssurancePack(s, id);
  if (!pack) return notFoundState('Assurance Pack', id);
  const ch = getChange(pack.changeId);
  const pub = ch ? getPublication(ch.publicationId) : null;
  const related = ch ? collectRelatedForChange(ch.id) : {};
  const comp = getAssurancePackCompleteness(s, id);
  const review = (pack.assuranceReviewIds || []).map((rid) => getAssuranceReview(s, rid)).find(Boolean);

  const section = (title, body) => recordLane(title.slice(0, 2), title, body, 'neutral');

  return `${pageHeader(pack.title, pack.id)}
    <p class="ri-muted">Assurance / Evidence Pack — structured evidence trail (not a regulator submission).</p>
    <p>Pack completeness (indicator): <strong>${comp?.packCompleteness ?? '—'}%</strong> · Status: ${badge(pack.packStatus)}</p>
    ${comp?.sections ? `<ul>${Object.entries(comp.sections).map(([k, v]) => `<li>${esc(k)}: <strong>${esc(v)}</strong></li>`).join('')}</ul>` : ''}
    ${section('Regulatory source', pub ? `${linkRecord('Publication', pub.id, pub.title)}<p>${esc(ch?.sourceCitation || '')}</p>` : '—')}
    ${section('Regulatory Change', ch ? linkRecord('Regulatory Change', ch.id, ch.title) : '—')}
    ${section('Applicability decision', ch ? `<p>${badge(ch.applicabilityDecision)} — ${esc(ch.decisionMeta?.justification || '')}</p>` : '—')}
    ${section('Impact Assessment', `<ul>${(related.assessments || []).map((a) => `<li>${linkRecord('Impact Assessment', a.id, a.id)}</li>`).join('') || '<li>—</li>'}</ul>`)}
    ${section('Obligations', `<ul>${(related.obligations || []).map((o) => `<li>${linkRecord('Obligation', o.id, o.id)}</li>`).join('') || '<li>—</li>'}</ul>`)}
    ${section('Policies / Risks / Controls', `<p>Policies: ${(related.policies || []).map((p) => p.id).join(', ') || '—'}</p>
      <p>Risks: ${(related.risks || []).map((r) => r.id).join(', ') || '—'}</p>
      <p>Controls: ${(related.controls || []).map((c) => c.id).join(', ') || '—'}</p>`)}
    ${section('Implementation actions', `<ul>${(related.actions || []).map((a) => `<li>${linkRecord('Action', a.id, a.id)} — ${badge(a.status)}</li>`).join('') || '<li>—</li>'}</ul>`)}
    ${section('Evidence', `<ul>${(pack.evidenceIds || []).map((eid) => `<li>${linkRecord('Evidence', eid, eid)}</li>`).join('')}</ul>`)}
    ${section('Control tests', `<ul>${(pack.controlTestIds || []).map((tid) => `<li><a href="#/control-test/${esc(tid)}">${esc(tid)}</a></li>`).join('')}</ul>`)}
    ${section('Approvals', `<ul>${(pack.approvalIds || []).map((aid) => `<li>${esc(aid)}</li>`).join('')}</ul>`)}
    ${section('Attestations', `<ul>${(pack.attestationIds || []).map((aid) => `<li>${esc(aid)}</li>`).join('')}</ul>`)}
    ${section('Assurance Opinion', review ? `<p>${badge(ratingLabel(review.assuranceRating))}</p><p>${esc(review.assuranceOpinion || '')}</p><a href="#/assurance/${esc(review.id)}">Full review</a>` : '—')}
    ${section('Audit history', `<ul>${getAuditEventsFor('Assurance Pack', id).concat(getAuditEventsFor('Regulatory Change', pack.changeId)).slice(0, 10).map((e) => `<li>${formatDate(e.timestamp)} — ${esc(e.action)}</li>`).join('') || '<li>See audit trail</li>'}</ul>`)}
  `;
}

export function viewBoardReport() {
  const s = getState();
  const cur = getCurrentReportingPeriod(s);
  const prev = getPreviousReportingPeriod(s);
  const attention = getBoardAttentionItems(s, s.scenarioId);
  const sig = scenarioFilter(s.changes)
    .filter((c) => c.materiality === 'High')
    .map((c) => {
      const pub = getPublication(c.publicationId);
      const st = getAssuranceStatusForChange(s, c.id);
      return `<tr><td>${linkRecord('Regulatory Change', c.id, c.title)}</td><td>${esc(pub?.regulator || '—')}</td>
        <td>${badge(c.materiality)}</td><td>${formatDate(c.effectiveDate)}</td><td>${badge(c.status)}</td>
        <td>${badge(st.assuranceRating)}</td><td>${badge(st.residualConcern)}</td>
        <td>${personName(s, c.accountableExecutiveId || c.ownerId)}</td></tr>`;
    });
  const findings = (s.assuranceFindings || [])
    .filter((f) => f.status !== 'Closed' && ['High', 'Medium', 'Critical'].includes(f.severity))
    .slice(0, 8)
    .map((f) => `<li><a href="#/finding/${esc(f.id)}">${esc(f.id)}</a> — ${esc(f.title)} ${badge(f.severity)}</li>`);
  const pack = (s.boardPacks || []).find((p) => p.reportingPeriodId === cur?.id && p.status !== 'Draft') || (s.boardPacks || []).find((p) => p.id === 'BP-2026-Q4-DRAFT');
  const decisions = pack?.decisionItems || [];
  const trend = getPeriodTrendMetrics(s, cur?.id)[0]?.metrics;

  const narrative = pack?.executiveSummary || 'Regulatory implementation remains broadly controlled, with material areas requiring executive attention.';
  return `${pageHeader({
    eyebrow: 'BOARD REGULATORY POSITION',
    title: cur?.name || 'Q4 2026',
    subtitle: 'Selective management view for Board Risk Committee and executive oversight (DEMO)',
    meta: `Previous period: ${esc(prev?.name || '—')} · <a href="#/reports/period-changes">Changes since last committee</a>`,
    actions: `<a class="ri-btn ri-btn--primary" href="#/board-pack/${esc(pack?.id || 'BP-2026-Q4-DRAFT')}">Open board pack</a>`,
  })}
    ${executiveSummary({
      eyebrow: 'EXECUTIVE NARRATIVE',
      title: 'Regulatory implementation position',
      narrative: esc(narrative),
    })}
    ${sectionHeader('DECISIONS REQUIRED', 'Acknowledgements and escalations', '')}
    <ul class="ri-board-list">${decisions.map((d) => `<li><strong class="ri-mono">${esc(d.type)}</strong> — ${esc(d.text)} ${badge(d.status)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    ${sectionHeader('MATERIAL CHANGES', 'Significant regulatory developments', 'High-materiality changes with assurance and implementation context.')}
    <section class="ri-board-section">
      ${dataTable(['Change', 'Regulator', 'Materiality', 'Effective', 'Implementation', 'Assurance', 'Residual', 'Accountable exec'], sig)}
    </section>
    ${sectionHeader('IMPLEMENTATION HEALTH', 'Implementation health', 'Delivery status on material changes.')}
    <section class="ri-board-section ri-board-section--compact">
      <ul>${scenarioFilter(s.changes).filter((c) => c.materiality === 'High').map((c) => {
        const h = getAssuranceStatusForChange(s, c.id).implementationHealth;
        return `<li>${esc(c.id)}: ${badge(h.status)}</li>`;
      }).join('')}</ul>
    </section>
    ${sectionHeader('ASSURANCE POSITION', 'Independent second-line opinions', 'Distinct from governance approvals and management self-assessment.')}
    <section class="ri-board-section ri-board-section--compact">
      <ul>${filterAssuranceReviews(s, s.scenarioId).filter((r) => r.independentReview && r.reviewStatus === 'Complete').slice(0, 5).map((r) =>
        `<li><a href="#/assurance/${esc(r.id)}">${esc(r.changeId || r.entityId)}</a> — ${ratingLabel(r.assuranceRating)} (${esc(r.assuranceLine)})</li>`
      ).join('')}</ul>
    </section>
    ${sectionHeader('MATERIAL FINDINGS', 'Material findings register', 'Open assurance findings requiring management attention.')}
    <section class="ri-board-section ri-board-section--compact"><ul class="ri-board-list">${findings.join('') || '<li class="ri-muted">None</li>'}</ul></section>
    ${sectionHeader('UPCOMING DATES', 'Effective dates on material changes', '')}
    <section class="ri-board-section ri-board-section--compact">
      <ul>${scenarioFilter(s.changes)
        .filter((c) => c.effectiveDate && c.materiality === 'High')
        .slice(0, 5)
        .map((c) => `<li>${formatDate(c.effectiveDate)} — ${linkRecord('Regulatory Change', c.id, c.id)}</li>`)
        .join('') || '<li class="ri-muted">None in scope</li>'}</ul>
    </section>
    ${sectionHeader('EXCEPTIONS', 'Approved risk acceptances', '')}
    <section class="ri-board-section ri-board-section--compact">
      <ul class="ri-board-list">${(s.governanceExceptions || []).filter((e) => e.status === 'Approved').map((e) =>
        `<li><a href="#/exception/${esc(e.id)}">${esc(e.id)}</a> — expires ${formatDate(e.expiryDate)}</li>`
      ).join('') || '<li class="ri-muted">None</li>'}</ul>
    </section>
    ${sectionHeader('MANAGEMENT ATTESTATIONS', 'Periodic management assurance', '')}
    <section class="ri-board-section ri-board-section--compact">
      <ul class="ri-board-list">${(s.managementAttestations || []).slice(0, 4).map((a) =>
        `<li><a href="#/management-attestation/${esc(a.id)}">${esc(a.scope)}</a> — ${badge(a.qualification)}</li>`
      ).join('') || '<li class="ri-muted">None</li>'}</ul>
    </section>
    ${sectionHeader('EXECUTIVE ATTENTION', 'Items requiring board visibility', '')}
    <section class="ri-board-section ri-board-section--compact">
      <ul class="ri-board-list">${attention.map((i) => `<li>${badge(i.severity)} <a href="${esc(i.href)}">${esc(i.title)}</a></li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    </section>
    ${sectionHeader('AI GOVERNANCE', 'Material AI issues for committee', 'Full detail in AI Governance register.')}
    <section class="ri-board-section ri-board-section--compact">
      <ul class="ri-board-list">${(s.aiAnalyses || []).filter((a) => a.groundingStatus === 'Source Conflict').slice(0, 2).map((a) =>
        `<li><a href="#/ai-analysis/${esc(a.id)}">${esc(a.entityId)}</a> — AI source conflict</li>`
      ).join('') || '<li>No material AI issues for board attention in this scenario.</li>'}</ul>
    </section>
    ${trend ? `<section class="ri-board-section ri-board-section--compact"><h3 class="ri-subhead">Period trend (demo)</h3>
      <ul><li>High-materiality open: <strong>${trend.highMaterialityOpen}</strong></li>
      <li>Overdue actions: <strong>${trend.overdueActions}</strong></li>
      <li>Open findings: <strong>${trend.openFindings}</strong></li></ul></section>` : ''}
    <p><a href="#/assurance">Assurance dashboard</a> · <a href="#/reports">All reports</a></p>`;
}

export function viewBoardPack(id) {
  const s = getState();
  const p = getBoardPack(s, id);
  if (!p) return notFoundState('Board Pack', id);
  const period = s.reportingPeriods?.find((x) => x.id === p.reportingPeriodId);
  const snap = p.snapshotMetrics || {};
  return `${pageHeader(p.title, `${p.id} · v${p.version}`)}
    <p class="ri-alert">Board Pack snapshot — operational data may have changed since generation (${formatDate(p.generatedAt)}).</p>
    <dl class="ri-dl">
      <dt>Reporting period</dt><dd>${esc(period?.name || p.reportingPeriodId)}</dd>
      <dt>Status</dt><dd>${badge(p.status)}</dd>
      <dt>Generated by</dt><dd>${personName(s, p.generatedBy)}</dd>
      <dt>Version</dt><dd>${p.version}${p.previousVersionId ? ` · previous <a href="#/board-pack/${esc(p.previousVersionId)}">${esc(p.previousVersionId)}</a>` : ''}</dd>
    </dl>
    <h3>Executive summary (snapshot)</h3>
    <p>${esc(p.executiveSummary || '')}</p>
    <h3>Snapshot metrics</h3>
    <ul><li>High-materiality open: <strong>${snap.highMaterialityOpen}</strong></li>
      <li>Overdue actions: <strong>${snap.overdueActions}</strong></li>
      <li>Open findings: <strong>${snap.openFindings}</strong></li>
      <li>Evidence gaps: <strong>${snap.evidenceGaps}</strong></li></ul>
    <h3>Significant changes (snapshot)</h3>
    <ul>${(p.significantChangeIds || []).map((cid) => `<li>${linkRecord('Regulatory Change', cid, cid)}</li>`).join('')}</ul>
    <h3>Findings / exceptions / attestations</h3>
    <p>Findings: ${(p.findingIds || []).join(', ')}</p>
    <p>Exceptions: ${(p.exceptionIds || []).join(', ')}</p>
    <p>Attestations: ${(p.attestationIds || []).join(', ')}</p>
    <h3>Decisions required (snapshot)</h3>
    <ul>${(p.decisionItems || []).map((d) => `<li>${esc(d.type)}: ${esc(d.text)}</li>`).join('')}</ul>
    ${p.status === 'Ready for Review' ? `<button type="button" class="ri-btn ri-btn--primary" data-board-pack-finalize="${esc(id)}">Mark Final (mock review)</button>` : ''}
    <p><a href="#/reports/board">← Board report</a></p>`;
}

export function viewPeriodChanges() {
  const s = getState();
  const cur = getCurrentReportingPeriod(s);
  const prev = getPreviousReportingPeriod(s);
  const deltas = getPeriodDeltas(s, cur?.id);
  const rows = deltas.map(
    (d) => `<tr><td>${badge(d.classification)}</td><td>${esc(d.area)}</td><td>${esc(d.detail)}</td>
      <td>${d.entityId ? linkRecord(d.entityType === 'Impact Assessment' ? 'Impact Assessment' : d.entityType === 'Assurance Finding' ? 'Assurance Finding' : d.entityType === 'Regulatory Change' ? 'Regulatory Change' : d.entityType, d.entityId, d.entityId) : '—'}</td></tr>`
  );
  return `${pageHeader('What changed since last committee?', `Period comparison — ${esc(prev?.name)} → ${esc(cur?.name)} (DEMO)`)}
    <p class="ri-muted">Deterministic seeded deltas — not arbitrary historical analytics.</p>
    ${dataTable(['Classification', 'Area', 'Detail', 'Entity'], rows, 'No deltas')}
    <p><a href="#/reports/board">Board report</a></p>`;
}

export function viewAssuranceReport(sub) {
  const s = getState();
  if (sub === 'obligation-assurance') {
    const rows = scenarioFilter(s.obligations).map((o) => {
      const cov = getObligationCoverage(s, o.id);
      return `<tr><td><a href="#/obligation/${esc(o.id)}">${esc(o.id)}</a></td><td>${esc(o.changeId || '—')}</td>
        <td>${esc(o.owner)}</td><td>${cov?.checks.policy.ok ? 'Yes' : 'No'}</td><td>${cov?.checks.control.ok ? 'Yes' : 'No'}</td>
        <td>${cov?.checks.controlEffectiveness.ok ? 'OK' : 'Weak'}</td><td>${cov?.checks.evidence.ok ? 'OK' : 'Gap'}</td>
        <td>${badge(cov?.coverageStatus)}</td><td>${esc(cov?.gaps.join(', ') || '—')}</td></tr>`;
    });
    return `${pageHeader('Obligation Assurance', 'Coverage indicators per obligation')} ${dataTable(['Obligation', 'Change', 'Owner', 'Policy', 'Control', 'Effectiveness', 'Evidence', 'Status', 'Gaps'], rows)}`;
  }
  if (sub === 'control-assurance') {
    const rows = scenarioFilter(s.controls).map((c) => {
      const ca = getControlAssurance(s, c.id);
      return `<tr><td><a href="#/control/${esc(c.id)}">${esc(c.id)}</a></td><td>${esc((c.obligationIds || []).join(', '))}</td>
        <td>${esc(c.owner)}</td><td>${badge(ca?.assuranceLabel)}</td><td>${ca?.latestTest ? `<a href="#/control-test/${esc(ca.latestTest.id)}">${esc(ca.latestTest.result)}</a>` : '—'}</td>
        <td>${formatDate(c.nextReviewDate)}</td></tr>`;
    });
    return `${pageHeader('Control Assurance', 'Derived from control tests and findings')} ${dataTable(['Control', 'Obligations', 'Owner', 'Assurance', 'Latest test', 'Next review'], rows)}`;
  }
  if (sub === 'evidence-assurance') {
    const rows = scenarioFilter(s.evidence).map((e) => {
      const q = getEvidenceQuality(s, e);
      return `<tr><td><a href="#/evidence/${esc(e.id)}">${esc(e.id)}</a></td><td>${esc(e.controlId || e.obligationId || '—')}</td>
        <td>${badge(getEvidenceAssuranceStatus(e))}</td><td>${badge(q.status)}</td><td>${formatDate(e.reviewDueDate)}</td>
        <td>${formatDate(e.expiryDate)}</td><td>${badge(getEvidenceAgeing(e))}</td></tr>`;
    });
    return `${pageHeader('Evidence Assurance', 'Quality, ageing and review status')} ${dataTable(['Evidence', 'Linked', 'Review status', 'Quality', 'Review due', 'Expiry', 'Ageing'], rows)}`;
  }
  if (sub === 'findings') {
    const rows = (s.assuranceFindings || [])
      .filter((f) => s.scenarioId === 'all' || s.changes.find((c) => c.id === f.changeId)?.scenario === s.scenarioId)
      .map(
        (f) => `<tr><td><a href="#/finding/${esc(f.id)}">${esc(f.id)}</a></td><td>${badge(f.severity)}</td>
          <td>${esc(f.category)}</td><td>${badge(f.status)}</td><td>${personName(s, f.ownerId)}</td><td>${formatDate(f.dueDate)}</td></tr>`
      );
    return `${pageHeader('Assurance Findings', 'Remediation and validation')} ${dataTable(['ID', 'Severity', 'Category', 'Status', 'Owner', 'Due'], rows)}`;
  }
  if (sub === 'management-attestations') {
    const rows = (s.managementAttestations || []).map(
      (a) => `<tr><td><a href="#/management-attestation/${esc(a.id)}">${esc(a.id)}</a></td><td>${esc(a.scope)}</td>
        <td>${esc(a.period)}</td><td>${personName(s, a.attestorId)}</td><td>${badge(a.status)}</td><td>${esc(a.qualification)}</td></tr>`
    );
    return `${pageHeader('Management Attestation Report', 'Periodic management assurance')} ${dataTable(['ID', 'Scope', 'Period', 'Attestor', 'Status', 'Qualification'], rows)}`;
  }
  if (sub === 'assurance-opinions') {
    const rows = filterAssuranceReviews(s, s.scenarioId)
      .filter((r) => r.reviewStatus === 'Complete')
      .map(
        (r) => `<tr><td><a href="#/assurance/${esc(r.id)}">${esc(r.id)}</a></td><td>${esc(r.changeId || r.entityId)}</td>
          <td>${esc(r.assuranceLine)}</td><td>${ratingLabel(r.assuranceRating)}</td><td>${badge(r.residualConcern)}</td>
          <td>${personName(s, r.reviewerId)}</td><td>${formatDate(r.nextReviewDate)}</td></tr>`
      );
    return `${pageHeader('Assurance Opinion Report', 'Completed assurance reviews')} ${dataTable(['Review', 'Change', 'Line', 'Rating', 'Residual', 'Reviewer', 'Next review'], rows)}`;
  }
  if (sub === 'control-coverage') {
    const rows = scenarioFilter(s.obligations).flatMap((o) =>
      (o.controlIds || []).map((cid) => {
        const c = s.controls.find((x) => x.id === cid);
        const ca = getControlAssurance(s, cid);
        const ev = getEvidenceCoverage(s, 'Control', cid);
        return `<tr><td>${esc(o.id)}</td><td>${esc(cid)}</td><td>${badge(c?.effectivenessStatus || c?.effectiveness)}</td>
          <td>${badge(ca?.assuranceLabel)}</td><td>${ev.accepted.length}/${ev.required.length || ev.available.length} accepted</td>
          <td>${(s.assuranceFindings || []).filter((f) => f.entityId === cid && f.status !== 'Closed').length} open</td></tr>`;
      })
    );
    return `${pageHeader('Control Coverage Table', 'Obligation → Control → Effectiveness → Evidence → Findings')}
      ${dataTable(['Obligation', 'Control', 'Effectiveness', 'Control assurance', 'Evidence', 'Findings'], rows)}`;
  }
  return viewAssuranceDashboard();
}

export function renderEvidenceAssurancePanel(evidenceId) {
  const s = getState();
  const e = getEvidence(evidenceId);
  if (!e) return '';
  const q = getEvidenceQuality(s, e);
  const reviews = (e.linkedAssuranceReviewIds || []).map((id) => getAssuranceReview(s, id)).filter(Boolean);
  return `<section class="ri-panel"><h3>Evidence assurance</h3>
    <p>Quality: ${badge(q.status)} · Ageing: ${badge(getEvidenceAgeing(e))}</p>
    <ul>${Object.entries(q.dimensions).map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`).join('')}</ul>
    ${reviews.length ? `<p>Linked reviews: ${reviews.map((r) => `<a href="#/assurance/${esc(r.id)}">${esc(r.id)}</a>`).join(', ')}</p>` : ''}
  </section>`;
}

export function renderControlAssurancePanel(controlId) {
  const ca = getControlAssurance(getState(), controlId);
  if (!ca) return '';
  return `<section class="ri-panel"><h3>Control assurance</h3>
    <p>Derived control assurance: ${badge(ca.assuranceLabel)}</p>
    ${ca.latestTest ? `<p>Latest test: <a href="#/control-test/${esc(ca.latestTest.id)}">${esc(ca.latestTest.id)}</a> — ${badge(ca.latestTest.result)}</p>` : ''}
    <p>Next test / review: ${formatDate(ca.nextTestDate)}</p>
  </section>`;
}
