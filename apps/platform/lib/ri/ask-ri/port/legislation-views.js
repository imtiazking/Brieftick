import { getState } from './store.js';
import { esc, pageHeader, breadcrumbs, dataTable, badge, formatDate, formatDateTime, emptyState } from './components.js';
import { coverageBadge } from './landscape-helpers.js';

export function viewLegislationDetail(recordId) {
  const s = getState();
  const rec = (s.legislationRecords || []).find((r) => r.id === recordId);
  if (!rec) return emptyState('Legislation record not found');
  const fw = s.regulatoryFrameworks?.find((f) => f.id === rec.frameworkId);
  const changes = (s.legislationSourceChanges || []).filter((c) => c.legislationRecordId === rec.id);
  return `
    ${breadcrumbs([
      { label: 'Regulatory Landscape', href: '#/landscape' },
      ...(fw ? [{ label: fw.name, href: `#/landscape/framework/${fw.id}` }] : []),
      { label: rec.title },
    ])}
    ${pageHeader(rec.title, `Official identifier: ${rec.officialIdentifier}`)}
    <dl class="ri-dl">
      <dt>Official identifier</dt><dd class="ri-mono">${esc(rec.officialIdentifier)}</dd>
      <dt>Type</dt><dd>${esc(rec.legislationType)}</dd>
      <dt>Year / number</dt><dd>${esc(String(rec.year))} / ${esc(rec.number)}</dd>
      <dt>Authority</dt><dd>${esc(rec.authority)}</dd>
      <dt>Canonical source</dt><dd><a href="${esc(rec.canonicalUri)}" rel="noopener noreferrer">View official legislation</a></dd>
      <dt>Source status</dt><dd>${badge(rec.sourceStatus)}</dd>
      <dt>Live monitoring</dt><dd>${rec.liveMonitoring ? 'YES' : 'NO'}</dd>
      <dt>Last checked</dt><dd>${rec.lastChecked ? formatDateTime(rec.lastChecked) : '—'}</dd>
      <dt>FORGENIQ source hash</dt><dd class="ri-mono">${esc(rec.sourceHash || '—')}</dd>
      <dt>Framework</dt><dd>${fw ? `<a href="#/landscape/framework/${fw.id}">${esc(fw.name)}</a> ${coverageBadge(fw.coverageStatus)}` : '—'}</dd>
    </dl>
    <section class="ri-panel"><h2>Source change history</h2>
      ${changes.length ? dataTable(['Event', 'Type', 'Previous hash', 'New hash', 'Review'], changes.map((c) =>
        `<tr><td>${esc(c.changeEventId)}</td><td>${esc(c.changeType)}</td><td class="ri-mono">${esc(c.previousHash?.slice(0, 12) || '—')}…</td><td class="ri-mono">${esc(c.newHash?.slice(0, 12) || '—')}…</td><td>${esc(c.reviewStatus)}</td></tr>`
      )) : emptyState('No source change events')}
    </section>
    <p class="ri-muted">Relevant legislation / mapped framework — potentially applicable subject to entity permissions and human review.</p>`;
}

export function viewLegislationStaging() {
  const s = getState();
  const rows = (s.legislationStaging || []).map(
    (st) =>
      `<tr><td>${esc(st.title)}</td><td>${esc(st.legislationType)}</td><td>${esc(st.status)}</td><td>${esc(st.relevanceStatus)}</td><td>${st.autoChangeCreated ? 'Yes' : 'No'}</td><td>${st.autoObligationCreated ? 'Yes' : 'No'}</td></tr>`
  );
  return `
    ${breadcrumbs([{ label: 'Ingestion', href: '#/ingestion' }, { label: 'Legislation staging' }])}
    ${pageHeader('Legislation source staging', 'New feed items require human review before any RI Change or Obligation is created.')}
    ${dataTable(['Title', 'Type', 'Status', 'Relevance', 'Auto change', 'Auto obligation'], rows)}`;
}
