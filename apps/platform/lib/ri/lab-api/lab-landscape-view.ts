import 'server-only';

import type { GlobalRegulatorRow, GlobalRegulatorySourceRow } from '@/lib/ri/services/reference-catalogue';
import {
  DESIGN_LAB_LANDSCAPE_SECTORS,
  designLabRegulatorIdFromExternalKey,
  landscapeSectorIdsForRegulatorId,
  regulatorIdsForSectorId,
} from '@/lib/ri/lab-api/lab-landscape-mappings';

export type LabLandscapeRegulatorView = {
  designLabRegulatorId: string;
  dbId: string;
  name: string;
  shortName: string;
  jurisdiction: string;
  officialBaseUrl: string;
  lifecycleStatus: string;
  sourceCount: number;
  sourceExternalKeys: string[];
};

export type LabLandscapeSourceView = {
  dbId: string;
  externalKey: string;
  name: string;
  productionStatus: string;
  ingestionMode: string | null;
  designLabRegulatorId: string | null;
  regulatorName: string;
};

export type LabLandscapeSectorStats = {
  sectorId: string;
  slug: string;
  name: string;
  regulatorIds: string[];
  publicationCount: number;
  changeCount: number;
  sourceCount: number;
};

export type LabLandscapePayload = {
  regulatorCount: number;
  sourceCount: number;
  publicationCount: number;
  changeCount: number;
  regulators: LabLandscapeRegulatorView[];
  sources: LabLandscapeSourceView[];
  sectorStats: LabLandscapeSectorStats[];
  mappingNote: string;
};

export function buildLabLandscapeView(input: {
  regulators: GlobalRegulatorRow[];
  sources: GlobalRegulatorySourceRow[];
  publicationRegulatorKeys: (string | null)[];
  changePublicationRegulatorKeys: (string | null)[];
}): LabLandscapePayload {
  const sourcesByRegulatorKey = new Map<string, GlobalRegulatorySourceRow[]>();
  for (const src of input.sources) {
    const regKey = src.regulator?.external_key;
    if (!regKey) continue;
    const list = sourcesByRegulatorKey.get(regKey) ?? [];
    list.push(src);
    sourcesByRegulatorKey.set(regKey, list);
  }

  const regulators: LabLandscapeRegulatorView[] = input.regulators
    .map((r) => {
      const designLabRegulatorId =
        designLabRegulatorIdFromExternalKey(r.external_key) ?? r.external_key;
      const regSources = sourcesByRegulatorKey.get(r.external_key) ?? [];
      return {
        designLabRegulatorId,
        dbId: r.id,
        name: r.name,
        shortName: r.acronym || r.name,
        jurisdiction: r.jurisdiction,
        officialBaseUrl: r.official_base_url,
        lifecycleStatus: r.lifecycle_status,
        sourceCount: regSources.length,
        sourceExternalKeys: regSources.map((s) => s.external_key),
      };
    })
    .filter((r) => r.designLabRegulatorId.startsWith('REG-'));

  const sources: LabLandscapeSourceView[] = input.sources.map((s) => ({
    dbId: s.id,
    externalKey: s.external_key,
    name: s.name,
    productionStatus: s.production_status,
    ingestionMode: s.ingestion_mode,
    designLabRegulatorId: designLabRegulatorIdFromExternalKey(s.regulator?.external_key),
    regulatorName: s.regulator?.name ?? '—',
  }));

  const pubCountBySector = new Map<string, number>();
  for (const key of input.publicationRegulatorKeys) {
    const regId = designLabRegulatorIdFromExternalKey(key);
    for (const sectorId of landscapeSectorIdsForRegulatorId(regId)) {
      pubCountBySector.set(sectorId, (pubCountBySector.get(sectorId) ?? 0) + 1);
    }
  }

  const chgCountBySector = new Map<string, number>();
  for (const key of input.changePublicationRegulatorKeys) {
    const regId = designLabRegulatorIdFromExternalKey(key);
    for (const sectorId of landscapeSectorIdsForRegulatorId(regId)) {
      chgCountBySector.set(sectorId, (chgCountBySector.get(sectorId) ?? 0) + 1);
    }
  }

  const sectorStats: LabLandscapeSectorStats[] = DESIGN_LAB_LANDSCAPE_SECTORS.map((sec) => {
    const regulatorIds = regulatorIdsForSectorId(sec.id);
    const sourceCount = regulatorIds.reduce((n, regId) => {
      const dbKey = regId;
      return n + (sourcesByRegulatorKey.get(dbKey)?.length ?? 0);
    }, 0);
    return {
      sectorId: sec.id,
      slug: sec.slug,
      name: sec.name,
      regulatorIds,
      publicationCount: pubCountBySector.get(sec.id) ?? 0,
      changeCount: chgCountBySector.get(sec.id) ?? 0,
      sourceCount,
    };
  });

  return {
    regulatorCount: input.regulators.length,
    sourceCount: input.sources.length,
    publicationCount: input.publicationRegulatorKeys.length,
    changeCount: input.changePublicationRegulatorKeys.length,
    regulators,
    sources,
    sectorStats,
    mappingNote:
      'Publication and change counts use explicit Design Lab sector↔regulator mappings applied to each publication’s regulator external_key (REG-*). Framework/theme taxonomy remains Design Lab navigation data.',
  };
}
