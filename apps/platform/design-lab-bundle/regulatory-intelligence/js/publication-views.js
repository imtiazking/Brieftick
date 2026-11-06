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
  formatDateTime,
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
import { isConnectedBackendActive } from './platform/connected-mode.js';
import { connectedCatalogueBanner, getConnectedAssigneeLabel } from './platform/connected-catalogue.js';
import { getViewAiAnalysisRunsForPublication } from './store.js';

const PUB_TABS = ['Overview', 'Source', 'Changes', 'AI Analysis', 'Applicability', 'Related Records', 'Audit History'];

export function viewPublication(routeParts) {
  const id = routeParts[0];
  const tabSlug = routeParts[1] || 'overview';
  const highlightSection = routeParts[2] || null;
  const activeTab = normalizePublicationTab(tabSlug);

  const p = getPublication(id);
  if (!p) return notFoundState('Publication', id);

  const s = getState();
  const connected = isConnectedBackendActive(s);
  const related = connected ? { changes: (p._detail?.changes || []).map((c) => ({ id: c.id, title: c.title })) } : collectRelatedForPublication(id);
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
      panel = connected ? renderPublicationAiTabConnected(p) : renderAiTab(p, analysis);
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

  const refLabel = connected && p.display ? p.display.reference : p.reference;
  const typeLabel = connected && p.display ? p.display.publicationType : p.publicationType;
  const heroRefs = connected && p.display ? `${refLabel} · ${typeLabel}` : `${p.id} · ${p.reference}`;
  const crumbLabel = connected && p.display && refLabel !== '—' ? refLabel : p.id;
  return `
    ${entityHero(p.id, p.title, [
      { label: 'Regulator', value: p.regulator, badge: true },
      { label: 'Reference', value: refLabel, mono: true },
      {
        label: 'Priority',
        value: connected && p.display ? p.display.aiPriority : p.priority,
        badge: true,
      },
      {
        label: 'Applicability',
        value: connected && p.display ? p.display.classification : p.applicabilityDecision || p.applicabilityRecommendation,
        badge: true,
      },
      {
        label: 'Workflow',
        value: connected && p.display ? p.display.triage : p.workflowStatus,
        badge: true,
      },
      { label: 'Effective', value: formatDate(p.effectiveDate) },
    ], [
      { label: 'Regulatory Intelligence', href: '#/dashboard' },
      { label: 'Publications', href: '#/library' },
      { label: crumbLabel },
    ], {
      eyebrow: 'REGULATORY PUBLICATION',
      refs: heroRefs,
      narrative: connected ? (p.summary || '') : p.aiSummary,
    })}
    ${connected ? connectedCatalogueBanner(s) : '<p class="ri-mock-inline">Mock regulatory publication — synthetic DEMO text only.</p>'}
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
  const connected = isConnectedBackendActive(s);
  if (connected && p.display) {
    const d = p.display;
    return `
    <div class="ri-detail-grid" data-tab-panel="Overview">
      <dl class="ri-dl">
        <dt>Regulator</dt><dd>${esc(p.regulator)}</dd>
        <dt>Reference</dt><dd>${esc(d.reference)} <span class="ri-muted">(${esc(d.referenceSource)})</span></dd>
        <dt>Type</dt><dd>${esc(d.publicationType)}</dd>
        <dt>Published</dt><dd>${formatDate(p.publishedDate)}</dd>
        <dt>Effective</dt><dd>${formatDate(p.effectiveDate)}</dd>
        <dt>Detected / retrieved</dt><dd>${d.detectedAt ? formatDate(d.detectedAt) : '—'}</dd>
        <dt>Classification</dt><dd>${esc(d.classification)}</dd>
        <dt>Triage</dt><dd>${esc(d.triage)}</dd>
        <dt>Catalogue kind</dt><dd>${esc(d.catalogueKind)} · ${esc(d.dataOriginLabel)}</dd>
        <dt>Ingestion versions</dt><dd>${esc(d.libraryStatus)} · ${esc(d.libraryVersion)} <span class="ri-muted">(${esc(d.libraryVersionSource)}; not extraction revisions)</span></dd>
        <dt>Consultation deadline</dt><dd>${
          p.consultationDeadline || d.consultationDeadlineStructured
            ? formatDate(p.consultationDeadline || d.consultationDeadlineStructured)
            : d.consultationDeadlineCandidate
              ? `${formatDate(d.consultationDeadlineCandidate)} <span class="ri-muted">(unverified — parsed from summary text)</span>`
              : '—'
        }</dd>
      </dl>
      <div>
        <p class="ri-muted">Topic (summary or type): ${esc(d.topic)}</p>
        <h4 class="ri-subhead">Linked regulatory changes</h4>
        <ul>${related.changes.map((c) => `<li><a href="#/change/${c.id}">${esc(c.id)}</a> — ${esc(c.title)}</li>`).join('') || '<li class="ri-muted">None persisted for tenant</li>'}</ul>
      </div>
    </div>`;
  }
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
  const p = getPublication(pubId);
  if (isConnectedBackendActive(s) && p?.sourceUrl) {
    const detail = p._detail;
    const versions = detail?.versions || [];
    return `<div class="ri-source-read" data-tab-panel="Source">
      <p><span class="ri-label">Canonical URL</span> <a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.sourceUrl)}</a></p>
      <p><span class="ri-label">Data origin</span> ${esc(p.dataOrigin || detail?.publication?.data_origin || 'catalogue')}</p>
      ${
        versions.length
          ? `<h3>regulatory_publication_versions (${versions.length})</h3><ul class="ri-list-compact">${versions.map((v) => `<li>v${esc(String(v.version_number))} · retrieved ${esc(v.retrieved_at || '—')}</li>`).join('')}</ul>`
          : p.display?.libraryVersionSource === 'regulatory_publications.source_hash'
            ? `<p class="ri-muted">No regulatory_publication_versions rows visible; ingestion fingerprint present on publication (source_hash / source_version).</p>`
            : '<p class="ri-muted">No regulatory_publication_versions rows for this publication.</p>'
      }
    </div>`;
  }
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
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const changes = getChangesForPublication(pubId);
  if (!changes.length) {
    return connected
      ? `<p class="ri-muted">No operational or authorised UAT regulatory changes are linked to this publication in the connected staging register. Unverified tenant rows are listed only in the Regulatory Changes audit view.</p>`
      : '<p class="ri-muted">No regulatory changes identified.</p>';
  }
  return changes
    .map((c) => {
      const ias = (c.linkedAssessmentIds || []).map((id) => getAssessment(id)).filter(Boolean);
      const obls = (c.linkedObligationIds || []).map((id) => getObligation(id)).filter(Boolean);
      const owner = connected ? getConnectedAssigneeLabel(s, c.ownerId) : '—';
      const pub = getPublication(c.publicationId);
      const pubLabel = c.publicationTitle || pub?.title || c.publicationId;
      const prov = connected ? badge(c.labClassificationLabel || c.labClassification || '—') : '';
      return `
      <article class="ri-change-card">
        <header>
          <a href="#/change/${c.id}"><strong>${esc(c.id.slice(0, 8))}…</strong></a>
          <h3><a href="#/change/${c.id}">${esc(c.title)}</a></h3>
        </header>
        <p>${esc(c.description || '')}</p>
        <dl class="ri-dl ri-dl--compact">
          ${connected ? `<dt>Provenance</dt><dd>${prov}</dd>` : ''}
          <dt>Publication</dt><dd><a href="#/publication/${esc(c.publicationId)}">${esc(pubLabel)}</a></dd>
          <dt>Owner</dt><dd>${esc(owner)}</dd>
          <dt>Implementation deadline</dt><dd>${c.dueDate ? formatDate(c.dueDate) : '—'}</dd>
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

function renderPublicationAiTabConnected(p) {
  const runs = getViewAiAnalysisRunsForPublication(p.id);
  if (!runs.length) {
    return `<p class="ri-muted">No persisted AI analysis runs are linked to this publication in the connected staging register. Completed analyses appear here when tenant APIs return operational or authorised UAT runs for this record.</p>`;
  }
  const rows = runs.map((r) => {
    const preview = r.findingsPreview ? esc(String(r.findingsPreview).slice(0, 120)) + (String(r.findingsPreview).length > 120 ? '…' : '') : '—';
    return `<tr>
      <td><a href="#/ai-analysis/${esc(r.id)}">${esc(r.useCaseId || '—')}</a></td>
      <td>${esc(r.provider || '—')}</td>
      <td>${esc(r.model || '—')}</td>
      <td>${badge(r.executionStatus || '—')}</td>
      <td>${formatDateTime(r.completedAt || r.createdAt)}</td>
      <td>${badge(r.labClassificationLabel || r.labClassification || '—')}</td>
      <td>${preview}</td>
      <td>${r.claimsCount != null ? esc(String(r.claimsCount)) : '—'}</td>
    </tr>`;
  });
  return `<section class="ri-panel">
    <h3>Persisted AI analyses (connected staging)</h3>
    <p class="ri-muted">${runs.length} run(s) for this publication — open a row to inspect findings, citations and review status.</p>
    ${dataTable(
      ['Use case', 'Provider', 'Model', 'Execution', 'Completed', 'Classification', 'Findings preview', 'Claims'],
      rows,
    )}
  </section>`;
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
