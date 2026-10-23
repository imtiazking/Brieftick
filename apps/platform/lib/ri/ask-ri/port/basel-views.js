import { getState } from './store.js';
import { esc, pageHeader, breadcrumbs, dataTable, badge, emptyState } from './components.js';
import { coverageBadge } from './landscape-helpers.js';

export function viewBaselPublication(recordId) {
  const s = getState();
  const rec = (s.baselPublicationRecords || []).find((r) => r.baselRecordId === recordId);
  if (!rec) return emptyState('Basel / BCBS record not found');
  const mappings = (s.internationalImplementationMappings || []).filter((m) => m.baselRecordId === recordId);
  const mapRows = mappings
    .map(
      (m) =>
        `<tr><td>${esc(m.mappingType)}</td><td>${esc(m.ukFramework)}</td><td>${m.praPublicationId ? `<a href="#/publication/${esc(m.praPublicationId)}">${esc(m.praPublicationId)}</a>` : '—'}</td><td>${esc(m.reviewStatus)}</td><td>${m.linkedRiChangeId ? `<a href="#/change/${esc(m.linkedRiChangeId)}">${esc(m.linkedRiChangeId)}</a>` : '—'}</td></tr>`
    )
    .join('');
  return `
    ${breadcrumbs([
      { label: 'Regulatory Landscape', href: '#/landscape/banking' },
      { label: rec.title },
    ])}
    ${pageHeader(rec.title, `${rec.officialReference || ''} — ${rec.documentType}`)}
    <dl class="ri-dl">
      <dt>Authority</dt><dd>${esc(rec.sourceAuthority)} (${esc(rec.sourceOrganisation)})</dd>
      <dt>Source layer</dt><dd>${esc(rec.sourceLayer)} — not UK legislation</dd>
      <dt>Version status</dt><dd>${esc(rec.versionStatus)}</dd>
      <dt>UK implementation</dt><dd>${esc(rec.ukImplementationStatus)}</dd>
      <dt>Canonical URL</dt><dd><a href="${esc(rec.canonicalUrl)}" rel="noopener noreferrer">View official BIS source</a></dd>
      <dt>FORGENIQ source hash</dt><dd class="ri-mono">${esc(rec.sourceHash || '—')}</dd>
    </dl>
    <p class="ri-muted">International prudential standard — UK firm obligations arise only through reviewed UK implementation sources.</p>
    ${mapRows ? `<section class="ri-panel"><h2>UK implementation mappings</h2>${dataTable(['Type', 'UK framework', 'PRA publication', 'Review', 'RI change'], mapRows)}</section>` : ''}`;
}

export function viewBaselStaging() {
  const s = getState();
  const rows = (s.baselStaging || []).map(
    (st) =>
      `<tr><td>${esc(st.title)}</td><td>${esc(st.documentType)}</td><td>${esc(st.versionStatus || '—')}</td><td>${esc(st.status)}</td><td>${esc(st.relevanceStatus)}</td><td>${st.autoChangeCreated ? 'Yes' : 'No'}</td></tr>`
  );
  return `
    ${breadcrumbs([{ label: 'Ingestion', href: '#/ingestion' }, { label: 'Basel staging' }])}
    ${pageHeader('Basel / BCBS source staging', 'International standards require human review before UK obligations are created.')}
    ${dataTable(['Title', 'Type', 'Version', 'Status', 'Relevance', 'Auto change'], rows)}`;
}

export function viewBaselUkImplementation() {
  const s = getState();
  const rows = (s.internationalImplementationMappings || []).map(
    (m) => {
      const basel = (s.baselPublicationRecords || []).find((r) => r.baselRecordId === m.baselRecordId);
      return `<tr><td>${basel ? `<a href="#/basel/${esc(m.baselRecordId)}">${esc(basel.title)}</a>` : esc(m.baselRecordId)}</td><td>${esc(m.mappingType)}</td><td>${esc(m.ukFramework)}</td><td>${m.praPublicationId ? `<a href="#/publication/${esc(m.praPublicationId)}">PRA source</a>` : '—'}</td><td>${esc(m.reviewStatus)}</td></tr>`;
    }
  );
  return `
    ${breadcrumbs([{ label: 'Regulatory Landscape', href: '#/landscape/banking' }, { label: 'International → UK implementation' }])}
    ${pageHeader('International → UK implementation', 'Basel / BCBS sources linked to UK PRA material — provenance remains separate.')}
    ${dataTable(['Basel record', 'Mapping', 'UK framework', 'PRA source', 'Review'], rows, 'No mappings configured')}`;
}

export function renderBankingProvenance(s) {
  const baselFw = s.regulatoryFrameworks?.find((f) => f.id === 'FWK-BASEL');
  const praFw = s.regulatoryFrameworks?.find((f) => f.id === 'FWK-PRA-RB');
  const crrFw = s.regulatoryFrameworks?.find((f) => f.id === 'FWK-UK-CRR');
  const bankAct = s.regulatoryFrameworks?.find((f) => f.id === 'FWK-BANK-ACT');
  const cap = (s.baselPublicationRecords || []).find((r) => r.baselRecordId === 'BAS-TGT-CAP');
  return `
    <section class="ri-panel ri-banking-provenance">
      <h2>Prudential provenance layers</h2>
      <div class="ri-detail-grid">
        <div>
          <h3 class="ri-muted">International prudential standards</h3>
          <ul>
            <li>Basel III / Basel 3.1 ${baselFw ? coverageBadge(baselFw.coverageStatus) : ''} <span class="ri-muted">BCBS / BIS</span></li>
            ${cap ? `<li><a href="#/basel/${cap.baselRecordId}">${esc(cap.title)}</a> (${esc(cap.officialReference)})</li>` : ''}
          </ul>
        </div>
        <div>
          <h3 class="ri-muted">UK regulatory implementation</h3>
          <ul>
            <li>PRA Rulebook ${praFw ? coverageBadge(praFw.coverageStatus) : ''}</li>
            <li>UK CRR ${crrFw ? coverageBadge(crrFw.coverageStatus) : ''}</li>
          </ul>
          <p><a href="#/basel/uk-implementation">International → UK implementation view</a></p>
        </div>
        <div>
          <h3 class="ri-muted">UK legislation</h3>
          <ul>
            <li>Banking Act 2009 ${bankAct ? coverageBadge(bankAct.coverageStatus) : ''} <span class="ri-muted">UK Legislation</span></li>
          </ul>
        </div>
      </div>
    </section>`;
}
