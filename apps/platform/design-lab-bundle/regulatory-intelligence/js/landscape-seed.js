/**
 * Sector regulatory landscape taxonomy (Design Lab v11). Deterministic mappings only.
 */
import { COVERAGE_STATUSES } from './landscape-helpers.js';

const C = COVERAGE_STATUSES;

function fw(
  id,
  name,
  shortName,
  type,
  jurisdiction,
  authority,
  coverageStatus,
  opts = {}
) {
  return {
    id,
    name,
    shortName,
    type,
    jurisdiction,
    primaryAuthority: authority,
    regulatorAuthority: authority,
    coverageStatus,
    liveMonitoring: opts.liveMonitoring === true,
    lastChecked: opts.lastChecked || null,
    riSourceId: opts.riSourceId || null,
    riSourceLabel: opts.riSourceLabel || opts.riSource || '—',
    missingSource: opts.missingSource || null,
    plannedConnector: opts.plannedConnector || null,
    gapPriority: opts.gapPriority || 'Medium',
    themeIds: opts.themeIds || [],
    sectorIds: opts.sectorIds || [],
    legalSourceType: opts.legalSourceType || null,
  };
}

function sector(id, name, slug, summary) {
  return {
    id,
    name,
    slug,
    summary,
    lastLandscapeReview: '2026-10-01',
  };
}

export function applyLandscapeSeed(state) {
  state.complianceThemes = buildThemes();
  state.landscapeRegulators = buildRegulators();
  state.sectors = buildSectors();
  state.regulatoryFrameworks = buildFrameworks(state.complianceThemes);
  state.sectorFrameworkMappings = buildSectorFrameworkMappings();
  state.sectorRegulatorMappings = buildSectorRegulatorMappings();
  state.sectorCoverage = state.sectors.map((s) => ({
    sectorId: s.id,
    lastLandscapeReview: s.lastLandscapeReview,
  }));
  state.customerSectorPreferences = {
    sectorIds: ['SEC-001', 'SEC-003', 'SEC-008'],
    label: 'MY SECTORS',
  };
  state.publicationSectorMappings = buildPublicationMappings();
  applyRecordLandscapeFields(state);
  return state;
}

function buildThemes() {
  const t = (id, name) => ({ id, name });
  return [
    t('THM-CAPITAL', 'Capital adequacy'),
    t('THM-LIQUIDITY', 'Liquidity'),
    t('THM-CONSUMER', 'Consumer protection'),
    t('THM-CONDUCT', 'Conduct'),
    t('THM-CLIENT-ASSETS', 'Client assets'),
    t('THM-SUITABILITY', 'Suitability'),
    t('THM-BEST-EXEC', 'Best execution'),
    t('THM-FINCRIME', 'Financial crime'),
    t('THM-OPRES', 'Operational resilience'),
    t('THM-SUSTAIN', 'Sustainability'),
    t('THM-DISCLOSURE', 'Disclosure'),
    t('THM-GOV', 'Governance'),
    t('THM-MARKET', 'Market conduct'),
    t('THM-TX-REPORT', 'Transaction reporting'),
    t('THM-DERIV', 'Derivatives'),
    t('THM-SAFEGUARD', 'Safeguarding'),
    t('THM-PAY-SEC', 'Payment security'),
    t('THM-RESP-LEND', 'Responsible lending'),
    t('THM-RECOVERY', 'Recovery and resolution'),
    t('THM-FUND-LIQ', 'Fund liquidity'),
    t('THM-CLAIMS', 'Claims'),
    t('THM-POLICYHOLDER', 'Policyholder protection'),
    t('THM-CREDIT', 'Credit risk'),
    t('THM-VALUATION', 'Valuation'),
    t('THM-CONFLICTS', 'Conflicts'),
    t('THM-LEVERAGE', 'Leverage'),
    t('THM-CLEARING', 'Clearing'),
    t('THM-SETTLEMENT', 'Settlement'),
    t('THM-MARGIN', 'Margin'),
    t('THM-SYSTEMIC', 'Systemic risk'),
    t('THM-PENSION-GOV', 'Pension governance'),
    t('THM-MEMBER', 'Member protection'),
    t('THM-AUTH', 'Authorisation'),
    t('THM-CUSTODY', 'Custody'),
    t('THM-PROMO', 'Financial promotions'),
  ];
}

function buildRegulators() {
  return [
    { id: 'REG-FCA', name: 'Financial Conduct Authority', shortName: 'FCA', liveConnectorId: 'SRC-FCA' },
    { id: 'REG-PRA', name: 'Prudential Regulation Authority', shortName: 'PRA', liveConnectorId: 'SRC-PRA' },
    { id: 'REG-BOE', name: 'Bank of England', shortName: 'Bank of England', liveConnectorId: 'SRC-PRA' },
    { id: 'REG-HMT', name: 'HM Treasury', shortName: 'HM Treasury', liveConnectorId: 'SRC-HMT' },
    {
      id: 'REG-TPR',
      name: 'The Pensions Regulator',
      shortName: 'TPR',
      liveConnectorId: null,
      coverageNote: 'Live when TPR verification evidence is LIVE_VERIFIED',
    },
    {
      id: 'REG-BIS',
      name: 'Bank for International Settlements',
      shortName: 'BIS',
      liveConnectorId: null,
      coverageNote: 'BCBS Basel Framework — live when BASEL verification is LIVE_VERIFIED',
    },
  ];
}

/** Navigation order for Regulatory Landscape dropdown */
export const LANDSCAPE_SECTOR_NAV = [
  { slug: 'banking', label: 'Banking' },
  { slug: 'asset-management', label: 'Asset Management' },
  { slug: 'wealth-management', label: 'Wealth Management' },
  { slug: 'insurance', label: 'Insurance' },
  { slug: 'investment-banking-broker-dealers', label: 'Investment Banking & Broker-Dealers' },
  { slug: 'consumer-credit-lending', label: 'Consumer Credit & Lending' },
  { slug: 'mortgage-lenders-brokers', label: 'Mortgage Lenders & Brokers' },
  { slug: 'payments-e-money', label: 'Payments & E-Money' },
  { slug: 'fintech-cryptoassets', label: 'Fintech & Cryptoassets' },
  { slug: 'private-equity-private-debt', label: 'Private Equity & Private Debt' },
  { slug: 'pension-providers', label: 'Pension Providers' },
  { slug: 'financial-market-infrastructure', label: 'Financial Market Infrastructure' },
];

function buildSectors() {
  return [
    sector('SEC-001', 'Banking', 'banking', 'Deposit-taking and prudential banking'),
    sector('SEC-002', 'Asset Management', 'asset-management', 'Funds and asset management'),
    sector('SEC-003', 'Wealth Management', 'wealth-management', 'Advisory and portfolio management'),
    sector('SEC-004', 'Insurance', 'insurance', 'Insurance undertakings'),
    sector('SEC-005', 'Investment Banking & Broker-Dealers', 'investment-banking-broker-dealers', 'Markets and broker-dealer activity'),
    sector('SEC-006', 'Consumer Credit & Lending', 'consumer-credit-lending', 'Consumer credit firms'),
    sector('SEC-007', 'Mortgage Lenders & Brokers', 'mortgage-lenders-brokers', 'Mortgage lending and advice'),
    sector('SEC-008', 'Payments & E-Money', 'payments-e-money', 'Payment services and e-money'),
    sector('SEC-009', 'Fintech & Cryptoassets', 'fintech-cryptoassets', 'Innovative finance and crypto'),
    sector('SEC-010', 'Private Equity & Private Debt', 'private-equity-private-debt', 'Alternative funds and private markets'),
    sector('SEC-011', 'Pension Providers', 'pension-providers', 'Pension schemes and providers'),
    sector('SEC-012', 'Financial Market Infrastructure', 'financial-market-infrastructure', 'CSDs, CCPs and market infrastructure'),
  ];
}

function buildFrameworks() {
  return [
    // Banking SEC-001
    fw('FWK-UK-CRR', 'UK CRR', 'UK CRR', 'REGULATION', 'UK', 'PRA / EU retained', C.SOURCE_PLANNED, {
      themeIds: ['THM-CAPITAL', 'THM-LIQUIDITY', 'THM-CREDIT'],
      missingSource: 'Dedicated UK CRR rulebook feed',
      plannedConnector: 'legislation.gov.uk / PRA rulebook (planned)',
      sectorIds: ['SEC-001'],
    }),
    fw('FWK-PRA-RB', 'PRA Rulebook', 'PRA Rulebook', 'RULEBOOK', 'UK', 'PRA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-CAPITAL', 'THM-LIQUIDITY', 'THM-OPRES'],
      riSourceId: 'SRC-PRA',
      riSourceLabel: 'PRA / Bank of England publications',
      liveMonitoring: false,
      lastChecked: '2026-08-20T11:00:00Z',
      sectorIds: ['SEC-001', 'SEC-004'],
    }),
    fw('FWK-BASEL', 'Basel III / Basel 3.1', 'Basel 3.1', 'INTERNATIONAL STANDARD', 'International', 'BCBS / BIS', C.REFERENCE_ONLY, {
      themeIds: ['THM-CAPITAL', 'THM-LIQUIDITY', 'THM-CREDIT', 'THM-OPRES'],
      riSourceLabel: 'Basel Framework (BIS)',
      missingSource: 'Basel Framework official pages',
      plannedConnector: 'BIS BCBS HTML (planned)',
      legalSourceType: 'INTERNATIONAL_PRUDENTIAL_STANDARD',
      sectorIds: ['SEC-001', 'SEC-005'],
    }),
    fw('FWK-CRD', 'CRD-derived requirements', 'CRD', 'DERIVED FRAMEWORK', 'UK', 'PRA / FCA', C.REFERENCE_ONLY, {
      themeIds: ['THM-CAPITAL', 'THM-GOV'],
      sectorIds: ['SEC-001'],
    }),
    fw('FWK-BANK-ACT', 'Banking Act 2009', 'Banking Act', 'ACT', 'UK', 'UK Parliament', C.REFERENCE_ONLY, {
      themeIds: ['THM-RECOVERY', 'THM-GOV'],
      riSourceLabel: 'UK legislation (reference)',
      missingSource: 'legislation.gov.uk connector',
      plannedConnector: 'legislation.gov.uk (planned)',
      sectorIds: ['SEC-001'],
    }),
    // Asset management SEC-002
    fw('FWK-AIFMD', 'UK AIFMD', 'UK AIFMD', 'REGULATORY REGIME', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-GOV', 'THM-DISCLOSURE', 'THM-CONFLICTS'],
      riSourceId: 'SRC-FCA',
      riSourceLabel: 'FCA publications (related)',
      sectorIds: ['SEC-002', 'SEC-010'],
    }),
    fw('FWK-UCITS', 'UK UCITS', 'UK UCITS', 'REGULATORY REGIME', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-GOV', 'THM-DISCLOSURE'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-002'],
    }),
    fw('FWK-MIFID-DER', 'MiFID II-derived requirements', 'MiFID II', 'DERIVED FRAMEWORK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-CONDUCT', 'THM-BEST-EXEC', 'THM-DISCLOSURE'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-002', 'SEC-003', 'SEC-005', 'SEC-010'],
    }),
    fw('FWK-COLL', 'COLL', 'COLL', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-CLIENT-ASSETS', 'THM-FUND-LIQ'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-002'],
    }),
    fw('FWK-FUND', 'FUND', 'FUND', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-GOV', 'THM-DISCLOSURE'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-002', 'SEC-010'],
    }),
    fw('FWK-SDR', 'UK SDR', 'UK SDR', 'POLICY FRAMEWORK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-SUSTAIN', 'THM-DISCLOSURE'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-002'],
    }),
    // Wealth SEC-003
    fw('FWK-COBS', 'FCA COBS', 'COBS', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-SUITABILITY', 'THM-CONDUCT', 'THM-DISCLOSURE'],
      riSourceId: 'SRC-FCA',
      riSourceLabel: 'FCA Handbook (partial via publications)',
      lastChecked: '2026-10-06T09:30:00Z',
      sectorIds: ['SEC-003', 'SEC-011'],
    }),
    fw('FWK-PROD', 'PROD', 'PROD', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-CONSUMER', 'THM-DISCLOSURE'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-003'],
    }),
    fw('FWK-CASS', 'CASS', 'CASS', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-CLIENT-ASSETS', 'THM-SAFEGUARD'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-003'],
    }),
    // Insurance SEC-004
    fw('FWK-SOLVENCY-UK', 'Solvency UK', 'Solvency UK', 'REGULATORY REGIME', 'UK', 'PRA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-CAPITAL', 'THM-POLICYHOLDER'],
      riSourceId: 'SRC-PRA',
      sectorIds: ['SEC-004'],
    }),
    fw('FWK-ICOBS', 'FCA ICOBS', 'ICOBS', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-CLAIMS', 'THM-POLICYHOLDER', 'THM-CONSUMER'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-004'],
    }),
    fw('FWK-INS-ACT', 'Insurance Act 2015', 'Insurance Act 2015', 'ACT', 'UK', 'UK Parliament', C.REFERENCE_ONLY, {
      themeIds: ['THM-CLAIMS', 'THM-POLICYHOLDER'],
      liveMonitoring: false,
      riSourceLabel: 'UK legislation (reference)',
      missingSource: 'legislation.gov.uk connector',
      plannedConnector: 'legislation.gov.uk (planned)',
      gapPriority: 'High',
      sectorIds: ['SEC-004'],
    }),
    // Investment banking SEC-005
    fw('FWK-MIFIR', 'UK MiFIR', 'UK MiFIR', 'REGULATION', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-MARKET', 'THM-TX-REPORT'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-005', 'SEC-012'],
    }),
    fw('FWK-MAR', 'MAR', 'MAR', 'REGULATION', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-MARKET', 'THM-CONDUCT'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-005', 'SEC-010'],
    }),
    fw('FWK-EMIR', 'EMIR', 'EMIR', 'REGULATION', 'UK', 'FCA / BoE', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-DERIV', 'THM-TX-REPORT'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-005', 'SEC-012'],
    }),
    fw('FWK-MIFIDPRU', 'MIFIDPRU', 'MIFIDPRU', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-CAPITAL'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-005'],
    }),
    // Consumer credit SEC-006
    fw('FWK-CCA', 'Consumer Credit Act 1974', 'CCA 1974', 'ACT', 'UK', 'UK Parliament', C.REFERENCE_ONLY, {
      themeIds: ['THM-CONSUMER', 'THM-RESP-LEND'],
      missingSource: 'legislation.gov.uk connector',
      sectorIds: ['SEC-006'],
    }),
    fw('FWK-CONC', 'FCA CONC', 'CONC', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-RESP-LEND', 'THM-CONSUMER'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-006'],
    }),
    fw('FWK-CONSUMER-DUTY', 'Consumer Duty', 'Consumer Duty', 'POLICY FRAMEWORK', 'UK', 'FCA', C.LIVE_SOURCE, {
      themeIds: ['THM-CONSUMER', 'THM-CONDUCT'],
      riSourceId: 'SRC-FCA',
      riSourceLabel: 'FCA publications & handbook material',
      liveMonitoring: true,
      lastChecked: '2026-10-06T09:30:00Z',
      sectorIds: ['SEC-006', 'SEC-003', 'SEC-007', 'SEC-008'],
    }),
    // Mortgage SEC-007
    fw('FWK-MCOB', 'FCA MCOB', 'MCOB', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-RESP-LEND', 'THM-SUITABILITY', 'THM-DISCLOSURE'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-007'],
    }),
    fw('FWK-MIPRU', 'MIPRU', 'MIPRU', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-CAPITAL'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-007'],
    }),
    fw('FWK-MCD', 'Mortgage Credit Directive-derived requirements', 'MCD', 'DERIVED FRAMEWORK', 'UK', 'FCA', C.REFERENCE_ONLY, {
      themeIds: ['THM-RESP-LEND', 'THM-DISCLOSURE'],
      sectorIds: ['SEC-007'],
    }),
    // Payments SEC-008
    fw('FWK-PSR', 'Payment Services Regulations 2017', 'PSR 2017', 'REGULATION', 'UK', 'FCA / HMT', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-PAY-SEC', 'THM-SAFEGUARD', 'THM-AUTH'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-008'],
    }),
    fw('FWK-EMR', 'Electronic Money Regulations 2011', 'EMR 2011', 'REGULATION', 'UK', 'FCA', C.REFERENCE_ONLY, {
      themeIds: ['THM-SAFEGUARD', 'THM-AUTH'],
      missingSource: 'legislation.gov.uk connector',
      sectorIds: ['SEC-008'],
    }),
    fw('FWK-FCA-PAY', 'FCA payments rules', 'FCA Payments', 'HANDBOOK SOURCEBOOK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-PAY-SEC', 'THM-FINCRIME'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-008'],
    }),
    // Fintech SEC-009
    fw('FWK-MLR', 'UK Money Laundering Regulations', 'MLR', 'REGULATION', 'UK', 'FCA / HMT', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-FINCRIME'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-009'],
    }),
    fw('FWK-CRYPTO-FP', 'Cryptoasset financial promotion rules', 'Crypto FP', 'POLICY FRAMEWORK', 'UK', 'FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-PROMO', 'THM-CONSUMER'],
      riSourceId: 'SRC-FCA',
      sectorIds: ['SEC-009'],
    }),
    fw('FWK-FSMA-CRYPTO', 'FSMA cryptoasset framework', 'FSMA Crypto', 'ACT', 'UK', 'HM Treasury / FCA', C.SOURCE_PLANNED, {
      themeIds: ['THM-AUTH', 'THM-CUSTODY', 'THM-PROMO'],
      riSourceId: 'SRC-HMT',
      riSourceLabel: 'HMT horizon + FCA (partial)',
      missingSource: 'Full crypto regime source bundle',
      sectorIds: ['SEC-009'],
    }),
    // Pension SEC-011
    fw('FWK-PENS-2004', 'Pensions Act 2004', 'Pensions Act 2004', 'ACT', 'UK', 'UK Parliament', C.REFERENCE_ONLY, {
      themeIds: ['THM-PENSION-GOV', 'THM-MEMBER'],
      missingSource: 'legislation.gov.uk connector',
      sectorIds: ['SEC-011'],
    }),
    fw('FWK-PENS-1995', 'Pensions Act 1995', 'Pensions Act 1995', 'ACT', 'UK', 'UK Parliament', C.REFERENCE_ONLY, {
      themeIds: ['THM-PENSION-GOV', 'THM-MEMBER'],
      missingSource: 'legislation.gov.uk connector',
      sectorIds: ['SEC-011'],
    }),
    fw('FWK-TPR-REQ', 'TPR requirements', 'TPR requirements', 'REGULATORY REGIME', 'UK', 'The Pensions Regulator', C.SOURCE_PLANNED, {
      themeIds: ['THM-PENSION-GOV', 'THM-MEMBER', 'THM-GOV', 'THM-DISCLOSURE'],
      liveMonitoring: false,
      missingSource: 'The Pensions Regulator official feed',
      plannedConnector: 'TPR sitemap / Document Library',
      gapPriority: 'High',
      sectorIds: ['SEC-011'],
    }),
    fw('FWK-TPR-GCOP', 'General Code of Practice', 'General Code', 'REGULATOR_CODE', 'UK', 'The Pensions Regulator', C.SOURCE_PLANNED, {
      themeIds: ['THM-PENSION-GOV', 'THM-GOV'],
      legalSourceType: 'REGULATOR_CODE',
      missingSource: 'TPR Code pages',
      plannedConnector: 'TPR (planned)',
      sectorIds: ['SEC-011'],
    }),
    // FMI SEC-012
    fw('FWK-UK-EMIR', 'UK EMIR', 'UK EMIR', 'REGULATION', 'UK', 'Bank of England / FCA', C.PARTIAL_COVERAGE, {
      themeIds: ['THM-DERIV', 'THM-CLEARING', 'THM-MARGIN'],
      riSourceId: 'SRC-PRA',
      sectorIds: ['SEC-012'],
    }),
    fw('FWK-CSDR', 'CSDR-derived rules', 'CSDR', 'DERIVED FRAMEWORK', 'UK', 'FCA / BoE', C.SOURCE_PLANNED, {
      themeIds: ['THM-SETTLEMENT', 'THM-SYSTEMIC'],
      missingSource: 'Dedicated CSDR source',
      sectorIds: ['SEC-012'],
    }),
    fw('FWK-FSMA-REC', 'FSMA recognition regimes', 'FSMA Recognition', 'ACT', 'UK', 'Bank of England', C.REFERENCE_ONLY, {
      themeIds: ['THM-SYSTEMIC', 'THM-GOV'],
      sectorIds: ['SEC-012'],
    }),
  ];
}

function buildSectorFrameworkMappings() {
  const maps = [];
  buildFrameworks().forEach((f) => {
    (f.sectorIds || []).forEach((sectorId) => {
      maps.push({ sectorId, frameworkId: f.id });
    });
  });
  return maps;
}

function buildSectorRegulatorMappings() {
  return [
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
}

function buildPublicationMappings() {
  return [
    { publicationId: 'PUB-001', sectorId: 'SEC-006', relatedSectorIds: ['SEC-003', 'SEC-001'], frameworkIds: ['FWK-CONSUMER-DUTY'], themeIds: ['THM-CONSUMER'] },
    { publicationId: 'PUB-003', sectorId: 'SEC-001', relatedSectorIds: ['SEC-012'], frameworkIds: ['FWK-PRA-RB'], themeIds: ['THM-OPRES'] },
    { publicationId: 'PUB-004', sectorId: 'SEC-009', relatedSectorIds: ['SEC-001', 'SEC-008'], frameworkIds: ['FWK-MLR'], themeIds: ['THM-FINCRIME'] },
    { publicationId: 'PUB-006', sectorId: 'SEC-006', relatedSectorIds: ['SEC-003'], frameworkIds: ['FWK-CONSUMER-DUTY'], themeIds: ['THM-CONSUMER'] },
    { publicationId: 'PUB-012', sectorId: 'SEC-009', relatedSectorIds: [], frameworkIds: ['FWK-CRYPTO-FP', 'FWK-MLR'], themeIds: ['THM-FINCRIME', 'THM-PROMO'] },
  ];
}

function applyRecordLandscapeFields(state) {
  const pubMap = new Map((state.publicationSectorMappings || []).map((m) => [m.publicationId, m]));
  state.publications.forEach((p) => {
    const m = pubMap.get(p.id);
    if (m) {
      p.primarySectorId = m.sectorId;
      p.relatedSectorIds = m.relatedSectorIds || [];
      p.frameworkIds = m.frameworkIds || [];
      p.complianceThemeIds = m.themeIds || [];
    }
  });

  const changeSector = {
    'CHG-001': { sectorIds: ['SEC-006', 'SEC-003'], frameworkIds: ['FWK-CONSUMER-DUTY'], themeIds: ['THM-CONSUMER'] },
    'CHG-002': { sectorIds: ['SEC-006'], frameworkIds: ['FWK-CONSUMER-DUTY'], themeIds: ['THM-CONSUMER', 'THM-DISCLOSURE'] },
  };
  state.changes.forEach((c) => {
    const extra = changeSector[c.id];
    if (extra) Object.assign(c, extra);
    else if (c.publicationId === 'PUB-003') {
      c.sectorIds = ['SEC-001'];
      c.frameworkIds = ['FWK-PRA-RB'];
      c.themeIds = ['THM-OPRES'];
    }
  });

  state.obligations.forEach((o) => {
    if (o.id === 'OBL-0142') {
      o.sectorIds = ['SEC-006', 'SEC-003'];
      o.frameworkIds = ['FWK-CONSUMER-DUTY'];
      o.complianceThemeIds = ['THM-CONSUMER'];
    }
  });
}
