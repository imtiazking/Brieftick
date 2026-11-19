/**
 * Design Lab legacy UK / prudential sources — production integration equivalents.
 * Patterns ported from frozen lab connectors; does not import design-lab at runtime.
 */
import { createRssFeedConnector } from '../core/rss-connector.mjs';
import { HTTP_LIMITS } from '../core/contract.mjs';
import { createHtmlListingConnector } from '../core/html-listing-connector.mjs';
import { createSitemapConnector } from '../core/sitemap-connector.mjs';
import { createPatternHtmlConnector } from '../core/pattern-html-connector.mjs';
import { createCuratedOfficialDocumentConnector } from '../core/curated-url-connector.mjs';
import { inferFcaPublicationType } from './fca-publication-type.mjs';

export const CORE_LEGACY_CONNECTORS = [
  createRssFeedConnector({
    connectorId: 'CONN-LEGACY-FCA',
    regulatorId: 'REG-FCA',
    sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
    allowedHosts: ['www.fca.org.uk', 'fca.org.uk'],
    feedUrl: 'https://www.fca.org.uk/publications/rss.xml',
    retrievalMethod: 'official_rss',
    publicationType: 'publication',
    pilotMaxItems: HTTP_LIMITS.maxItemsPilotCap,
    inferPublicationType: inferFcaPublicationType,
  }),
  createRssFeedConnector({
    connectorId: 'CONN-LEGACY-PRA',
    regulatorId: 'REG-PRA',
    sourceId: 'SRC-PRA-PUBLICATIONS',
    allowedHosts: ['www.bankofengland.co.uk', 'bankofengland.co.uk'],
    feedUrl: 'https://www.bankofengland.co.uk/rss/publications',
    retrievalMethod: 'official_rss',
    publicationType: 'publication',
    maxItems: 5,
  }),
  createRssFeedConnector({
    connectorId: 'CONN-LEGACY-HMT',
    regulatorId: 'REG-HMT',
    sourceId: 'SRC-HMT-PUBLICATIONS',
    allowedHosts: ['www.gov.uk', 'gov.uk'],
    feedUrl: 'https://www.gov.uk/government/organisations/hm-treasury.atom',
    retrievalMethod: 'official_atom',
    publicationType: 'govuk_publication',
    maxItems: 5,
  }),
  createRssFeedConnector({
    connectorId: 'CONN-LEGACY-UK-LEG',
    regulatorId: 'REG-UK-LEG',
    sourceId: 'SRC-UK-LEGISLATION-ATOM',
    allowedHosts: ['www.legislation.gov.uk', 'legislation.gov.uk'],
    feedUrl: 'https://www.legislation.gov.uk/new/data.feed',
    retrievalMethod: 'official_atom',
    publicationType: 'legislation',
    maxItems: 5,
  }),
  createSitemapConnector({
    connectorId: 'CONN-LEGACY-TPR',
    regulatorId: 'REG-TPR',
    sourceId: 'SRC-TPR-DOCUMENT-LIBRARY',
    allowedHosts: [
      'www.tpr.gov.uk',
      'tpr.gov.uk',
      'www.thepensionsregulator.gov.uk',
      'thepensionsregulator.gov.uk',
    ],
    sitemapUrl: 'https://www.thepensionsregulator.gov.uk/sitemap.xml',
    maxSitemapBytes: 4 * 1024 * 1024,
    urlPattern: /thepensionsregulator\.gov\.uk\/.*document-library/i,
    retrievalMethod: 'official_sitemap',
    publicationType: 'publication',
    maxItems: 5,
  }),
  createCuratedOfficialDocumentConnector({
    connectorId: 'CONN-LEGACY-BASEL',
    regulatorId: 'REG-BIS',
    sourceId: 'SRC-BASEL-FRAMEWORK',
    allowedHosts: ['www.bis.org', 'bis.org'],
    retrievalMethod: 'official_curated_bcbs_publications',
    publicationType: 'standard',
    documentUrls: [
      'https://www.bis.org/bcbs/publ/d457.htm',
      'https://www.bis.org/bcbs/publ/d464.htm',
      'https://www.bis.org/bcbs/publ/d463.htm',
    ],
  }),
];

export const CORE_LEGACY_SOURCE_IDS = CORE_LEGACY_CONNECTORS.map((c) => c.sourceId);
