import { getPublication, getChange, getState, personName } from './store.js';
import { collectRelatedForChange, getAuditEventsFor, buildTraceFrom } from './relationships.js';
import {
  esc,
  badge,
  aiRecommendation,
  dataTable,
  formatDate,
  linkRecord,
  renderCitation,
  renderRelatedGroups,
  renderTraceSection,
  aiProvenancePanel,
  entityHero,
  lifecycleFlow,
  traceabilityFlow,
  intelligenceLabel,
  recordLane,
  notFoundState,
} from './components.js';
import { nextActionsPanel } from './demo-views.js';
import { renderIngestionProvenancePanel } from './ingestion-views.js';
import { renderChangeGovernancePanel } from './governance-views.js';
import { renderChangeAiSummary } from './ai-governance-views.js';
import { renderChangeAssurancePanel } from './assurance-views.js';
import { orgFactorBullets } from './seed-operational.js';
import { renderChangeIaPanel } from './ai-workflow-ui.js';
import { isConnectedBackendActive, isConnectedChangeWritesEnabled } from './platform/connected-mode.js';
import {
  connectedCatalogueBanner,
  getConnectedAssigneeLabel,
  getConnectedCatalogue,
} from './platform/connected-catalogue.js';
import { connectedWorkModeBanner } from './platform/connected-display.js';
import { connectedChangeStatusOptions } from './platform/connected-change-workflow.js';
import { renderConnectedWorkflowEventsTable } from './platform/connected-governance-ui.js';
import {
  renderConnectedCreateImpactPanel,
} from './platform/connected-impact-panels.js';
import { renderConnectedCreateObligationPanel } from './platform/connected-obligation-panels.js';
import {
  getConnectedEntityWorkflowEvents,
} from './platform/connected-entity-audit.js';

export function viewChange(id) {
  const connected = isConnectedBackendActive(getState());
  const ch = getChange(id);
  if (connected && !ch) {
    return `${connectedCatalogueBanner(getState())}
      ${connectedWorkModeBanner(getState())}
      <p class="ri-muted" data-connected-change-loading="true">Loading tenant regulatory change from staging…</p>`;
  }
  if (!ch) return notFoundState('Regulatory Change', id);
  if (connected) {
    return viewChangeConnected(id, ch._connected ? ch : { ...ch, _connected: true });
  }
  const pub = getPublication(ch.publicationId);
  const related = collectRelatedForChange(id);
  const s = getState();
  const timeline = buildTimeline(ch, related);

  const crumbs = [
    { label: 'Regulatory Intelligence', href: '#/dashboard' },
    { label: 'Regulatory Changes', href: '#/changes' },
    pub ? { label: pub.id, href: `#/publication/${pub.id}` } : null,
    { label: ch.id },
  ].filter(Boolean);

  const hero = entityHero(ch.id, ch.title, [
    { label: 'Materiality', value: ch.materiality, badge: true },
    { label: 'Topic', value: ch.topic || '—' },
    { label: 'Owner', value: personName(s, ch.ownerId) || '—' },
    { label: 'Status', value: ch.status, badge: true },
    { label: 'Applicability', value: ch.applicabilityDecision || ch.applicabilityRecommendation || 'Pending', badge: true },
    { label: 'Effective', value: formatDate(ch.effectiveDate) },
    { label: 'Implementation due', value: formatDate(ch.dueDate) },
  ], crumbs, {
    eyebrow: 'REGULATORY CHANGE',
    refs: `${ch.id} · ${ch.materiality} · ${pub?.regulator || 'FCA'}`,
    narrative: ch.description,
    actions: `<a class="ri-btn ri-btn--primary" href="#lane-human-${esc(id)}">Review applicability</a>
      <a class="ri-btn ri-btn--ghost" href="#assurance-${esc(id)}">Assurance position</a>
      <a class="ri-btn ri-btn--ghost" href="#/publication/${esc(ch.publicationId)}/source">Read source</a>`,
  });

  const lifecycle = lifecycleFlow([
    { label: 'Source', variant: 'source', href: `#lane-source-${id}`, state: ch.publicationId, current: false },
    { label: 'AI interpretation', variant: 'ai', href: `#lane-ai-${id}`, state: ch.applicabilityRecommendation || 'Pending', current: !ch.applicabilityDecision },
    { label: 'Human decision', variant: 'human', href: `#lane-human-${id}`, state: ch.applicabilityDecision || 'Pending', current: Boolean(ch.applicabilityDecision) },
    { label: 'Governance', variant: 'governance', href: `#governance-${id}`, state: ch.closureStatus || ch.status },
    { label: 'Implementation', variant: 'neutral', href: `#lane-impl-${id}`, state: related.obligations?.length ? `${related.obligations.length} obligations` : 'In progress' },
    { label: 'Assurance', variant: 'assurance', href: `#assurance-${id}`, state: 'Independent review' },
  ]);

  const { forward } = buildTraceFrom('Regulatory Change', id);
  const traceItems = forward.map((x) => ({
    ...x,
    type: x.type === 'Change' ? 'Regulatory Change' : x.type,
    label: x.label || x.id,
  }));

  const sourceBody = `
    <p class="ri-lead">Publication ${linkRecord('Publication', ch.publicationId, ch.publicationId)}</p>
    <p><span class="ri-label">Citation</span> ${renderCitation(ch.publicationId, ch.sourceCitation, ch.sourceSection)}</p>
    <blockquote class="ri-source-quote">DEMO excerpt — open the publication Source tab for full mock regulatory text.</blockquote>`;

  const aiBody = `
    <p class="ri-body-copy">${esc(ch.aiSummary)}</p>
    ${aiRecommendation({
      recommendation: ch.applicabilityRecommendation,
      confidence: ch.applicabilityConfidence,
      reasoning: ch.applicabilityReasoning,
      citation: ch.sourceCitation,
      pubId: ch.publicationId,
      sectionSlug: ch.sourceSection,
    })}
    <p class="ri-muted"><strong>Likely affected areas:</strong> ${(ch.affectedBusinessLines || []).join(', ')} · ${(ch.affectedProducts || []).join(', ') || '—'}</p>
    ${aiProvenancePanel({ ...ch.aiGovernance, analysisId: ch.currentAnalysisId }, orgFactorBullets(s.orgProfile || {}))}`;

  const humanBody = `
    <p class="ri-muted">Human applicability decision at change level (separate from publication-level applicability on ${esc(pub?.id || 'publication')}).</p>
    <dl class="ri-dl ri-dl--wide">
      <dt>AI recommendation</dt><dd>${badge(ch.applicabilityRecommendation)} <span class="ri-mono">${ch.applicabilityConfidence}%</span></dd>
      <dt>Human decision</dt><dd>${badge(ch.applicabilityDecision || 'Pending')}</dd>
      <dt>Decision recorded by</dt><dd>${esc(ch.decisionMeta?.user || '—')}${ch.decisionMeta?.date ? ` · ${formatDate(ch.decisionMeta.date)}` : ''}</dt>
      <dt>Justification</dt><dd>${esc(ch.decisionMeta?.justification || ch.aiGovernance?.justification || '—')}</dd>
      <dt>Legal entities</dt><dd>${(ch.affectedEntities || []).join(', ')}</dd>
      <dt>Business lines</dt><dd>${(ch.affectedBusinessLines || []).join(', ')}</dd>
      <dt>Products</dt><dd>${(ch.affectedProducts || []).join(', ') || '—'}</dd>
      <dt>Jurisdictions</dt><dd>${(ch.affectedJurisdictions || []).join(', ')}</dd>
    </dl>
    <div class="ri-form__actions" data-change-id="${esc(id)}">
      <button type="button" class="ri-btn ri-btn--sm ri-btn--primary" data-change-applicability="Applicable">Accept: Applicable</button>
      <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-change-applicability="Review Required">Set: Review Required</button>
      <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-change-applicability="Not Applicable">Override: Not Applicable</button>
    </div>
    <div class="ri-form ri-form--panel" data-ai-override-form data-change-id="${esc(id)}">
      <p class="ri-form__legend">Human override of AI recommendation</p>
      <label>Decision <select id="ai-override-decision"><option>Applicable</option><option>Review Required</option><option>Not Applicable</option></select></label>
      <label>Justification <textarea id="ai-override-justification" rows="3" placeholder="Reason for override…"></textarea></label>
      <button type="button" class="ri-btn ri-btn--primary" data-ai-override-save>Record human decision</button>
    </div>`;

  const next = nextActionsPanel('Suggested next actions', [
    ch.applicabilityDecision === 'Applicable' && related.assessments?.length
      ? `Open ${linkRecord('Impact Assessment', related.assessments[0].id, related.assessments[0].id)}`
      : 'Record human applicability decision using the controls below',
    `Review ${linkRecord('Regulatory Publication', ch.publicationId, 'supporting source')}`,
    related.obligations?.length ? `Review ${linkRecord('Obligation', related.obligations[0].id, 'linked obligation')}` : null,
  ].filter(Boolean));

  const provenance = renderIngestionProvenancePanel(id);
  const governance = renderChangeGovernancePanel(id);
  const aiGov = renderChangeAiSummary(id);
  const assurance = renderChangeAssurancePanel(id);

  const iaAi = renderChangeIaPanel(id, s);

  return `
    ${hero}
    ${iaAi}
    ${lifecycle}
    ${traceabilityFlow(traceItems, id)}
    ${next}
    <div class="ri-signature-flow">
      ${intelligenceLabel('Source → AI → Human → Governance → Implementation → Assurance')}
      ${recordLane('02', 'Regulatory source', sourceBody, 'source', `lane-source-${id}`)}
      ${recordLane('03', 'AI interpretation', aiBody, 'ai', `lane-ai-${id}`)}
      ${recordLane('04', 'Human decision / applicability', humanBody, 'human', `lane-human-${id}`)}
    </div>
    ${governance}
    ${assurance}
    ${aiGov}
    ${provenance}
    ${recordLane('01', 'What changed', `<p class="ri-body-copy">${esc(ch.description)}</p><p class="ri-muted"><span class="ri-label">Topic</span> ${esc(ch.topic)}</p>`, 'neutral')}
    ${recordLane(
      '05',
      'Impact',
      `<ul class="ri-bullet-list">${(related.assessments || []).map((a) => `<li>${linkRecord('Impact Assessment', a.id, `${a.id} — ${a.title}`)}</li>`).join('') || '<li class="ri-muted">No linked assessments</li>'}</ul>`,
      'neutral'
    )}
    ${recordLane(
      '06',
      'Governance mapping',
      renderRelatedGroups({
        policies: related.policies,
        risks: related.risks,
        controls: related.controls,
      }) || emptyLane('No policies, risks or controls linked yet.'),
      'neutral'
    )}
    ${recordLane(
      '07',
      'Implementation',
      `<p><span class="ri-label">Actions</span> ${(related.actions || []).map((a) => linkRecord('Action', a.id, a.id)).join(', ') || '—'}</p>
       <p><span class="ri-label">Evidence</span> ${(related.evidence || []).map((e) => linkRecord('Evidence', e.id, e.id)).join(', ') || '—'}</p>
       <p><span class="ri-label">Obligations</span></p>
       <ul class="ri-bullet-list">${(related.obligations || []).map((o) => `<li>${linkRecord('Obligation', o.id, o.statement)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>`,
      'neutral',
      `lane-impl-${id}`
    )}
    ${recordLane('08', 'Timeline', `<ol class="ri-timeline">${timeline.map((t) => `<li><span>${esc(t.label)}</span> ${t.link || ''}</li>`).join('')}</ol>`, 'neutral')}
    ${recordLane('09', 'Audit', renderChangeAudit(id, ch.publicationId), 'neutral')}
    ${renderTraceSection('Regulatory Change', id)}`;
}

function emptyLane(msg) {
  return `<p class="ri-muted">${msg}</p>`;
}

function buildTimeline(ch, related) {
  const pub = getPublication(ch.publicationId);
  const steps = [
    { label: 'Publication detected', link: pub ? `<a href="#/publication/${pub.id}">${esc(pub.id)}</a>` : '' },
    { label: 'Change identified', link: `<a href="#/change/${ch.id}">${esc(ch.id)}</a>` },
    { label: 'Applicability assessed', link: badge(ch.applicabilityDecision || ch.applicabilityRecommendation) },
    ...(related.assessments || []).map((a) => ({
      label: 'Impact assessment',
      link: linkRecord('Impact Assessment', a.id, a.id),
    })),
    ...(related.obligations || []).map((o) => ({
      label: 'Obligation created',
      link: linkRecord('Obligation', o.id, o.id),
    })),
    ...(related.actions || []).slice(0, 2).map((a) => ({
      label: 'Action raised',
      link: linkRecord('Action', a.id, a.id),
    })),
    ...(related.evidence || []).slice(0, 1).map((e) => ({
      label: 'Evidence collected',
      link: linkRecord('Evidence', e.id, e.id),
    })),
    { label: 'Completed', link: ch.status === 'Complete' ? badge('Complete') : '<span class="ri-muted">In progress</span>' },
  ];
  return steps;
}

function renderChangeAudit(changeId, pubId) {
  const events = [
    ...getAuditEventsFor('Regulatory Change', changeId, false),
    ...getAuditEventsFor('Publication', pubId, false).filter((e) => (e.comments || '').includes(changeId)),
  ];
  const uniq = [...new Map(events.map((e) => [e.id, e])).values()];
  const rows = uniq.map(
    (e) => `<tr><td>${new Date(e.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·')}</td><td>${esc(e.user)}</td><td>${esc(e.action)}</td><td>${esc(e.newValue || '—')}</td></tr>`
  );
  return dataTable(['When', 'User', 'Action', 'Detail'], rows, 'No audit events for this change');
}

function renderConnectedChangeOwnerPanel(id, ch) {
  if (!isConnectedChangeWritesEnabled(getState())) return '';
  const s = getState();
  const cat = getConnectedCatalogue(s);
  const members = cat.orgMembers || [];
  const currentOwner = ch.ownerId || '';
  const options = members
    .filter((m) => m.clerkUserId !== currentOwner)
    .map(
      (m) =>
        `<option value="${esc(m.clerkUserId)}">${esc(m.label || m.clerkUserId)}</option>`,
    )
    .join('');
  return `<section class="ri-panel" data-connected-change-owner-panel="${esc(id)}">
    <h2>Assign owner</h2>
    <p class="ri-muted">Current owner: ${esc(getConnectedAssigneeLabel(s, currentOwner))}</p>
    <div class="ri-form__actions">
      <select data-connected-change-owner-select aria-label="Assign owner">
        <option value="">Select authorised member…</option>
        ${options}
      </select>
      <button type="button" class="ri-btn ri-btn--sm ri-btn--primary" data-connected-change-assign data-change-id="${esc(id)}" data-expected-updated-at="${esc(ch.updatedAt || '')}">Assign</button>
    </div>
  </section>`;
}

function renderConnectedChangeStatusPanel(id, ch) {
  if (!isConnectedChangeWritesEnabled(getState())) return '';
  const current = ch.statusCode || 'OPEN';
  const allowed = connectedChangeStatusOptions(current);
  const buttons = allowed
    .map(
      (s) =>
        `<button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-connected-change-status="${esc(s.code)}" data-change-id="${esc(id)}" data-expected-updated-at="${esc(ch.updatedAt || '')}">Set ${esc(s.label)}</button>`,
    )
    .join(' ');
  return `<section class="ri-panel" data-connected-change-status-panel="${esc(id)}">
    <h2>Change status</h2>
    <p class="ri-muted">Current status: ${badge(ch.status)} · Only valid workflow transitions are shown.</p>
    <div class="ri-form__actions">${buttons || '<span class="ri-muted">No further transitions available.</span>'}</div>
  </section>`;
}

function renderConnectedChangeAuditPanel(id) {
  const events = getConnectedEntityWorkflowEvents(getState(), 'regulatory_change', id);
  return `<section class="ri-panel"><h2>Audit history</h2>
    ${renderConnectedWorkflowEventsTable(events, 'No workflow audit events for this change yet')}  </section>`;
}

function renderConnectedChangeMetadataPanel(id, ch) {
  if (!isConnectedChangeWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-change-metadata-panel="${esc(id)}">
    <h2>Change categorisation</h2>
    <div class="ri-form">
      <label>Materiality <input data-connected-change-materiality value="${esc(ch.materiality || '')}" /></label>
      <label>Implementation due <input type="date" data-connected-change-deadline value="${esc(ch.dueDateRaw || ch.implementationDeadline || '')}" /></label>
      <label>Change type <input data-connected-change-type value="${esc(ch.changeType || '')}" /></label>
    </div>
    <button type="button" class="ri-btn ri-btn--sm ri-btn--primary" data-connected-change-metadata-save data-change-id="${esc(id)}" data-expected-updated-at="${esc(ch.updatedAt || '')}">Save metadata</button>
  </section>`;
}

function viewChangeConnected(id, ch) {
  const s = getState();
  const pub = getPublication(ch.publicationId);
  const crumbs = [
    { label: 'Regulatory Intelligence', href: '#/dashboard' },
    { label: 'Regulatory Changes', href: '#/changes' },
    pub ? { label: pub.title || pub.id, href: `#/publication/${pub.id}` } : null,
    { label: ch.externalKey || id.slice(0, 8) },
  ].filter(Boolean);
  const hero = entityHero(ch.externalKey || id.slice(0, 8), ch.title, [
    { label: 'Materiality', value: ch.materiality, badge: true },
    { label: 'Type', value: ch.changeType || '—' },
    { label: 'Owner', value: getConnectedAssigneeLabel(s, ch.ownerId) || ch.ownerLabel || '—' },
    { label: 'Status', value: ch.status, badge: true },
    { label: 'Applicability (persisted)', value: ch.applicabilityRecommendation || 'Pending', badge: true },
    { label: 'Effective', value: formatDate(ch.effectiveDate) },
    { label: 'Implementation due', value: formatDate(ch.dueDate) },
  ], crumbs, {
    eyebrow: 'TENANT REGULATORY CHANGE',
    refs: `${ch.regulator || '—'} · ${ch.regulatoryReference || '—'}`,
    narrative: ch.description || '—',
    actions: pub
      ? `<a class="ri-btn ri-btn--ghost" href="#/publication/${esc(pub.id)}">Open publication</a>`
      : '',
  });
  const impactLinks = (ch.impactIds || [])
    .map((iid) => `<li><a href="#/assessment/${esc(iid)}">${esc(iid.slice(0, 8))}…</a></li>`)
    .join('');
  const oblLinks = (ch.obligationIds || [])
    .map((oid) => `<li><a href="#/obligation/${esc(oid)}">${esc(oid.slice(0, 8))}…</a></li>`)
    .join('');
  return `${connectedCatalogueBanner(s)}
    ${connectedWorkModeBanner(s)}
    ${hero}
    ${renderConnectedChangeOwnerPanel(id, ch)}
    ${renderConnectedChangeMetadataPanel(id, ch)}
    ${renderConnectedChangeStatusPanel(id, ch)}
    ${renderConnectedCreateImpactPanel(id)}
    ${renderConnectedCreateObligationPanel(id)}
    ${renderConnectedChangeAuditPanel(id)}
    <section class="ri-panel"><h2>Source publication</h2>
      ${pub ? `<p>${linkRecord('Publication', pub.id, pub.title)} · ${esc(pub.regulator)}</p>` : '<p class="ri-muted">Publication not in loaded catalogue.</p>'}
    </section>
    <section class="ri-panel"><h2>Linked impact assessments</h2>
      ${impactLinks ? `<ul>${impactLinks}</ul>` : '<p class="ri-muted">No impact assessments linked to this regulatory change.</p>'}
    </section>
    <section class="ri-panel"><h2>Linked obligations</h2>
      ${oblLinks ? `<ul>${oblLinks}</ul>` : '<p class="ri-muted">No obligations linked to this regulatory change.</p>'}
    </section>
    <p class="ri-muted">Demo governance, AI interpretation, and assurance panels remain hidden in connected mode.</p>`;
}
