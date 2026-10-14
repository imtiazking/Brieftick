import { getState } from './store.js';
import { esc, pageHeader, breadcrumbs, dataTable, badge, formatDateTime, emptyState } from './components.js';
import { coverageBadge } from './landscape-helpers.js';

export function viewTprPublication(recordId) {
  const s = getState();
  const rec = (s.tprPublicationRecords || []).find((r) => r.tprRecordId === recordId);
  if (!rec) return emptyState('TPR record not found');
  const legRefs = (rec.legalReferences || [])
    .map((ref) => `<li>${esc(ref.label)} — <a href="#/legislation/${esc(ref.recordId)}">legislation record</a></li>`)
    .join('');
  return `
    ${breadcrumbs([
      { label: 'Regulatory Landscape', href: '#/landscape/pension-providers' },
      { label: rec.title },
    ])}
    ${pageHeader(rec.title, `Document type: ${rec.documentType}`)}
    <dl class="ri-dl">
      <dt>Authority</dt><dd>${esc(rec.sourceAuthority)}</dd>
      <dt>Legal source type</dt><dd>${esc(rec.legalSourceType)}</dd>
      <dt>Canonical URL</dt><dd><a href="${esc(rec.canonicalUrl)}" rel="noopener noreferrer">View official TPR source</a></dd>
      <dt>Source status</dt><dd>${badge(rec.sourceStatus)}</dd>
      <dt>FORGENIQ source hash</dt><dd class="ri-mono">${esc(rec.sourceHash || '—')}</dd>
      <dt>Code section</dt><dd>${esc(rec.codeSection || '—')}</dd>
    </dl>
    ${legRefs ? `<section class="ri-panel"><h2>Legal basis (linked legislation)</h2><ul>${legRefs}</ul><p class="ri-muted">TPR Code / guidance expresses regulatory expectations — not primary legislation.</p></section>` : ''}
    <p class="ri-muted">Relevant / mapped — potentially applicable subject to scheme type and human review.</p>`;
}

export function viewTprStaging() {
  const s = getState();
  const rows = (s.tprStaging || []).map(
    (st) =>
      `<tr><td>${esc(st.title)}</td><td>${esc(st.documentType)}</td><td>${esc(st.tprCategory || '—')}</td><td>${esc(st.status)}</td><td>${esc(st.relevanceStatus)}</td><td>${st.autoChangeCreated ? 'Yes' : 'No'}</td></tr>`
  );
  return `
    ${breadcrumbs([{ label: 'Ingestion', href: '#/ingestion' }, { label: 'TPR staging' }])}
    ${pageHeader('TPR source staging', 'New TPR items require human review before RI Changes or Obligations are created.')}
    ${dataTable(['Title', 'Type', 'Category', 'Status', 'Relevance', 'Auto change'], rows)}`;
}

export function renderPensionProvidersProvenance(s) {
  const leg2004 = (s.legislationRecords || []).find((r) => r.id === 'LEG-UKPGA-2004-35');
  const leg1995 = (s.legislationRecords || []).find((r) => r.id === 'LEG-UKPGA-1995-26');
  const fw1995 = s.regulatoryFrameworks?.find((f) => f.id === 'FWK-PENS-1995');
  const fw2004 = s.regulatoryFrameworks?.find((f) => f.id === 'FWK-PENS-2004');
  const tprFw = s.regulatoryFrameworks?.find((f) => f.id === 'FWK-TPR-REQ');
  const code = (s.tprPublicationRecords || []).find((r) => r.tprRecordId === 'TPR-TGT-CODE-INDEX');
  return `
    <section class="ri-panel ri-pension-provenance">
      <h2>Legislation vs regulatory expectations</h2>
      <div class="ri-detail-grid">
        <div>
          <h3 class="ri-muted">Legal basis — UK legislation</h3>
          <ul>
            ${leg1995 ? `<li>Pensions Act 1995 ${fw1995 ? coverageBadge(fw1995.coverageStatus) : ''} <span class="ri-muted">UK Legislation</span> <a href="#/legislation/${leg1995.id}">Record</a></li>` : ''}
            ${leg2004 ? `<li>Pensions Act 2004 ${fw2004 ? coverageBadge(fw2004.coverageStatus) : ''} <span class="ri-muted">UK Legislation</span> <a href="#/legislation/${leg2004.id}">Record</a></li>` : ''}
          </ul>
        </div>
        <div>
          <h3 class="ri-muted">TPR regulatory expectations</h3>
          <ul>
            <li>TPR requirements ${tprFw ? coverageBadge(tprFw.coverageStatus) : ''}</li>
            ${code ? `<li><a href="#/tpr/${code.tprRecordId}">${esc(code.title)}</a> — ${esc(code.legalSourceType)}</li>` : ''}
          </ul>
        </div>
      </div>
    </section>`;
}
