import {
  getState,
  getPublication,
  getChange,
  getAssessment,
  getObligation,
  scenarioFilter,
} from './store.js';
import {
  collectRelatedForPublication,
  getChangesForPublication,
  getAuditEventsFor,
  normalizePublicationTab,
  tabToSlug,
  publicationSourceHref,
} from './relationships.js';
import {
  esc,
  badge,
  aiRecommendation,
  aiProvenancePanel,
  dataTable,
  pageHeader,
  detailTabs,
  formatDate,
  linkRecord,
  renderCitation,
  renderRelatedGroups,
  renderTraceSection,
  notFoundState,
  entityHero,
  intelligenceLabel,
} from './components.js';
import { orgFactorBullets } from './seed-operational.js';
import { getCurrentAnalysis } from './ai-governance-helpers.js';
import { renderAiSummaryPanel } from './ai-summary-ui.js';
import { renderChangeAnalysisPanel } from './ai-workflow-ui.js';
import { canGenerateAiSummary, canMutateAiReviewState, isAuditorReadOnly } from './ai/persona-ai.js';

const PUB_TABS = ['Overview', 'Source', 'Changes', 'AI Analysis', 'Applicability', 'Related Records', 'Audit History'];

export function viewPublication(routeParts) {
  const id = routeParts[0];
  const tabSlug = routeParts[1] || 'overview';
  const highlightSection = routeParts[2] || null;
  const activeTab = normalizePublicationTab(tabSlug);

  const p = getPublication(id);
  if (!p) return notFoundState('Publication', id);

  const s = getState();
  const related = collectRelatedForPublication(id);
  const analysis = s.publicationAnalysis?.[id];
  const override = s.applicabilityOverrides?.[id];
  const decisionMeta = p.decisionMeta || override;

  const tabsHtml = detailTabs(PUB_TABS, activeTab, id);

  let panel = '';
  switch (activeTab) {
    case 'Overview':
      panel = renderOverview(p, related);
      break;
    case 'Source':
      panel = renderSource(id, highlightSection);
      break;
    case 'Changes':
      panel = renderChangesTab(id);
      break;
    case 'AI Analysis':
      panel = renderAiTab(p, analysis);
      break;
    case 'Applicability':
      panel = renderApplicabilityTab(p, decisionMeta);
      break;
    case 'Related Records':
      panel = renderRelatedGroups(related);
      break;
    case 'Audit History':
      panel = renderAuditTab(id);
      break;
    default:
      panel = renderOverview(p, related);
  }

  return `
    ${entityHero(p.id, p.title, [
      { label: 'Regulator', value: p.regulator, badge: true },
      { label: 'Reference', value: p.reference, mono: true },
      { label: 'Priority', value: p.priority, badge: true },
      { label: 'Applicability', value: p.applicabilityDecision || p.applicabilityRecommendation, badge: true },
      { label: 'Workflow', value: p.workflowStatus, badge: true },
      { label: 'Effective', value: formatDate(p.effectiveDate) },
    ], [
      { label: 'Regulatory Intelligence', href: '#/dashboard' },
      { label: 'Publications', href: '#/library' },
      { label: p.id },
    ], {
      eyebrow: 'REGULATORY PUBLICATION',
      refs: `${p.id} · ${p.reference}`,
      narrative: p.aiSummary,
    })}
    <p class="ri-mock-inline">Mock regulatory publication — synthetic DEMO text only.</p>
    ${tabsHtml}
    <div class="ri-tab-panels" data-pub-id="${esc(id)}" data-highlight-section="${esc(highlightSection || '')}">
      ${panel}
    </div>
    <div class="ri-detail-actions">
      <a class="ri-btn ri-btn--primary" href="#/applicability/${id}">Full applicability workflow</a>
      <a class="ri-btn ri-btn--ghost" href="#/version/${id}">Version intelligence</a>
    </div>
    ${renderTraceSection('Publication', id)}`;
}

function renderOverview(p, related) {
  const s = getState();
  const aiPanel = renderAiSummaryPanel(p.id, s, {
    canGenerate: canGenerateAiSummary(s),
    canReview: canMutateAiReviewState(s),
    isAuditor: isAuditorReadOnly(s),
  });
  const changeAiPanel = renderChangeAnalysisPanel(p.id, s);
  return `
    ${aiPanel}
    ${changeAiPanel}
    <div class="ri-detail-grid" data-tab-panel="Overview">
      <dl class="ri-dl">
        <dt>Regulator</dt><dd>${esc(p.regulator)}</dd>
        <dt>Reference</dt><dd>${esc(p.reference)}</dd>
        <dt>Type</dt><dd>${esc(p.publicationType)}</dd>
        <dt>Published</dt><dd>${formatDate(p.publishedDate)}</dd>
        <dt>Effective</dt><dd>${formatDate(p.effectiveDate)}</dd>
        <dt>Consultation</dt><dd>${formatDate(p.consultationDeadline)}</dd>
        <dt>Topic</dt><dd>${esc(p.topic)}</dd>
        <dt>Priority</dt><dd>${badge(p.priority)}</dd>
        <dt>Applicability</dt><dd>${badge(p.applicabilityDecision || p.applicabilityRecommendation)}</dd>
        <dt>Workflow</dt><dd>${badge(p.workflowStatus)}</dd>
      </dl>
      <div>
        <h3>FORGENIQ Summary</h3>
        <p>${esc(p.aiSummary)}</p>
        <h4 class="ri-subhead">Linked regulatory changes</h4>
        <ul>${related.changes.map((c) => `<li><a href="#/change/${c.id}">${esc(c.id)}</a> — ${esc(c.title)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
      </div>
    </div>`;
}

function renderSource(pubId, highlightSection) {
  const s = getState();
  const doc = s.sourceDocuments?.[pubId];
  if (!doc) {
    return `<p class="ri-muted">No mock source document for this publication.</p>`;
  }
  return `
    <div class="ri-source-read" data-tab-panel="Source">
    <header class="ri-source-read__head">
      ${intelligenceLabel('SOURCE READING')}
      <h2 class="ri-source-read__title">${esc(doc.metadata.reference)}</h2>
      <p class="ri-source-read__sub">${esc(doc.metadata.regulator)} · ${esc(doc.metadata.documentType)} · ${esc(doc.label)}</p>
    </header>
    <aside class="ri-source-read__meta">
      <dl class="ri-dl ri-dl--compact">
        <dt>Official reference</dt><dd class="ri-mono">${esc(doc.metadata.reference)}</dd>
        <dt>Mock URL</dt><dd class="ri-mono">${esc(doc.metadata.mockUrl)}</dd>
        <dt>Version</dt><dd>Mock regulatory text (DEMO)</dd>
      </dl>
    </aside>
    <div class="ri-source-doc">
      ${doc.sections
        .map((sec) => {
          const slug = sec.citationSlug || sec.id;
          const hi = highlightSection && (highlightSection === slug || highlightSection === sec.id);
          return `
        <section class="ri-source-section${hi ? ' is-highlight' : ''}" id="source-${esc(slug)}" data-source-section="${esc(slug)}">
          <h3>${esc(sec.heading)}</h3>
          ${sec.citation ? `<p class="ri-citation-label">${renderCitation(pubId, sec.citation, sec.citationSlug || sec.id)}</p>` : ''}
          ${(sec.paragraphs || []).map((para) => `<p class="ri-source-para">${esc(para)}</p>`).join('')}
        </section>`;
        })
        .join('')}
    </div>
    </div>`;
}

function renderChangesTab(pubId) {
  const changes = getChangesForPublication(pubId);
  if (!changes.length) return '<p class="ri-muted">No regulatory changes identified.</p>';
  return changes
    .map((c) => {
      const ias = (c.linkedAssessmentIds || []).map((id) => getAssessment(id)).filter(Boolean);
      const obls = (c.linkedObligationIds || []).map((id) => getObligation(id)).filter(Boolean);
      return `
      <article class="ri-change-card">
        <header>
          <a href="#/change/${c.id}"><strong>${esc(c.id)}</strong></a>
          <h3><a href="#/change/${c.id}">${esc(c.title)}</a></h3>
        </header>
        <p>${esc(c.description)}</p>
        <dl class="ri-dl ri-dl--compact">
          <dt>Citation</dt><dd>${renderCitation(pubId, c.sourceCitation, c.sourceSection)}</dd>
          <dt>Effective</dt><dd>${formatDate(c.effectiveDate)}</dd>
          <dt>Materiality</dt><dd>${badge(c.materiality)}</dd>
          <dt>Status</dt><dd>${badge(c.status)}</dd>
          <dt>Change applicability</dt><dd>${badge(c.applicabilityDecision || c.applicabilityRecommendation)}</dd>
        </dl>
        <p><strong>Impact assessments:</strong> ${ias.map((a) => linkRecord('Impact Assessment', a.id, a.id)).join(', ') || '—'}</p>
        <p><strong>Obligations:</strong> ${obls.map((o) => linkRecord('Obligation', o.id, o.id)).join(', ') || '—'}</p>
        <a class="ri-btn ri-btn--sm" href="#/change/${c.id}">Open change</a>
      </article>`;
    })
    .join('');
}

function renderAiTab(p, analysis) {
  if (!analysis) {
    return `<p class="ri-muted">No publication-level AI analysis mock for this record.</p>`;
  }
  return `
    <section class="ri-panel">
      <h3>What changed?</h3>
      <p>${esc(analysis.whatChanged)}</p>
    </section>
    <section class="ri-panel">
      <h3>Why it matters</h3>
      <p>${esc(analysis.whyItMatters)}</p>
    </section>
    <section class="ri-panel">
      <h3>Who may be affected?</h3>
      <ul class="ri-list-compact">
        <li>Legal entities: ${(analysis.whoAffected.entities || []).join(', ')}</li>
        <li>Products: ${(analysis.whoAffected.products || []).join(', ')}</li>
        <li>Business lines: ${(analysis.whoAffected.businessLines || []).join(', ')}</li>
        <li>Customer types: ${(analysis.whoAffected.customerTypes || []).join(', ')}</li>
        <li>Functions: ${(analysis.whoAffected.functions || []).join(', ')}</li>
      </ul>
    </section>
    <section class="ri-panel">
      <h3>Key dates</h3>
      <ul>${(analysis.keyDates || []).map((d) => `<li>${esc(d.label)}: ${formatDate(d.date)}</li>`).join('')}</ul>
    </section>
    <section class="ri-panel">
      <h3>Suggested next steps</h3>
      <ul>${(analysis.suggestedSteps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    </section>
    ${aiRecommendation({
      recommendation: p.applicabilityRecommendation,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      citation: analysis.citation,
      pubId: p.id,
      sectionSlug: analysis.citationSection,
    })}
    ${(() => {
      const cur = getCurrentAnalysis(getState(), 'Publication', p.id);
      const link = cur ? `<p><a href="#/ai-analysis/${esc(cur.id)}">View canonical AI analysis ${esc(cur.id)}</a> · Grounding: ${badge(cur.groundingStatus)}</p>` : '';
      return link + aiProvenancePanel({ ...analysis.aiGovernance, analysisId: analysis.analysisId || cur?.id }, orgFactorBullets(getState().orgProfile || {}));
    })()}`;
}

function renderApplicabilityTab(p, decisionMeta) {
  const s = getState();
  const changes = getChangesForPublication(p.id);
  return `
    <div class="ri-panel">
      <h3>Publication-level applicability</h3>
      <p class="ri-muted">Distinct from each Regulatory Change below.</p>
      ${aiRecommendation({
        recommendation: p.applicabilityDecision || p.applicabilityRecommendation,
        confidence: p.applicabilityConfidence,
        reasoning: 'ABC Financial Ltd provides retail financial products within UK Consumer Duty scope (DEMO).',
        citation: p.id === 'PUB-001' ? 'FCA PS26/14 §3.12–3.18' : null,
        pubId: p.id,
        sectionSlug: '3.12-3.18',
      })}
      <dl class="ri-dl">
        <dt>Human decision</dt><dd>${esc(p.applicabilityDecision || 'Pending')}</dd>
        <dt>Decision maker</dt><dd>${esc(decisionMeta?.user || '—')}</dd>
        <dt>Decision date</dt><dd>${decisionMeta?.at ? formatDate(decisionMeta.at.slice(0, 10)) : '—'}</dd>
        <dt>Justification</dt><dd>${esc(decisionMeta?.justification || '—')}</dd>
      </dl>
      <a class="ri-btn ri-btn--primary" href="#/applicability/${p.id}">Open full Applicability Assessment</a>
    </div>
    <div class="ri-panel">
      <h3>Regulatory change applicability (entity-level)</h3>
      <ul class="ri-change-appl-list">
        ${changes
          .map(
            (c) => `
          <li>
            <a href="#/change/${c.id}">${esc(c.id)}</a> — ${badge(c.applicabilityDecision || c.applicabilityRecommendation)}
            <span class="ri-muted">${esc(c.title)}</span>
          </li>`
          )
          .join('')}
      </ul>
    </div>`;
}

function renderAuditTab(pubId) {
  const events = getAuditEventsFor('Publication', pubId, true);
  const rows = events.map(
    (e) => `<tr>
      <td>${formatDate((e.timestamp || '').slice(0, 10))} ${new Date(e.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${esc(e.user)}</td>
      <td>${esc(e.action)}</td>
      <td>${esc(e.recordType)} ${esc(e.recordId)}</td>
      <td>${esc(e.newValue || e.comments || '—')}</td>
    </tr>`
  );
  return dataTable(['When', 'User', 'Action', 'Record', 'Detail'], rows, 'No audit events for this publication');
}

export function publicationTabHref(pubId, tabName, section) {
  const slug = tabToSlug(tabName);
  if (slug === 'source' && section) return `#/publication/${pubId}/source/${section}`;
  if (slug === 'overview') return `#/publication/${pubId}`;
  return `#/publication/${pubId}/${slug}`;
}
