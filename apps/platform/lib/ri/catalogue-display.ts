import 'server-only';

export type RiJurisdictionGroup =
  | 'United Kingdom'
  | 'Saudi Arabia'
  | 'United Arab Emirates'
  | 'United States'
  | 'International'
  | 'Other';

export function jurisdictionGroup(record: {
  jurisdiction?: string;
  country?: string;
  region?: string;
}): RiJurisdictionGroup {
  const j = (record.jurisdiction || '').trim();
  const country = (record.country || '').toUpperCase();
  if (j === 'United Kingdom' || country === 'GB') return 'United Kingdom';
  if (j === 'Saudi Arabia' || country === 'SA') return 'Saudi Arabia';
  if (j === 'United Arab Emirates' || country === 'AE' || /uae|difc|adgm|dubai|abu dhabi/i.test(j)) {
    return 'United Arab Emirates';
  }
  if (j === 'United States' || country === 'US') return 'United States';
  if (j === 'International' || record.region === 'Global') return 'International';
  return 'Other';
}

function formatStatusToken(value: string | undefined, fallback = 'NOT TESTED') {
  return (value || fallback).replaceAll('_', ' ');
}

function formatProductionStatus(productionStatus: string | undefined) {
  const st = productionStatus || 'NOT_ENABLED';
  if (st === 'NOT_ENABLED') return 'NOT ENABLED';
  return formatStatusToken(st);
}

export type RiCatalogueRegulatorRow = {
  id: string;
  name: string;
  shortName: string;
  jurisdictionGroup: RiJurisdictionGroup;
  jurisdiction: string;
  technicalVerification: string;
  semanticCoverage: string;
  productionLabel: string;
  productionRaw: string;
  sourceIds: string[];
};

export type RiCatalogueSourceRow = {
  id: string;
  name: string;
  regulatorId: string;
  regulatorName: string;
  jurisdictionGroup: RiJurisdictionGroup;
  technicalVerification: string;
  semanticCoverage: string;
  productionLabel: string;
  productionRaw: string;
};

export type RiGlobalCatalogueView = {
  regulatorCount: number;
  sourceCount: number;
  productionEnabledCount: number;
  regulators: RiCatalogueRegulatorRow[];
  sources: RiCatalogueSourceRow[];
  jurisdictionCounts: Record<RiJurisdictionGroup, number>;
};

export async function getGlobalCatalogueView(): Promise<RiGlobalCatalogueView> {
  const mod = await import('@forgeniq/reference-data');
  const coverageMod = await import(
    '../../../../packages/reference-data/catalogue/source-coverage.mjs'
  );
  const SOURCE_COVERAGE_BY_ID = coverageMod.SOURCE_COVERAGE_BY_ID as Record<
    string,
    { coverageVerificationStatus?: string }
  >;

  const regulators: RiCatalogueRegulatorRow[] = mod.REGULATORS.map((r) => {
    const regId = r.regulatorId;
    const sources = mod.REGULATORY_SOURCES.filter((s) => s.regulatorId === regId);
    const primary = sources[0];
    const cov = primary ? SOURCE_COVERAGE_BY_ID[primary.sourceId] : undefined;
    const integration = primary?.integration;
    return {
      id: regId,
      name: r.name,
      shortName: r.acronym || r.name,
      jurisdiction: r.jurisdiction || '—',
      jurisdictionGroup: jurisdictionGroup(r),
      technicalVerification: formatStatusToken(integration?.verificationStatus),
      semanticCoverage: formatStatusToken(cov?.coverageVerificationStatus),
      productionLabel: formatProductionStatus(integration?.productionStatus),
      productionRaw: integration?.productionStatus || 'NOT_ENABLED',
      sourceIds: sources.map((s) => s.sourceId),
    };
  });

  const sources: RiCatalogueSourceRow[] = mod.REGULATORY_SOURCES.map((s) => {
    const cov = SOURCE_COVERAGE_BY_ID[s.sourceId];
    const integration = s.integration;
    return {
      id: s.sourceId,
      name: s.regulatorName ? `${s.regulatorName} — ${s.sourceType || 'source'}` : s.sourceId,
      regulatorId: s.regulatorId,
      regulatorName: s.regulatorName || '—',
      jurisdictionGroup: jurisdictionGroup(s),
      technicalVerification: formatStatusToken(integration?.verificationStatus),
      semanticCoverage: formatStatusToken(cov?.coverageVerificationStatus),
      productionLabel: formatProductionStatus(integration?.productionStatus),
      productionRaw: integration?.productionStatus || 'NOT_ENABLED',
    };
  });

  const jurisdictionCounts: Record<RiJurisdictionGroup, number> = {
    'United Kingdom': 0,
    'Saudi Arabia': 0,
    'United Arab Emirates': 0,
    'United States': 0,
    International: 0,
    Other: 0,
  };
  for (const r of regulators) {
    jurisdictionCounts[r.jurisdictionGroup] += 1;
  }

  const productionEnabledCount = mod.REGULATORY_SOURCES.filter(
    (s) => s.integration?.productionStatus === 'ENABLED',
  ).length;

  return {
    regulatorCount: mod.REGULATORS.length,
    sourceCount: mod.REGULATORY_SOURCES.length,
    productionEnabledCount,
    regulators,
    sources,
    jurisdictionCounts,
  };
}
