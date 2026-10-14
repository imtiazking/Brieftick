import { routeForRecord, buildTraceFrom } from './store.js';
import { publicationSourceHref, tabToSlug } from './relationships.js';

export function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function badge(text, kind = 'default') {
  const cls = {
    High: 'ri-badge ri-badge--high',
    Medium: 'ri-badge ri-badge--med',
    Low: 'ri-badge ri-badge--low',
    Complete: 'ri-badge ri-badge--ok',
    'In Progress': 'ri-badge ri-badge--progress',
    Overdue: 'ri-badge ri-badge--danger',
    Draft: 'ri-badge ri-badge--muted',
    Applicable: 'ri-badge ri-badge--ok',
    'Likely Applicable': 'ri-badge ri-badge--progress',
    'Possibly Applicable': 'ri-badge ri-badge--med',
    'Not Applicable': 'ri-badge ri-badge--muted',
    New: 'ri-badge ri-badge--progress',
    Assigned: 'ri-badge ri-badge--progress',
    'Review Required': 'ri-badge ri-badge--warn',
    'In Review': 'ri-badge ri-badge--warn',
    Accepted: 'ri-badge ri-badge--ok',
    Escalated: 'ri-badge ri-badge--danger',
    Approved: 'ri-badge ri-badge--ok',
    Rejected: 'ri-badge ri-badge--danger',
    'Returned for Changes': 'ri-badge ri-badge--warn',
    'Submitted for Review': 'ri-badge ri-badge--warn',
    Review: 'ri-badge ri-badge--warn',
    Implementation: 'ri-badge ri-badge--progress',
    'Due Soon': 'ri-badge ri-badge--warn',
    'On Track': 'ri-badge ri-badge--ok',
    'Awaiting Approval': 'ri-badge ri-badge--warn',
    Pending: 'ri-badge ri-badge--muted',
    FCA: 'ri-badge ri-badge--muted',
    PRA: 'ri-badge ri-badge--muted',
  }[text] || 'ri-badge';
  return `<span class="${cls}" title="${esc(text)}">${esc(text)}</span>`;
}

export function renderCitation(pubId, citationLabel, sectionSlug) {
  if (!citationLabel) return '—';
  const href = publicationSourceHref(pubId, sectionSlug || null);
  return `<a class="ri-cite-link" href="${href}" data-cite-href="${href}">${esc(citationLabel)}</a>`;
}

export function aiRecommendation({ recommendation, confidence, reasoning, citation, pubId, sectionSlug }) {
  const cite = citation ? renderCitation(pubId, citation, sectionSlug) : '';
  return `
    <div class="ri-ai-box" data-ai-box>
      <div class="ri-ai-box__head">
        <span class="ri-ai-box__label">FORGENIQ AI · DEMO</span>
        <button type="button" class="ri-why-btn" data-why-toggle aria-expanded="false">Why?</button>
      </div>
      <div class="ri-ai-box__rec"><span>AI recommendation</span><strong>${esc(recommendation)}</strong></div>
      <div class="ri-ai-box__conf"><span>Confidence</span><strong>${confidence != null ? `${confidence}%` : '—'}</strong></div>
      <div class="ri-ai-box__why" hidden data-why-panel>
        <p>${esc(reasoning)}</p>
        ${cite ? `<p class="ri-ai-box__source"><span>Supporting source</span> ${cite}</p>` : ''}
      </div>
    </div>`;
}

export function aiProvenancePanel(meta = {}, orgFactors = []) {
  if (!meta || !Object.keys(meta).length) return '';
  return `
    <details class="ri-provenance">
      <summary>AI provenance (DEMO)</summary>
      <dl class="ri-dl ri-dl--compact">
        <dt>Analysis engine</dt><dd>FORGENIQ Regulatory Intelligence AI — Demo</dd>
        <dt>Analysis version</dt><dd>${esc(meta.modelVersion || 'RI-DEMO-2.1')}</dd>
        <dt>Generated</dt><dd>${esc(meta.generatedAt ? new Date(meta.generatedAt).toLocaleString('en-GB') : '—')}</dd>
        <dt>Organisation profile</dt><dd>${esc(meta.orgProfileVersion || 'ORG-DEMO-04')}</dd>
        <dt>Human review</dt><dd>${esc(meta.humanReviewStatus || '—')}</dd>
        ${meta.analysisId ? `<dt>Analysis record</dt><dd><a href="#/ai-analysis/${esc(meta.analysisId)}">${esc(meta.analysisId)}</a></dd>` : ''}
      </dl>
      ${orgFactors.length ? `<p class="ri-muted"><strong>Organisation profile factors</strong></p><ul>${orgFactors.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    </details>`;
}

export function traceChain(items, currentId = null) {
  if (!items?.length) return emptyState('No lineage available for this record.');
  return `<nav class="ri-trace" aria-label="Traceability">${items
    .map((item, i) => {
      const isCurrent = currentId && item.id === currentId;
      const cls = isCurrent ? 'ri-trace__link is-current' : 'ri-trace__link';
      const aria = isCurrent ? ' aria-current="location"' : '';
      return `${i ? '<span class="ri-trace__arrow" aria-hidden="true">→</span>' : ''}<a class="${cls}" href="${routeForRecord(item.type, item.id)}"${aria}><span class="ri-trace__type">${esc(item.type)}</span> <em class="ri-trace__id">${esc(item.id)}</em></a>`;
    })
    .join('')}</nav>`;
}

export function moduleCard(num, title, mainValue, lines = []) {
  return `
    <article class="ri-module">
      <header class="ri-module__head"><span class="ri-module__num">${esc(num)}</span><h3>${esc(title)}</h3></header>
      <p class="ri-module__value">${esc(mainValue)}</p>
      <ul class="ri-module__meta">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
    </article>`;
}

export function dataTable(headers, rows, empty = 'No records') {
  if (!rows.length) return emptyState(empty);
  return `
    <div class="ri-table-wrap">
      <table class="ri-table">
        <thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}

export function emptyState(message, hint = '') {
  return `<div class="ri-empty"><p class="ri-empty__title">${esc(message)}</p>${hint ? `<p class="ri-empty__hint">${esc(hint)}</p>` : ''}</div>`;
}

export function breadcrumbs(items) {
  if (!items?.length) return '';
  return `<nav class="ri-breadcrumbs" aria-label="Breadcrumb"><ol>${items
    .map((c, i) => {
      const last = i === items.length - 1;
      const inner = c.href && !last ? `<a href="${esc(c.href)}">${esc(c.label)}</a>` : `<span aria-current="page">${esc(c.label)}</span>`;
      return `<li>${inner}</li>`;
    })
    .join('')}</ol></nav>`;
}

export function intelligenceLabel(text) {
  return `<p class="ri-intel-label">${esc(text)}</p>`;
}

export function sectionHeader(eyebrow, title, narrative = '') {
  return `
    <header class="ri-section-head">
      ${eyebrow ? intelligenceLabel(eyebrow) : ''}
      <h2 class="ri-section-head__title">${esc(title)}</h2>
      ${narrative ? `<p class="ri-section-head__sub">${narrative}</p>` : ''}
    </header>`;
}

export function metric(label, value, hint = '') {
  return `
    <div class="ri-metric">
      <span class="ri-metric__label">${esc(label)}</span>
      <span class="ri-metric__value">${value}</span>
      ${hint ? `<span class="ri-metric__hint">${esc(hint)}</span>` : ''}
    </div>`;
}

/**
 * @param {string|{title:string,subtitle?:string,eyebrow?:string,meta?:string,actions?:string,variant?:string}} title
 */
export function pageHeader(title, subtitle = '', extraClass = '') {
  const opts =
    title && typeof title === 'object'
      ? title
      : { title, subtitle, variant: extraClass };
  const cls = opts.variant ? ` ri-page-head--${opts.variant}` : '';
  const eyebrow = opts.eyebrow ? intelligenceLabel(opts.eyebrow) : '';
  const meta = opts.meta ? `<div class="ri-page-head__meta">${opts.meta}</div>` : '';
  const actions = opts.actions ? `<div class="ri-page-head__actions">${opts.actions}</div>` : '';
  const sub = opts.subtitle ? `<p class="ri-page-head__sub">${opts.subtitle}</p>` : '';
  return `<header class="ri-page-head${cls}">
    ${eyebrow}
    <div class="ri-page-head__row">
      <div class="ri-page-head__copy">
        <h1>${esc(opts.title)}</h1>
        ${sub}
        ${meta}
      </div>
      ${actions}
    </div>
  </header>`;
}

/** @param {{label:string,value:string,badge?:boolean,mono?:boolean}[]} meta */
export function entityHero(recordId, title, meta = [], crumbs = [], opts = {}) {
  const metaHtml = meta
    .filter((m) => m.value)
    .map((m) => `<div class="ri-entity-hero__chip"><span class="ri-entity-hero__chip-label">${esc(m.label)}</span><span class="ri-entity-hero__chip-value${m.mono ? ' ri-mono' : ''}">${m.badge ? badge(m.value) : esc(m.value)}</span></div>`)
    .join('');
  const eyebrow = opts.eyebrow ? intelligenceLabel(opts.eyebrow) : '';
  const refs = opts.refs ? `<p class="ri-entity-hero__refs ri-mono">${opts.refs}</p>` : `<p class="ri-entity-hero__id ri-mono">${esc(recordId)}</p>`;
  const narrative = opts.narrative ? `<p class="ri-entity-hero__narrative">${esc(opts.narrative)}</p>` : '';
  const actions = opts.actions ? `<div class="ri-entity-hero__actions">${opts.actions}</div>` : '';
  return `
    ${crumbs.length ? breadcrumbs(crumbs) : ''}
    <header class="ri-entity-hero">
      ${eyebrow}
      ${refs}
      <h1 class="ri-entity-hero__title">${esc(title)}</h1>
      ${narrative}
      ${metaHtml ? `<div class="ri-entity-hero__meta">${metaHtml}</div>` : ''}
      ${actions}
    </header>`;
}

export function lifecycleFlow(stages) {
  if (!stages?.length) return '';
  return `
    <nav class="ri-lifecycle" aria-label="Regulatory lifecycle from source to assurance">
      <ol class="ri-lifecycle__list">
        ${stages
          .map((s, i) => {
            const href = s.href || '#';
            const state = s.state ? `<span class="ri-lifecycle__state">${s.state}</span>` : '';
            return `<li class="ri-lifecycle__item ri-lifecycle__item--${esc(s.variant || 'neutral')}${s.current ? ' is-current' : ''}">
              <a class="ri-lifecycle__link" href="${esc(href)}">
                <span class="ri-lifecycle__label">${esc(s.label)}</span>
                ${state}
              </a>
              ${i < stages.length - 1 ? '<span class="ri-lifecycle__sep" aria-hidden="true">→</span>' : ''}
            </li>`;
          })
          .join('')}
      </ol>
    </nav>`;
}

export function traceabilityFlow(items, currentId = null) {
  if (!items?.length) return '';
  return `
    <section class="ri-trace-flow" aria-label="Record traceability">
      <p class="ri-intel-label">Traceability</p>
      ${traceChain(items, currentId)}
    </section>`;
}

export function executiveSummary({ eyebrow, title, narrative, meta = '', aside = '' }) {
  return `
    <section class="ri-exec-summary">
      ${eyebrow ? intelligenceLabel(eyebrow) : ''}
      <h2 class="ri-exec-summary__title">${title}</h2>
      ${narrative ? `<p class="ri-exec-summary__narrative">${narrative}</p>` : ''}
      ${meta ? `<div class="ri-exec-summary__meta">${meta}</div>` : ''}
      ${aside ? `<div class="ri-exec-summary__aside">${aside}</div>` : ''}
    </section>`;
}

export function attentionItem({ severity, title, context, owner, age, href, nextAction }) {
  const sev = (severity || 'medium').toLowerCase();
  return `
    <article class="ri-attention-item ri-attention-item--${esc(sev)}">
      <div class="ri-attention-item__head">
        <span class="ri-attention-item__severity">${badge(severity)}</span>
        <h3 class="ri-attention-item__title"><a href="${esc(href || '#')}">${esc(title)}</a></h3>
      </div>
      ${context ? `<p class="ri-attention-item__context">${context}</p>` : ''}
      <dl class="ri-attention-item__meta">
        ${owner ? `<div><dt>Owner</dt><dd>${esc(owner)}</dd></div>` : ''}
        ${age ? `<div><dt>Age</dt><dd>${esc(age)}</dd></div>` : ''}
        ${nextAction ? `<div><dt>Next action</dt><dd>${nextAction}</dd></div>` : ''}
      </dl>
    </article>`;
}

export function recordLane(num, label, bodyHtml, variant = 'default', sectionId = '') {
  const idAttr = sectionId ? ` id="${esc(sectionId)}"` : '';
  return `
    <section class="ri-lane ri-lane--${esc(variant)}"${idAttr}>
      <div class="ri-lane__head"><span class="ri-lane__num">${esc(num)}</span><h2 class="ri-lane__title">${esc(label)}</h2></div>
      <div class="ri-lane__body">${bodyHtml}</div>
    </section>`;
}

export function notFoundState(entityType, id) {
  return `
    ${breadcrumbs([{ label: 'Regulatory Intelligence', href: '#/dashboard' }, { label: entityType, href: '#' }, { label: id || 'Not found' }])}
    <div class="ri-not-found">
      <h1 class="ri-not-found__title">Record not found</h1>
      <p class="ri-not-found__body">The requested <strong>${esc(entityType)}</strong>${id ? ` (<span class="ri-mono">${esc(id)}</span>)` : ''} could not be found in the current demo dataset.</p>
      <div class="ri-not-found__actions">
        <a class="ri-btn ri-btn--primary" href="#/dashboard">Back to dashboard</a>
        <a class="ri-btn ri-btn--ghost" href="#/admin">Administration</a>
      </div>
    </div>`;
}

export function detailTabs(tabs, active, pubId) {
  return `<div class="ri-tabs" role="tablist">${tabs
    .map((t) => {
      const slug = tabToSlug(t);
      const href = pubId
        ? slug === 'overview'
          ? `#/publication/${pubId}`
          : `#/publication/${pubId}/${slug}`
        : '#';
      return `<a role="tab" class="ri-tabs__btn${t === active ? ' is-active' : ''}" href="${href}" aria-selected="${t === active}">${esc(t)}</a>`;
    })
    .join('')}</div>`;
}

export function renderRelatedGroups(related) {
  const groups = [
    ['Regulatory Changes', related.changes, 'Regulatory Change'],
    ['Impact Assessments', related.assessments, 'Impact Assessment'],
    ['Obligations', related.obligations, 'Obligation'],
    ['Policies', related.policies, 'Policy'],
    ['Risks', related.risks, 'Risk'],
    ['Controls', related.controls, 'Control'],
    ['Actions', related.actions, 'Action'],
    ['Evidence', related.evidence, 'Evidence'],
  ];
  return groups
    .map(([title, items, type]) => {
      if (!items?.length) return '';
      return `<section class="ri-related-group"><h3>${esc(title)}</h3><ul>${items
        .map((item) => {
          const label = item.title || item.statement || item.name || item.description || item.fileName || item.id;
          return `<li>${linkRecord(type, item.id, label)}</li>`;
        })
        .join('')}</ul></section>`;
    })
    .join('');
}

export function renderTraceSection(entityType, entityId) {
  const normType = entityType === 'Change' ? 'Regulatory Change' : entityType;
  const { forward, backward } = buildTraceFrom(normType, entityId);
  const enrich = (chain) =>
    chain.map((x) => ({
      ...x,
      type: x.type === 'Change' ? 'Regulatory Change' : x.type,
      label: x.label || x.id,
    }));
  return `
    <section class="ri-subsection ri-trace-block">
      <h2>Traceability</h2>
      <h3 class="ri-subhead">Forward</h3>
      ${traceChain(enrich(forward), entityId)}
      <h3 class="ri-subhead">Backward</h3>
      ${traceChain(enrich(backward), entityId)}
    </section>`;
}

export function confirmDialog(id, title, body) {
  return `
    <dialog class="ri-dialog" id="${id}">
      <form method="dialog">
        <h2>${esc(title)}</h2>
        <p>${body}</p>
        <div class="ri-dialog__actions">
          <button value="cancel" class="ri-btn ri-btn--ghost">Cancel</button>
          <button value="confirm" class="ri-btn ri-btn--primary">Reset environment</button>
        </div>
      </form>
    </dialog>`;
}

export function formatDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d.length === 10 ? `${d}T12:00:00` : d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

export function formatDateTime(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    const date = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch {
    return d;
  }
}

export function linkRecord(type, id, label) {
  const t = type === 'Change' ? 'Regulatory Change' : type;
  return `<a href="${routeForRecord(t, id)}">${esc(label || id)}</a>`;
}
