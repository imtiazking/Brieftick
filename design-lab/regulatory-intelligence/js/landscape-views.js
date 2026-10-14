import { getState, scenarioFilter, routeForRecord } from './store.js';
import {
  esc,
  pageHeader,
  breadcrumbs,
  dataTable,
  emptyState,
  badge,
  linkRecord,
  formatDate,
  formatDateTime,
} from './components.js';
import {
  getSectorBySlug,
  getFrameworkById,
  getRegulatorById,
  frameworksForSector,
  regulatorsForSector,
  themesForSector,
  coverageSummaryForSector,
  publicationsForSector,
  changesForSector,
  obligationsForSector,
  risksForSector,
  controlsForSector,
  sectorSummaryStats,
  buildCoverageGaps,
  landscapeSearch,
  coverageBadge,
  coverageLabel,
  mySectorIds,
} from './landscape-helpers.js';
import { renderPensionProvidersProvenance } from './tpr-views.js';
import { renderBankingProvenance } from './basel-views.js';

const LANDSCAPE_DISCLAIMER =
  'Regulatory landscape mappings support regulatory intelligence and navigation. Applicability depends on the organisation, permissions, activities and circumstances and should be reviewed by qualified compliance/legal personnel.';

const SECTOR_TABS = [
  'Overview',
  'Frameworks',
  'Regulators',
  'Compliance Themes',
  'Publications',
  'Changes',
  'Obligations',
  'Risks & Controls',
  'Coverage',
];

function tabSlug(tab) {
  return tab.toLowerCase().replace(/\s*&\s*/g, '-').replace(/\s+/g, '-');
}

function sectorTabs(sector, active) {
  return `<div class="ri-tabs" role="tablist">${SECTOR_TABS
    .map((t) => {
      const slug = tabSlug(t);
      const href = slug === 'overview' ? `#/landscape/${sector.slug}` : `#/landscape/${sector.slug}/${slug}`;
      return `<a role="tab" class="ri-tabs__btn${t === active ? ' is-active' : ''}" href="${href}" aria-selected="${t === active}">${esc(t)}</a>`;
    })
    .join('')}</div>`;
}

export function viewLandscapeHome() {
  const s = getState();
  const my = mySectorIds(s);
  const cards = (s.sectors || []).map((sec) => {
    const stats = sectorSummaryStats(s, sec);
    const regs = stats.regulators.map((r) => r.shortName).join(', ');
    const pin = my.includes(sec.id) ? '<span class="ri-landscape-pin">My sector</span>' : '';
    return `
      <article class="ri-landscape-card">
        <header>
          <h3><a href="#/landscape/${esc(sec.slug)}">${esc(sec.name)}</a></h3>
          ${pin}
        </header>
        <p class="ri-muted">${esc(sec.summary)}</p>
        <dl class="ri-dl ri-dl--compact ri-landscape-card__stats">
          <dt>Primary regulators</dt><dd>${esc(regs)}</dd>
          <dt>Frameworks</dt><dd>${stats.frameworks}</dd>
          <dt>Live / partial / planned / reference</dt>
          <dd>${stats.liveCoverageCount} LIVE · ${stats.partialCoverageCount} PARTIAL · ${stats.plannedCount} PLANNED · ${stats.referenceCount} REFERENCE</dd>
          <dt>Recent changes (open)</dt><dd>${stats.recentChanges}</dd>
          <dt>Open obligations</dt><dd>${stats.openObligations}</dd>
          <dt>Last landscape review</dt><dd>${esc(stats.lastLandscapeReview)}</dd>
        </dl>
        <a class="ri-btn ri-btn--ghost" href="#/landscape/${esc(sec.slug)}">Open sector</a>
      </article>`;
  });

  return `
    ${breadcrumbs([{ label: 'Regulatory Landscape', href: '#/landscape' }])}
    ${pageHeader({
      eyebrow: 'DESIGN LAB REGULATORY LANDSCAPE',
      title: 'Sector regulatory landscape',
      subtitle: 'Understand the regulatory frameworks, compliance themes and regulatory changes relevant to your sector.',
    })}
    <p class="ri-landscape-disclaimer">${esc(LANDSCAPE_DISCLAIMER)}</p>
    <div class="ri-toolbar">
      <label class="ri-search"><span class="sr-only">Search landscape</span>
        <input type="search" id="landscape-search" placeholder="Sector, framework, regulator, theme…" />
      </label>
      <a class="ri-btn ri-btn--ghost" href="#/landscape/gaps">Coverage gaps</a>
      <a class="ri-btn ri-btn--ghost" href="#/landscape/matrix">Framework × sector matrix</a>
      <a class="ri-btn ri-btn--ghost" href="#/landscape/preferences">My sectors</a>
    </div>
    <div class="ri-landscape-grid" id="landscape-sector-grid">${cards.join('')}</div>
    <div id="landscape-search-results" hidden></div>`;
}

export function viewLandscapePreferences() {
  const s = getState();
  const selected = new Set(mySectorIds(s));
  const rows = (s.sectors || [])
    .map(
      (sec) => `
    <label class="ri-check-row">
      <input type="checkbox" data-my-sector="${esc(sec.id)}" ${selected.has(sec.id) ? 'checked' : ''} />
      <span>${esc(sec.name)}</span>
    </label>`
    )
    .join('');
  return `
    ${breadcrumbs([{ label: 'Regulatory Landscape', href: '#/landscape' }, { label: 'My sectors' }])}
    ${pageHeader('My sectors', 'Prioritise publications, changes and obligations on the dashboard overview. All sectors remain accessible.')}
    <form id="my-sectors-form" class="ri-panel">${rows}
      <button type="submit" class="ri-btn ri-btn--primary">Save preferences</button>
    </form>`;
}

export function viewLandscapeGaps() {
  const s = getState();
  const gaps = buildCoverageGaps(s);
  const rows = gaps.map(
    (g) =>
      `<tr><td><a href="#/landscape/framework/${esc(g.frameworkId)}">${esc(g.frameworkName)}</a></td><td>${esc(g.sectors)}</td><td>${esc(g.primaryAuthority)}</td><td>${esc(g.currentCoverage)}</td><td>${esc(g.missingSource)}</td><td>${esc(g.plannedConnector)}</td><td>${esc(g.priority)}</td></tr>`
  );
  return `
    ${breadcrumbs([{ label: 'Regulatory Landscape', href: '#/landscape' }, { label: 'Coverage gaps' }])}
    ${pageHeader('Coverage gaps', 'Frameworks without full live official-source coverage in this Design Lab build.')}
    ${dataTable(['Framework', 'Sector', 'Primary authority', 'Current coverage', 'Missing source', 'Planned connector', 'Priority'], rows, 'No gaps recorded')}
    <p class="ri-landscape-disclaimer">${esc(LANDSCAPE_DISCLAIMER)}</p>`;
}

export function viewLandscapeMatrix() {
  const s = getState();
  const sectors = s.sectors || [];
  const frameworks = s.regulatoryFrameworks || [];
  const map = new Set((s.sectorFrameworkMappings || []).map((m) => `${m.frameworkId}:${m.sectorId}`));
  const header = `<tr><th scope="col">Framework</th>${sectors.map((sec) => `<th scope="col">${esc(sec.name)}</th>`).join('')}</tr>`;
  const body = frameworks
    .map((f) => {
      const cells = sectors
        .map((sec) => {
          const on = map.has(`${f.id}:${sec.id}`);
          return `<td class="ri-matrix-cell${on ? ' is-mapped' : ''}" title="${on ? 'Mapped to sector' : ''}">${on ? '●' : '—'}</td>`;
        })
        .join('');
      return `<tr><th scope="row"><a href="#/landscape/framework/${esc(f.id)}">${esc(f.shortName || f.name)}</a></th>${cells}</tr>`;
    })
    .join('');
  return `
    ${breadcrumbs([{ label: 'Regulatory Landscape', href: '#/landscape' }, { label: 'Matrix' }])}
    ${pageHeader({
      eyebrow: 'DESIGN LAB REGULATORY LANDSCAPE',
      title: 'Framework × sector matrix',
      subtitle: 'Mappings are taxonomy navigation only — not a statement of legal applicability.',
    })}
    <div class="ri-table-wrap ri-matrix-wrap">
      <table class="ri-table ri-matrix-table">
        <thead>${header}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

export function viewLandscapeSearch(query) {
  const s = getState();
  const res = landscapeSearch(s, query);
  const block = (title, items, linkFn) => {
    if (!items.length) return '';
    return `<section><h2>${esc(title)}</h2><ul>${items.map((i) => `<li><a href="${linkFn(i)}">${esc(i.name || i.shortName)}</a></li>`).join('')}</ul></section>`;
  };
  return `
    ${breadcrumbs([{ label: 'Regulatory Landscape', href: '#/landscape' }, { label: 'Search' }])}
    ${pageHeader('Landscape search', query ? `Results for “${esc(query)}”` : 'Enter a search term')}
    ${block('Sectors', res.sectors, (i) => `#/landscape/${i.slug}`)}
    ${block('Frameworks', res.frameworks, (i) => `#/landscape/framework/${i.id}`)}
    ${block('Compliance themes', res.themes, () => '#/landscape')}
    ${block('Regulators', res.regulators, (i) => `#/landscape/regulator/${i.id}`)}
    ${block('Legislation', res.legislation || [], (i) => `#/legislation/${i.id}`)}
    ${block('TPR', res.tpr || [], (i) => `#/tpr/${i.tprRecordId}`)}
    ${(res.basel || []).length ? `<section><h2>Basel / BCBS</h2><ul>${res.basel.map((i) => `<li><a href="#/basel/${esc(i.baselRecordId)}">${esc(i.title)}</a></li>`).join('')}</ul></section>` : ''}
    ${!res.sectors.length && !res.frameworks.length && !res.themes.length && !res.regulators.length && !(res.legislation || []).length && !(res.tpr || []).length && !(res.basel || []).length ? emptyState('No matches') : ''}`;
}

export function viewSectorDetail(slug, tabKey = 'overview') {
  const s = getState();
  const sector = getSectorBySlug(s, slug);
  if (!sector) return emptyState('Sector not found', 'Return to regulatory landscape home.');
  const activeTab = SECTOR_TABS.find((t) => tabSlug(t) === tabKey) || 'Overview';
  const cov = coverageSummaryForSector(s, sector.id);
  const body = renderSectorTab(s, sector, activeTab, cov);
  return `
    ${breadcrumbs([
      { label: 'Regulatory Landscape', href: '#/landscape' },
      { label: sector.name, href: `#/landscape/${sector.slug}` },
      ...(activeTab !== 'Overview' ? [{ label: activeTab }] : []),
    ])}
    ${pageHeader({
      title: sector.name,
      subtitle: `Regulatory frameworks, regulators and current regulatory intelligence relevant to ${sector.name.toLowerCase()} organisations.`,
    })}
    ${sectorTabs(sector, activeTab)}
    ${body}
    <p class="ri-landscape-disclaimer ri-landscape-disclaimer--inline">${esc(LANDSCAPE_DISCLAIMER)}</p>`;
}

function renderSectorTab(s, sector, tab, cov) {
  switch (tab) {
    case 'Frameworks':
      return renderSectorFrameworks(s, sector);
    case 'Regulators':
      return renderSectorRegulators(s, sector);
    case 'Compliance Themes':
      return renderSectorThemes(s, sector);
    case 'Publications':
      return renderSectorPublications(s, sector);
    case 'Changes':
      return renderSectorChanges(s, sector);
    case 'Obligations':
      return renderSectorObligations(s, sector);
    case 'Risks & Controls':
      return renderSectorRisksControls(s, sector);
    case 'Coverage':
      return renderSectorCoverage(s, sector, cov);
    default:
      return renderSectorOverview(s, sector, cov);
  }
}

function renderSectorOverview(s, sector, cov) {
  const stats = sectorSummaryStats(s, sector);
  const pubs = scenarioFilter(publicationsForSector(s, sector.id)).slice(0, 5);
  const chgs = scenarioFilter(changesForSector(s, sector.id))
    .filter((c) => c.materiality === 'High')
    .slice(0, 5);
  const obls = scenarioFilter(obligationsForSector(s, sector.id)).slice(0, 5);
  const fw = frameworksForSector(s, sector.id).slice(0, 6);
  const themes = themesForSector(s, sector.id).slice(0, 8);
  const pensionLayer = sector.id === 'SEC-011' ? renderPensionProvidersProvenance(s) : '';
  const bankingLayer = sector.id === 'SEC-001' ? renderBankingProvenance(s) : '';
  return `
    ${pensionLayer}
    ${bankingLayer}
    <section class="ri-panel">
      <h2>Coverage summary</h2>
      <p><strong>${cov.total}</strong> frameworks — ${cov.counts.LIVE_SOURCE} LIVE · ${cov.counts.PARTIAL_COVERAGE} PARTIAL · ${cov.counts.SOURCE_PLANNED} PLANNED · ${cov.counts.REFERENCE_ONLY} REFERENCE</p>
    </section>
    <div class="ri-detail-grid">
      <section class="ri-panel"><h2>Primary regulators</h2><ul>${stats.regulators.map((r) => `<li><a href="#/landscape/regulator/${esc(r.id)}">${esc(r.name)}</a></li>`).join('')}</ul></section>
      <section class="ri-panel"><h2>Key frameworks</h2><ul>${fw.map((f) => `<li><a href="#/landscape/framework/${esc(f.id)}">${esc(f.name)}</a> ${coverageBadge(f.coverageStatus)}</li>`).join('')}</ul></section>
      <section class="ri-panel"><h2>Compliance themes</h2><ul>${themes.map((t) => `<li>${esc(t.name)}</li>`).join('')}</ul></section>
    </div>
    <section class="ri-panel"><h2>Latest publications</h2>${pubs.length ? `<ul>${pubs.map((p) => `<li>${linkRecord('Publication', p.id, p.title)}</li>`).join('')}</ul>` : emptyState('No mapped publications')}</section>
    <section class="ri-panel"><h2>High-impact changes</h2>${chgs.length ? `<ul>${chgs.map((c) => `<li>${linkRecord('Regulatory Change', c.id, c.title)}</li>`).join('')}</ul>` : emptyState('No mapped changes')}</section>
    <section class="ri-panel"><h2>Open obligations</h2>${obls.length ? `<ul>${obls.map((o) => `<li>${linkRecord('Obligation', o.id, o.title)} — ${badge(o.status)}</li>`).join('')}</ul>` : emptyState('No mapped obligations')}</section>`;
}

function renderSectorFrameworks(s, sector) {
  const rows = frameworksForSector(s, sector.id).map(
    (f) =>
      `<tr><td><a href="#/landscape/framework/${esc(f.id)}">${esc(f.name)}</a></td><td>${esc(f.shortName)}</td><td>${esc(f.type)}</td><td>${coverageBadge(f.coverageStatus)}</td><td>${esc(f.primaryAuthority)}</td></tr>`
  );
  return dataTable(['Framework', 'Short name', 'Type', 'Coverage', 'Authority'], rows);
}

function renderSectorRegulators(s, sector) {
  const rows = regulatorsForSector(s, sector.id).map((r) => {
    const live = r.liveConnectorId ? 'Connected source in RI' : 'No live connector';
    return `<tr><td><a href="#/landscape/regulator/${esc(r.id)}">${esc(r.name)}</a></td><td>${esc(r.shortName)}</td><td>${esc(live)}</td></tr>`;
  });
  return dataTable(['Regulator', 'Short name', 'RI source'], rows);
}

function renderSectorThemes(s, sector) {
  const rows = themesForSector(s, sector.id).map((t) => `<tr><td>${esc(t.name)}</td><td class="ri-mono">${esc(t.id)}</td></tr>`);
  return dataTable(['Theme', 'ID'], rows);
}

function renderSectorPublications(s, sector) {
  const rows = scenarioFilter(publicationsForSector(s, sector.id)).map(
    (p) =>
      `<tr><td>${linkRecord('Publication', p.id, p.id)}</td><td>${esc(p.title)}</td><td>${badge(p.regulator)}</td><td>${p.primarySectorId === sector.id ? 'Primary' : 'Related'}</td></tr>`
  );
  return dataTable(['ID', 'Title', 'Regulator', 'Sector role'], rows);
}

function renderSectorChanges(s, sector) {
  const rows = scenarioFilter(changesForSector(s, sector.id)).map(
    (c) =>
      `<tr><td>${linkRecord('Regulatory Change', c.id, c.id)}</td><td>${esc(c.title)}</td><td>${badge(c.materiality)}</td><td>${esc(c.status)}</td></tr>`
  );
  return dataTable(['ID', 'Title', 'Materiality', 'Status'], rows);
}

function renderSectorObligations(s, sector) {
  const rows = scenarioFilter(obligationsForSector(s, sector.id)).map(
    (o) =>
      `<tr><td>${linkRecord('Obligation', o.id, o.id)}</td><td>${esc(o.title)}</td><td>${badge(o.status)}</td><td>${formatDate(o.dueDate)}</td></tr>`
  );
  return dataTable(['ID', 'Title', 'Status', 'Due'], rows);
}

function renderSectorRisksControls(s, sector) {
  const risks = scenarioFilter(risksForSector(s, sector.id));
  const controls = scenarioFilter(controlsForSector(s, sector.id));
  return `
    <section class="ri-panel"><h2>Risks</h2>${risks.length ? `<ul>${risks.map((r) => `<li>${linkRecord('Risk', r.id, r.title)}</li>`).join('')}</ul>` : emptyState('No linked risks')}</section>
    <section class="ri-panel"><h2>Controls</h2>${controls.length ? `<ul>${controls.map((c) => `<li>${linkRecord('Control', c.id, c.title)}</li>`).join('')}</ul>` : emptyState('No linked controls')}</section>`;
}

function renderSectorCoverage(s, sector, cov) {
  const rows = frameworksForSector(s, sector.id).map(
    (f) =>
      `<tr><td>${esc(f.name)}</td><td>${coverageBadge(f.coverageStatus)}</td><td>${f.liveMonitoring ? 'YES' : 'NO'}</td><td>${esc(f.riSourceLabel)}</td><td>${f.lastChecked ? formatDate(f.lastChecked.slice(0, 10)) : '—'}</td></tr>`
  );
  return `
    <p><strong>${cov.total}</strong> frameworks mapped — ${cov.counts.LIVE_SOURCE} LIVE · ${cov.counts.PARTIAL_COVERAGE} PARTIAL · ${cov.counts.SOURCE_PLANNED} PLANNED · ${cov.counts.REFERENCE_ONLY} REFERENCE</p>
    ${dataTable(['Framework', 'Coverage', 'Live monitoring', 'RI source', 'Last checked'], rows)}`;
}

export function viewFrameworkDetail(frameworkId) {
  const s = getState();
  const f = getFrameworkById(s, frameworkId);
  if (!f) return emptyState('Framework not found');
  const sectors = (f.sectorIds || [])
    .map((id) => s.sectors.find((x) => x.id === id))
    .filter(Boolean);
  const themes = (f.themeIds || []).map((id) => s.complianceThemes.find((t) => t.id === id)).filter(Boolean);
  const pubs = scenarioFilter(s.publications).filter((p) => (p.frameworkIds || []).includes(f.id));
  const chgs = scenarioFilter(s.changes).filter((c) => (c.frameworkIds || []).includes(f.id));
  const obls = scenarioFilter(s.obligations).filter((o) => (o.frameworkIds || []).includes(f.id));
  const leg = (s.legislationRecords || []).find((r) => r.frameworkId === f.id);
  const tprRecs = (s.tprPublicationRecords || []).filter((r) => (r.frameworkIds || []).includes(f.id));
  const tprBlock = tprRecs.length
    ? `<section class="ri-panel"><h2>TPR official source</h2><ul>${tprRecs
        .map(
          (r) =>
            `<li><a href="#/tpr/${esc(r.tprRecordId)}">${esc(r.title)}</a> — ${esc(r.legalSourceType)} ${badge(r.sourceStatus)}</li>`
        )
        .join('')}</ul></section>`
    : '';
  const baselRecs = (s.baselPublicationRecords || []).filter((r) => (r.frameworkIds || []).includes(f.id));
  const baselMappings = (s.internationalImplementationMappings || []).filter((m) =>
    baselRecs.some((r) => r.baselRecordId === m.baselRecordId)
  );
  const baselBlock =
    f.id === 'FWK-BASEL' || baselRecs.length
      ? `<section class="ri-panel"><h2>Basel / BCBS official source</h2>
      <p class="ri-muted">International prudential standard — not UK law. UK obligations require separate PRA / legislation sources.</p>
      <ul>${baselRecs
        .slice(0, 8)
        .map(
          (r) =>
            `<li><a href="#/basel/${esc(r.baselRecordId)}">${esc(r.officialReference || r.title)}</a> — ${esc(r.documentType)} ${badge(r.sourceStatus)}</li>`
        )
        .join('')}</ul>
      ${baselMappings.length ? `<p><a href="#/basel/uk-implementation">UK implementation mappings (${baselMappings.length})</a></p>` : ''}
      <p>Source: <strong>bis.org</strong> · Monitoring: ${f.liveMonitoring ? 'ACTIVE' : 'NOT CONNECTED'}</p></section>`
      : '';
  const legBlock = leg
    ? `<section class="ri-panel"><h2>Official legislation source</h2>
      <dl class="ri-dl ri-dl--compact">
        <dt>Source</dt><dd>legislation.gov.uk</dd>
        <dt>Authority</dt><dd>The National Archives</dd>
        <dt>Official identifier</dt><dd class="ri-mono">${esc(leg.officialIdentifier)}</dd>
        <dt>Canonical URL</dt><dd><a href="${esc(leg.canonicalUri)}" rel="noopener noreferrer">View official legislation</a></dd>
        <dt>Live status</dt><dd>${badge(leg.sourceStatus)}</dd>
        <dt>Monitoring</dt><dd>${leg.liveMonitoring ? 'ACTIVE' : 'NOT CONNECTED'}</dd>
        <dt>Last checked</dt><dd>${leg.lastChecked ? formatDateTime(leg.lastChecked) : '—'}</dd>
        <dt>FORGENIQ source hash</dt><dd class="ri-mono">${esc(leg.sourceHash || '—')}</dd>
      </dl>
      <a class="ri-btn ri-btn--ghost" href="#/legislation/${esc(leg.id)}">Legislation detail</a></section>`
    : '';
  return `
    ${breadcrumbs([
      { label: 'Regulatory Landscape', href: '#/landscape' },
      ...(sectors[0] ? [{ label: sectors[0].name, href: `#/landscape/${sectors[0].slug}` }] : []),
      { label: f.name },
    ])}
    ${pageHeader(f.name, f.shortName ? `Short name: ${f.shortName}` : '')}
    <dl class="ri-dl">
      <dt>Type</dt><dd>${esc(f.type)}</dd>
      <dt>Jurisdiction</dt><dd>${esc(f.jurisdiction)}</dd>
      <dt>Regulator / authority</dt><dd>${esc(f.primaryAuthority)}</dd>
      <dt>Relevant sectors</dt><dd>${sectors.map((sec) => `<a href="#/landscape/${sec.slug}">${esc(sec.name)}</a>`).join(', ')}</dd>
      <dt>Compliance themes</dt><dd>${themes.map((t) => esc(t.name)).join(', ') || '—'}</dd>
      <dt>Coverage</dt><dd>${coverageBadge(f.coverageStatus)} <span class="ri-muted">(${coverageLabel(f.coverageStatus)})</span></dd>
      <dt>Primary authority</dt><dd>${esc(f.primaryAuthority)}</dd>
      <dt>RI source</dt><dd>${esc(f.riSourceLabel)}</dd>
      <dt>Live monitoring</dt><dd>${f.liveMonitoring ? 'YES' : 'NO'}</dd>
      <dt>Last checked</dt><dd>${f.lastChecked ? formatDate(f.lastChecked.slice(0, 10)) : '—'}</dd>
    </dl>
    <section class="ri-panel"><h2>Recent publications</h2>${pubs.length ? `<ul>${pubs.map((p) => `<li>${linkRecord('Publication', p.id, p.title)}</li>`).join('')}</ul>` : emptyState('No linked publications')}</section>
    <section class="ri-panel"><h2>Regulatory changes</h2>${chgs.length ? `<ul>${chgs.map((c) => `<li>${linkRecord('Regulatory Change', c.id, c.title)}</li>`).join('')}</ul>` : emptyState('No linked changes')}</section>
    <section class="ri-panel"><h2>Obligations</h2>${obls.length ? `<ul>${obls.map((o) => `<li>${linkRecord('Obligation', o.id, o.title)}</li>`).join('')}</ul>` : emptyState('No linked obligations')}</section>
    ${legBlock}
    ${tprBlock}
    ${baselBlock}`;
}

export function viewRegulatorDetail(regulatorId) {
  const s = getState();
  const r = getRegulatorById(s, regulatorId);
  if (!r) return emptyState('Regulator not found');
  const sectorIds = (s.sectorRegulatorMappings || []).filter((m) => m.regulatorId === r.id).map((m) => m.sectorId);
  const sectors = sectorIds.map((id) => s.sectors.find((x) => x.id === id)).filter(Boolean);
  const fwIds = new Set();
  sectors.forEach((sec) => frameworksForSector(s, sec.id).forEach((f) => fwIds.add(f.id)));
  const frameworks = (s.regulatoryFrameworks || []).filter((f) => fwIds.has(f.id));
  const pubs = scenarioFilter(s.publications).filter((p) => p.regulator === r.shortName || p.regulator === r.name);
  return `
    ${breadcrumbs([{ label: 'Regulatory Landscape', href: '#/landscape' }, { label: r.name }])}
    ${pageHeader(r.name, r.coverageNote || '')}
    <section class="ri-panel"><h2>Relevant sectors</h2><ul>${sectors.map((sec) => `<li><a href="#/landscape/${sec.slug}">${esc(sec.name)}</a></li>`).join('')}</ul></section>
    <section class="ri-panel"><h2>Frameworks</h2><ul>${frameworks.slice(0, 20).map((f) => `<li><a href="#/landscape/framework/${f.id}">${esc(f.name)}</a></li>`).join('')}</ul></section>
    <section class="ri-panel"><h2>Publications (fixture)</h2><ul>${pubs.slice(0, 12).map((p) => `<li>${linkRecord('Publication', p.id, p.title)}</li>`).join('')}</ul></section>`;
}
