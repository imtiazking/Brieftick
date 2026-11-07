import 'server-only';

/**
 * Frozen Design Lab sector ↔ regulator taxonomy (from landscape-seed.js).
 * Used for explicit publication–sector linkage via regulator external_key (REG-*), not keyword inference.
 */
export const DESIGN_LAB_LANDSCAPE_SECTORS = [
  { id: 'SEC-001', slug: 'banking', name: 'Banking' },
  { id: 'SEC-002', slug: 'asset-management', name: 'Asset Management' },
  { id: 'SEC-003', slug: 'wealth-management', name: 'Wealth Management' },
  { id: 'SEC-004', slug: 'insurance', name: 'Insurance' },
  { id: 'SEC-005', slug: 'investment-banking-broker-dealers', name: 'Investment Banking & Broker-Dealers' },
  { id: 'SEC-006', slug: 'consumer-credit-lending', name: 'Consumer Credit & Lending' },
  { id: 'SEC-007', slug: 'mortgage-lenders-brokers', name: 'Mortgage Lenders & Brokers' },
  { id: 'SEC-008', slug: 'payments-e-money', name: 'Payments & E-Money' },
  { id: 'SEC-009', slug: 'fintech-cryptoassets', name: 'Fintech & Cryptoassets' },
  { id: 'SEC-010', slug: 'private-equity-private-debt', name: 'Private Equity & Private Debt' },
  { id: 'SEC-011', slug: 'pension-providers', name: 'Pension Providers' },
  { id: 'SEC-012', slug: 'financial-market-infrastructure', name: 'Financial Market Infrastructure' },
] as const;

/** Same rows as buildSectorRegulatorMappings() in design-lab/regulatory-intelligence/js/landscape-seed.js */
export const SECTOR_REGULATOR_MAPPINGS: { sectorId: string; regulatorId: string }[] = [
  { sectorId: 'SEC-001', regulatorId: 'REG-PRA' },
  { sectorId: 'SEC-001', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-001', regulatorId: 'REG-BOE' },
  { sectorId: 'SEC-001', regulatorId: 'REG-HMT' },
  { sectorId: 'SEC-001', regulatorId: 'REG-BIS' },
  { sectorId: 'SEC-005', regulatorId: 'REG-BIS' },
  { sectorId: 'SEC-002', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-002', regulatorId: 'REG-HMT' },
  { sectorId: 'SEC-003', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-004', regulatorId: 'REG-PRA' },
  { sectorId: 'SEC-004', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-005', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-005', regulatorId: 'REG-PRA' },
  { sectorId: 'SEC-005', regulatorId: 'REG-BOE' },
  { sectorId: 'SEC-006', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-007', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-008', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-008', regulatorId: 'REG-HMT' },
  { sectorId: 'SEC-009', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-009', regulatorId: 'REG-HMT' },
  { sectorId: 'SEC-010', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-011', regulatorId: 'REG-TPR' },
  { sectorId: 'SEC-011', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-012', regulatorId: 'REG-BOE' },
  { sectorId: 'SEC-012', regulatorId: 'REG-FCA' },
  { sectorId: 'SEC-012', regulatorId: 'REG-HMT' },
];

const sectorsByRegulator = new Map<string, string[]>();
for (const m of SECTOR_REGULATOR_MAPPINGS) {
  const list = sectorsByRegulator.get(m.regulatorId) ?? [];
  if (!list.includes(m.sectorId)) list.push(m.sectorId);
  sectorsByRegulator.set(m.regulatorId, list);
}

/** DB regulators.external_key matches reference-data regulatorId (REG-FCA, …). */
export function designLabRegulatorIdFromExternalKey(externalKey: string | null | undefined): string | null {
  const key = externalKey?.trim();
  if (!key) return null;
  if (/^REG-[A-Z0-9-]+$/i.test(key)) return key.toUpperCase();
  return null;
}

export function landscapeSectorIdsForRegulatorId(regulatorId: string | null | undefined): string[] {
  if (!regulatorId) return [];
  return sectorsByRegulator.get(regulatorId) ?? [];
}

export function landscapeSectorIdsForPublicationRegulator(
  regulatorExternalKey: string | null | undefined,
): string[] {
  const regId = designLabRegulatorIdFromExternalKey(regulatorExternalKey);
  return landscapeSectorIdsForRegulatorId(regId);
}

export function regulatorIdsForSectorId(sectorId: string): string[] {
  return SECTOR_REGULATOR_MAPPINGS.filter((m) => m.sectorId === sectorId).map((m) => m.regulatorId);
}
