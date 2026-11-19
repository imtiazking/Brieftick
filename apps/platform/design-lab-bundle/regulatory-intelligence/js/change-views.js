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

export function viewChange(id) {
  const ch = getChange(id);
  if (!ch) return notFoundState('Regulatory Change', id);
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
