/** Sector regulatory landscape — query & display helpers (deterministic, no AI). */

export const COVERAGE_STATUSES = {
  LIVE_SOURCE: 'LIVE_SOURCE',
  PARTIAL_COVERAGE: 'PARTIAL_COVERAGE',
  SOURCE_PLANNED: 'SOURCE_PLANNED',
  REFERENCE_ONLY: 'REFERENCE_ONLY',
};

export const COVERAGE_LABELS = {
  LIVE_SOURCE: 'LIVE SOURCE',
  PARTIAL_COVERAGE: 'PARTIAL COVERAGE',
  SOURCE_PLANNED: 'SOURCE PLANNED',
  REFERENCE_ONLY: 'REFERENCE ONLY',
};

export function coverageLabel(status) {
  return COVERAGE_LABELS[status] || status || '—';
}

export function coverageBadge(status) {
  const label = coverageLabel(status);
  const cls = {
    LIVE_SOURCE: 'ri-badge ri-badge--ok',
    PARTIAL_COVERAGE: 'ri-badge ri-badge--warn',
    SOURCE_PLANNED: 'ri-badge ri-badge--med',
    REFERENCE_ONLY: 'ri-badge ri-badge--muted',
  }[status] || 'ri-badge';
  return `<span class="${cls}" title="${label}">${label}</span>`;
}

export function getSectorBySlug(state, slug) {
  return (state.sectors || []).find((s) => s.slug === slug);
}

export function getSectorById(state, id) {
  return (state.sectors || []).find((s) => s.id === id);
}

export function getFrameworkById(state, id) {
  return (state.regulatoryFrameworks || []).find((f) => f.id === id);
}

export function getThemeById(state, id) {
  return (state.complianceThemes || []).find((t) => t.id === id);
}

export function getRegulatorById(state, id) {
  return (state.landscapeRegulators || []).find((r) => r.id === id);
}

export function frameworksForSector(state, sectorId) {
  const ids = new Set(
    (state.sectorFrameworkMappings || []).filter((m) => m.sectorId === sectorId).map((m) => m.frameworkId)
  );
  return (state.regulatoryFrameworks || []).filter((f) => ids.has(f.id));
}

export function regulatorsForSector(state, sectorId) {
  const ids = new Set(
    (state.sectorRegulatorMappings || []).filter((m) => m.sectorId === sectorId).map((m) => m.regulatorId)
  );
  return (state.landscapeRegulators || []).filter((r) => ids.has(r.id));
}

export function themesForSector(state, sectorId) {
  const fw = frameworksForSector(state, sectorId);
  const themeIds = new Set();
  fw.forEach((f) => (f.themeIds || []).forEach((t) => themeIds.add(t)));
  return (state.complianceThemes || []).filter((t) => themeIds.has(t.id));
}

export function coverageSummaryForSector(state, sectorId) {
  const fw = frameworksForSector(state, sectorId);
  const counts = { LIVE_SOURCE: 0, PARTIAL_COVERAGE: 0, SOURCE_PLANNED: 0, REFERENCE_ONLY: 0 };
  fw.forEach((f) => {
    if (counts[f.coverageStatus] != null) counts[f.coverageStatus] += 1;
  });
  return { total: fw.length, counts };
}

export function publicationsForSector(state, sectorId) {
  const pubIds = new Set();
  (state.publicationSectorMappings || []).forEach((m) => {
    if (m.sectorId === sectorId || (m.relatedSectorIds || []).includes(sectorId)) pubIds.add(m.publicationId);
  });
  return (state.publications || []).filter((p) => pubIds.has(p.id));
}

export function changesForSector(state, sectorId) {
  const changeIds = new Set();
  (state.changes || []).forEach((c) => {
    if ((c.sectorIds || []).includes(sectorId)) changeIds.add(c.id);
  });
  (state.publicationSectorMappings || [])
    .filter((m) => m.sectorId === sectorId || (m.relatedSectorIds || []).includes(sectorId))
    .forEach((m) => {
      const pub = state.publications.find((p) => p.id === m.publicationId);
      (pub?.changeIds || []).forEach((id) => changeIds.add(id));
    });
  return (state.changes || []).filter((c) => changeIds.has(c.id));
}

export function obligationsForSector(state, sectorId) {
  return (state.obligations || []).filter((o) => (o.sectorIds || []).includes(sectorId));
}

export function risksForSector(state, sectorId) {
  const oblIds = new Set(obligationsForSector(state, sectorId).map((o) => o.id));
  return (state.risks || []).filter((r) => (r.obligationIds || []).some((id) => oblIds.has(id)));
}

export function controlsForSector(state, sectorId) {
  const riskIds = new Set(risksForSector(state, sectorId).map((r) => r.id));
  return (state.controls || []).filter((c) => (c.riskIds || []).some((id) => riskIds.has(id)));
}

export function sectorSummaryStats(state, sector) {
  const cov = coverageSummaryForSector(state, sector.id);
  const pubs = publicationsForSector(state, sector.id);
  const chgs = changesForSector(state, sector.id);
  const obls = obligationsForSector(state, sector.id);
  const live = (state.sectorCoverage || []).find((c) => c.sectorId === sector.id);
  return {
    regulators: regulatorsForSector(state, sector.id),
    frameworks: cov.total,
    coverage: cov.counts,
    liveCoverageCount: cov.counts.LIVE_SOURCE,
    partialCoverageCount: cov.counts.PARTIAL_COVERAGE,
    plannedCount: cov.counts.SOURCE_PLANNED,
    referenceCount: cov.counts.REFERENCE_ONLY,
    recentChanges: chgs.filter((c) => c.status !== 'Complete').length,
    openObligations: obls.filter((o) => o.status !== 'Complete' && o.status !== 'Closed').length,
    lastLandscapeReview: live?.lastLandscapeReview || sector.lastLandscapeReview || '—',
  };
}

export function buildCoverageGaps(state) {
  return (state.regulatoryFrameworks || [])
    .filter((f) => f.coverageStatus !== 'LIVE_SOURCE')
    .map((f) => {
      const sectorIds = (state.sectorFrameworkMappings || [])
        .filter((m) => m.frameworkId === f.id)
        .map((m) => m.sectorId);
      const sectorNames = sectorIds.map((id) => getSectorById(state, id)?.name).filter(Boolean);
      return {
        frameworkId: f.id,
        frameworkName: f.name,
        sectors: sectorNames.join(', ') || '—',
        primaryAuthority: f.primaryAuthority,
        currentCoverage: coverageLabel(f.coverageStatus),
        missingSource: f.missingSource || f.riSourceLabel || '—',
        plannedConnector: f.plannedConnector || '—',
        priority: f.gapPriority || 'Medium',
      };
    });
}

export function landscapeSearch(state, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return { sectors: [], frameworks: [], themes: [], regulators: [] };
  const sectors = (state.sectors || []).filter(
    (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
  );
  const frameworks = (state.regulatoryFrameworks || []).filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.shortName || '').toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q)
  );
  const themes = (state.complianceThemes || []).filter(
    (t) => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
  );
  const regulators = (state.landscapeRegulators || []).filter(
    (r) => r.name.toLowerCase().includes(q) || (r.shortName || '').toLowerCase().includes(q)
  );
  const legislation = (state.legislationRecords || []).filter(
    (l) =>
      l.title.toLowerCase().includes(q) ||
      (l.officialIdentifier || '').toLowerCase().includes(q) ||
      String(l.year).includes(q)
  );
  const tpr = (state.tprPublicationRecords || []).filter(
    (r) =>
      r.title.toLowerCase().includes(q) ||
      (r.documentType || '').toLowerCase().includes(q) ||
      (r.tprRecordId || '').toLowerCase().includes(q)
  );
  const basel = (state.baselPublicationRecords || []).filter((r) => {
    const hay = `${r.title} ${r.officialReference || ''} ${r.frameworkModule || ''} ${r.baselRecordId}`.toLowerCase();
    return hay.includes(q) || q.includes('basel') || q.includes('bcbs');
  });
  return { sectors, frameworks, themes, regulators, legislation, tpr, basel };
}

export function mySectorIds(state) {
  const pref = state.customerSectorPreferences;
  if (pref?.sectorIds?.length) return pref.sectorIds;
  return ['SEC-001', 'SEC-003', 'SEC-008'];
}

export function orderedSectorsForNav(state) {
  const my = new Set(mySectorIds(state));
  const all = [...(state.sectors || [])];
  const mine = all.filter((s) => my.has(s.id));
  const rest = all.filter((s) => !my.has(s.id));
  return { mine, rest, all };
}
