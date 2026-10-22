import { createRssFeedConnector } from '../core/rss-connector.mjs';
import { createHtmlListingConnector } from '../core/html-listing-connector.mjs';
import { createSitemapConnector } from '../core/sitemap-connector.mjs';
import { createPatternHtmlConnector } from '../core/pattern-html-connector.mjs';
import { BATCH_1B_CONNECTORS } from './batch-1b-connectors.mjs';

/** Batch 1 — catalogue-aligned connectors (official domains only). */
export const BATCH_1_CONNECTORS = [
  createSitemapConnector({
    connectorId: 'CONN-B1-ICO',
    regulatorId: 'REG-ICO',
    sourceId: 'SRC-ICO-GUIDANCE',
    allowedHosts: ['ico.org.uk'],
    sitemapUrl: 'https://ico.org.uk/sitemap.xml',
    maxSitemapBytes: 6 * 1024 * 1024,
    urlPattern: /ico\.org\.uk\/action-weve-taken\/(enforcement|decision-notices)\/(2024|2025|2026)\//i,
    retrievalMethod: 'official_sitemap',
    publicationType: 'regulatory_action',
  }),
  createHtmlListingConnector({
    connectorId: 'CONN-B1-PSR',
    regulatorId: 'REG-PSR-UK',
    sourceId: 'SRC-PSR-UK-RULES',
    allowedHosts: ['psr.org.uk', 'www.psr.org.uk'],
    listingUrl: 'https://www.psr.org.uk/publications/',
    retrievalMethod: 'official_html_listing',
    publicationType: 'publication',
  }),
  createHtmlListingConnector({
    connectorId: 'CONN-B1-FRC',
    regulatorId: 'REG-FRC',
    sourceId: 'SRC-FRC-PUBLICATIONS',
    allowedHosts: ['frc.org.uk', 'www.frc.org.uk'],
    listingUrl: 'https://www.frc.org.uk/news-and-events/news',
    retrievalMethod: 'official_html_listing',
    publicationType: 'news',
  }),
  createRssFeedConnector({
    connectorId: 'CONN-B1-CMA-UK',
    regulatorId: 'REG-CMA-UK',
    sourceId: 'SRC-CMA-UK-ENFORCEMENT',
    allowedHosts: ['www.gov.uk', 'gov.uk'],
    feedUrl: 'https://www.gov.uk/government/organisations/competition-and-markets-authority.atom',
    retrievalMethod: 'official_atom',
    publicationType: 'govuk_publication',
  }),
  createRssFeedConnector({
    connectorId: 'CONN-B1-OFSI',
    regulatorId: 'REG-OFSI',
    sourceId: 'SRC-OFSI-SANCTIONS-GUIDANCE',
    allowedHosts: ['www.gov.uk', 'gov.uk'],
    feedUrl:
      'https://www.gov.uk/government/organisations/office-of-financial-sanctions-implementation.atom',
    retrievalMethod: 'official_atom',
    publicationType: 'guidance',
  }),
  ...BATCH_1B_CONNECTORS,
  createRssFeedConnector({
    connectorId: 'CONN-B1-SEC',
    regulatorId: 'REG-SEC',
    sourceId: 'SRC-SEC-RULES-PUBLICATIONS',
    allowedHosts: ['sec.gov', 'www.sec.gov'],
    feedUrl: 'https://www.sec.gov/news/pressreleases.rss',
    retrievalMethod: 'official_rss',
    publicationType: 'press_release',
  }),
  createPatternHtmlConnector({
    connectorId: 'CONN-B1-FINRA',
    regulatorId: 'REG-FINRA',
    sourceId: 'SRC-FINRA-RULEBOOK',
    allowedHosts: ['finra.org', 'www.finra.org'],
    listingUrl: 'https://www.finra.org/rules-guidance/notices',
    linkPattern: /href="(\/rules-guidance\/notices\/\d{2}-\d{2})"/g,
    linkIsPath: true,
    retrievalMethod: 'official_html_pattern',
    publicationType: 'regulatory_notice',
  }),
];

export const BATCH_1_SOURCE_IDS = BATCH_1_CONNECTORS.map((c) => c.sourceId);
