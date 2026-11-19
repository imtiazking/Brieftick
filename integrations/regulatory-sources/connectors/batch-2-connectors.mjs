import { createRssFeedConnector } from '../core/rss-connector.mjs';
import { createHtmlListingConnector } from '../core/html-listing-connector.mjs';
import { createPatternHtmlConnector } from '../core/pattern-html-connector.mjs';
import { createDocumentLibraryConnector } from '../core/document-library-connector.mjs';
import { createListingPdfConnector } from '../core/listing-pdf-connector.mjs';
import {
  extractSdaiaKnowledgeCenterDownloads,
  extractMociRegulationDetailPages,
  extractUaecmaRegulationDownloads,
  PHASE84G_MOCI_LISTING_URL,
  PHASE84G_SDAIA_LISTING_URL,
  PHASE84G_UAECMA_LISTING_URL,
} from './phase84g-extractors.mjs';

/** Batch 2 — Saudi Arabia, UAE, United States (catalogue-aligned; official domains only). */
const iaSa = createPatternHtmlConnector({
  connectorId: 'CONN-B2-IA-SA',
  regulatorId: 'REG-IA-SA',
  sourceId: 'SRC-IA-SA-REGULATIONS',
  allowedHosts: ['www.ia.gov.sa', 'ia.gov.sa'],
  listingUrl: 'https://www.ia.gov.sa/en/regulations-and-licenses',
  linkPattern: /href="(\/en\/[^"]*(?:regulation|circular|rule)[^"]*)"/gi,
  linkIsPath: true,
  retrievalMethod: 'official_html_pattern',
  publicationType: 'regulation',
});
iaSa.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const tadawul = createDocumentLibraryConnector({
  connectorId: 'CONN-B2-TADAWUL',
  regulatorId: 'REG-TADAWUL',
  sourceId: 'SRC-TADAWUL-RULEBOOK',
  allowedHosts: ['cma.gov.sa', 'cma.org.sa', 'www.cma.org.sa', 'www.cma.gov.sa'],
  indexUrl: 'https://cma.gov.sa/RulesRegulations/Regulations/Pages/default.aspx',
  retrievalMethod: 'official_cma_regulator_rules_index',
  publicationType: 'exchange_rule',
});
tadawul.productionStrategy = 'DIRECT_OFFICIAL_DOCUMENT_LIBRARY';

const sdaia = createListingPdfConnector({
  connectorId: 'CONN-B2-SDAIA',
  regulatorId: 'REG-SDAIA',
  sourceId: 'SRC-SDAIA-PDPL',
  allowedHosts: ['dgp.sdaia.gov.sa'],
  listingUrl: PHASE84G_SDAIA_LISTING_URL,
  extractDocuments: extractSdaiaKnowledgeCenterDownloads,
  retrievalMethod: 'official_dgp_knowledge_center_pdf',
  publicationType: 'legislation',
  maxRequests: 8,
});
sdaia.productionStrategy = 'DIRECT_OFFICIAL_DOCUMENT_LIBRARY';

const zatca = createPatternHtmlConnector({
  connectorId: 'CONN-B2-ZATCA',
  regulatorId: 'REG-ZATCA',
  sourceId: 'SRC-ZATCA-EINVOICING',
  allowedHosts: ['zatca.gov.sa', 'www.zatca.gov.sa'],
  listingUrl: 'https://zatca.gov.sa/en/HelpCenter/guidelines/Pages/default.aspx',
  linkPattern: /href="(\/en\/HelpCenter\/guidelines\/Pages\/[^"]+\.aspx)"/gi,
  linkIsPath: true,
  retrievalMethod: 'official_guidelines_pages',
  publicationType: 'guidance',
});
zatca.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const moci = createListingPdfConnector({
  connectorId: 'CONN-B2-MOCI-SA',
  regulatorId: 'REG-MOCI-SA',
  sourceId: 'SRC-MOCI-SA-COMPANIES-LAW',
  allowedHosts: ['mc.gov.sa', 'www.mc.gov.sa'],
  listingUrl: PHASE84G_MOCI_LISTING_URL,
  caBundlePath: 'certs/mc-gov-sa-trust-chain.pem',
  extractDocuments: extractMociRegulationDetailPages,
  followHtmlToPdf: true,
  acceptOfficialHtmlInstrument: true,
  minHtmlInstrumentBytes: 100_000,
  retrievalMethod: 'official_mc_regulations_detail_html',
  publicationType: 'legislation',
  maxRequests: 8,
});
moci.productionStrategy = 'DIRECT_OFFICIAL_DOCUMENT_LIBRARY';

const nca = createDocumentLibraryConnector({
  connectorId: 'CONN-B2-NCA-SA',
  regulatorId: 'REG-NCA-SA',
  sourceId: 'SRC-NCA-SA-FRAMEWORKS',
  allowedHosts: ['nca.gov.sa', 'www.nca.gov.sa', 'cdn.nca.gov.sa'],
  indexUrl: 'https://nca.gov.sa/en/laws-and-regulations/',
  retrievalMethod: 'official_laws_and_regulations_index',
  publicationType: 'framework',
});
nca.productionStrategy = 'DIRECT_OFFICIAL_DOCUMENT_LIBRARY';

const saLeg = createPatternHtmlConnector({
  connectorId: 'CONN-B2-SA-LEG',
  regulatorId: 'REG-SA-LEG',
  sourceId: 'SRC-SA-LEGISLATION-GAZETTE',
  allowedHosts: ['uqn.gov.sa', 'www.uqn.gov.sa'],
  listingUrl: 'https://www.uqn.gov.sa/',
  linkPattern: /href="(https:\/\/www\.uqn\.gov\.sa\/news\/[^"]+\/\d+)"/gi,
  linkIsPath: false,
  retrievalMethod: 'official_uqn_news_publications',
  publicationType: 'official_gazette',
});
saLeg.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const vara = createHtmlListingConnector({
  connectorId: 'CONN-B2-VARA-UPDATES',
  regulatorId: 'REG-VARA',
  sourceId: 'SRC-VARA-REGULATORY-UPDATES',
  allowedHosts: ['www.vara.ae', 'vara.ae'],
  listingUrl: 'https://www.vara.ae/en/news',
  retrievalMethod: 'official_html_listing',
  publicationType: 'regulatory_update',
});
vara.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const scaUae = createListingPdfConnector({
  connectorId: 'CONN-B2-SCA-UAE',
  regulatorId: 'REG-SCA-UAE',
  sourceId: 'SRC-SCA-UAE-REGULATIONS',
  allowedHosts: ['www.uaecma.gov.ae', 'uaecma.gov.ae'],
  listingUrl: PHASE84G_UAECMA_LISTING_URL,
  extractDocuments: extractUaecmaRegulationDownloads,
  retrievalMethod: 'official_uaecma_latest_regulations_pdf',
  publicationType: 'regulatory_decision',
  maxRequests: 6,
});
scaUae.productionStrategy = 'DIRECT_OFFICIAL_DOCUMENT_LIBRARY';

const fsra = createHtmlListingConnector({
  connectorId: 'CONN-B2-FSRA',
  regulatorId: 'REG-FSRA',
  sourceId: 'SRC-FSRA-RULEBOOK',
  allowedHosts: ['www.adgm.com', 'adgm.com'],
  listingUrl: 'https://www.adgm.com/publications',
  retrievalMethod: 'official_adgm_publications',
  publicationType: 'regulatory_publication',
});
fsra.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const uaeFiu = createHtmlListingConnector({
  connectorId: 'CONN-B2-UAE-FIU',
  regulatorId: 'REG-UAE-FIU',
  sourceId: 'SRC-UAE-FIU-GUIDANCE',
  allowedHosts: ['www.uaefiu.gov.ae', 'uaefiu.gov.ae'],
  listingUrl: 'https://www.uaefiu.gov.ae/en',
  retrievalMethod: 'official_html_listing',
  publicationType: 'guidance',
});
uaeFiu.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const cftc = createPatternHtmlConnector({
  connectorId: 'CONN-B2-CFTC',
  regulatorId: 'REG-CFTC',
  sourceId: 'SRC-CFTC-PUBLICATIONS',
  allowedHosts: ['www.cftc.gov', 'cftc.gov'],
  listingUrl: 'https://www.cftc.gov/PressRoom/PressReleases/index.htm',
  linkPattern: /href="(\/PressRoom\/PressReleases\/\d+-\d+)"/gi,
  linkIsPath: true,
  retrievalMethod: 'official_html_pattern',
  publicationType: 'press_release',
});
cftc.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const frb = createRssFeedConnector({
  connectorId: 'CONN-B2-FRB',
  regulatorId: 'REG-FRB',
  sourceId: 'SRC-FRB-SUPERVISION',
  allowedHosts: ['www.federalreserve.gov', 'federalreserve.gov'],
  feedUrl: 'https://www.federalreserve.gov/feeds/press_all.xml',
  retrievalMethod: 'official_rss',
  publicationType: 'press_release',
});
frb.productionStrategy = 'DIRECT_OFFICIAL_FEED';

const fdic = createPatternHtmlConnector({
  connectorId: 'CONN-B2-FDIC',
  regulatorId: 'REG-FDIC',
  sourceId: 'SRC-FDIC-GUIDANCE',
  allowedHosts: ['www.fdic.gov', 'fdic.gov'],
  listingUrl: 'https://www.fdic.gov/news/financial-institution-letters/index.html',
  linkPattern: /href="(\/news\/financial-institution-letters\/\d{4}\/[^"]+)"/gi,
  linkIsPath: true,
  retrievalMethod: 'official_fil_index_pattern',
  publicationType: 'supervisory_guidance',
});
fdic.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const occ = createPatternHtmlConnector({
  connectorId: 'CONN-B2-OCC',
  regulatorId: 'REG-OCC',
  sourceId: 'SRC-OCC-BULLETINS',
  allowedHosts: ['www.occ.gov', 'occ.gov'],
  listingUrl: 'https://www.occ.gov/news-events/newsroom/',
  linkPattern: /href="(\/news-issuances\/bulletins\/\d{4}\/bulletin-\d{4}-\d+\.html)"/gi,
  linkIsPath: true,
  retrievalMethod: 'official_bulletin_pattern',
  publicationType: 'bulletin',
});
occ.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const cfpb = createRssFeedConnector({
  connectorId: 'CONN-B2-CFPB-UPDATES',
  regulatorId: 'REG-CFPB',
  sourceId: 'SRC-CFPB-REGULATORY-UPDATES',
  allowedHosts: ['www.consumerfinance.gov', 'consumerfinance.gov'],
  feedUrl: 'https://www.consumerfinance.gov/about-us/newsroom/feed/',
  retrievalMethod: 'official_rss',
  publicationType: 'publication',
});
cfpb.productionStrategy = 'DIRECT_OFFICIAL_FEED';

/** RI scope: sanctions policy / recent actions — not SDN list bulk (FC central source later). */
const ofacRi = createPatternHtmlConnector({
  connectorId: 'CONN-B2-OFAC-REG-UPDATES',
  regulatorId: 'REG-OFAC',
  sourceId: 'SRC-OFAC-REGULATORY-UPDATES',
  allowedHosts: ['ofac.treasury.gov'],
  listingUrl: 'https://ofac.treasury.gov/recent-actions',
  linkPattern: /href="(\/recent-actions\/\d{8})"/gi,
  linkIsPath: true,
  retrievalMethod: 'official_html_pattern',
  publicationType: 'sanctions_action',
});
ofacRi.productionStrategy = 'DIRECT_OFFICIAL_HTML';

const nfa = createPatternHtmlConnector({
  connectorId: 'CONN-B2-NFA',
  regulatorId: 'REG-NFA',
  sourceId: 'SRC-NFA-RULEBOOK',
  allowedHosts: ['www.nfa.futures.org', 'nfa.futures.org'],
  listingUrl: 'https://www.nfa.futures.org/rulebook/index.aspx',
  linkPattern: /href="(rules\.aspx(?:\?Section=\d+)?)"/gi,
  linkIsPath: true,
  retrievalMethod: 'official_nfa_rulebook_sections',
  publicationType: 'rulebook_section',
});
nfa.productionStrategy = 'DIRECT_OFFICIAL_FEED';

export const BATCH_2_CONNECTORS = [
  iaSa,
  tadawul,
  sdaia,
  zatca,
  moci,
  nca,
  saLeg,
  vara,
  scaUae,
  fsra,
  uaeFiu,
  cftc,
  frb,
  fdic,
  occ,
  cfpb,
  ofacRi,
  nfa,
];

export const BATCH_2_SOURCE_IDS = BATCH_2_CONNECTORS.map((c) => c.sourceId);

/** Technical history frozen on batch-2 manifest (semantic splits use batch-semantic-remediation-verification.json). */
export const BATCH_2_MANIFEST_SOURCE_IDS = [
  'SRC-IA-SA-REGULATIONS',
  'SRC-TADAWUL-RULEBOOK',
  'SRC-SDAIA-PDPL',
  'SRC-ZATCA-EINVOICING',
  'SRC-MOCI-SA-COMPANIES-LAW',
  'SRC-NCA-SA-FRAMEWORKS',
  'SRC-SA-LEGISLATION-GAZETTE',
  'SRC-SCA-UAE-REGULATIONS',
  'SRC-FSRA-RULEBOOK',
  'SRC-UAE-FIU-GUIDANCE',
  'SRC-CFTC-PUBLICATIONS',
  'SRC-FRB-SUPERVISION',
  'SRC-NFA-RULEBOOK',
];
