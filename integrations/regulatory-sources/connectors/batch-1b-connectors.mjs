import { createPatternHtmlConnector } from '../core/pattern-html-connector.mjs';
import { createDocumentLibraryConnector } from '../core/document-library-connector.mjs';
import { httpGet } from '../core/http-client.mjs';
import { getRegulatorById, getSourceById } from '../../../packages/reference-data/index.mjs';
import {
  VERIFICATION_STATUS,
  buildVerificationResult,
  buildNormalisedPublication,
  PROVENANCE_ORIGIN,
  HTTP_LIMITS,
} from '../core/contract.mjs';
import { fingerprintContent } from '../core/fingerprint.mjs';
import { assertUrlAllowed } from '../core/url-safety.mjs';

/** SAMA — official rulebook subdomain (www.sama.gov.sa fails TLS chain verification in Node). */
export const samaRulebookConnector = createPatternHtmlConnector({
  connectorId: 'CONN-B1B-SAMA',
  regulatorId: 'REG-SAMA',
  sourceId: 'SRC-SAMA-RULEBOOK',
  allowedHosts: ['rulebook.sama.gov.sa'],
  listingUrl: 'https://rulebook.sama.gov.sa/en',
  linkPattern: /href=["'](\/en\/(?:node\/\d+|rules[^"']*))["']/gi,
  pathPattern: /\/en\/(?:node\/\d+|rules[^\s"'<>]+)/gi,
  linkIsPath: true,
  retrievalMethod: 'official_rulebook_html',
  publicationType: 'rule',
});
samaRulebookConnector.productionStrategy = 'DIRECT_OFFICIAL_HTML';

/** CMA Saudi — canonical rules index on cma.gov.sa with document library on cma.org.sa. */
export const cmaSaRulesConnector = createDocumentLibraryConnector({
  connectorId: 'CONN-B1B-CMA-SA',
  regulatorId: 'REG-CMA-SA',
  sourceId: 'SRC-CMA-SA-RULES',
  allowedHosts: ['cma.gov.sa', 'cma.org.sa', 'www.cma.org.sa'],
  indexUrl: 'https://cma.gov.sa/RulesRegulations/Regulations/Pages/default.aspx',
  retrievalMethod: 'official_document_library',
  productionStrategy: 'DIRECT_OFFICIAL_DOCUMENT_LIBRARY',
  publicationType: 'regulation',
});

/** DFSA — official Thomson Reuters–hosted rulebook (dfsa.ae returns 403 to automated clients). */
export const dfsaRulebookConnector = createPatternHtmlConnector({
  connectorId: 'CONN-B1B-DFSA',
  regulatorId: 'REG-DFSA',
  sourceId: 'SRC-DFSA-RULEBOOK',
  allowedHosts: ['dfsaen.thomsonreuters.com'],
  listingUrl: 'https://dfsaen.thomsonreuters.com/rulebook/rulemaking-instruments',
  linkPattern: /href="(\/rulebook\/rmi-[^"]+)"/g,
  linkIsPath: true,
  retrievalMethod: 'official_rulebook_platform_html',
  publicationType: 'rulemaking_instrument',
});
dfsaRulebookConnector.productionStrategy = 'OFFICIAL_STRUCTURED_ENDPOINT';

/** CBUAE — try canonical digital rulebook host; honest status if edge blocks. */
export function createCbUAEConnector() {
  const config = {
    connectorId: 'CONN-B1B-CBUAE',
    regulatorId: 'REG-CBUAE',
    sourceId: 'SRC-CBUAE-DIGITAL-RULEBOOK',
    allowedHosts: ['rulebook.centralbank.ae', 'centralbank.ae', 'www.centralbank.ae'],
    candidates: [
      'https://rulebook.centralbank.ae/en/rulebook',
      'https://rulebook.centralbank.ae/en',
      'https://www.centralbank.ae/en/our-operations/regulations',
    ],
    productionStrategy: 'LICENSED_FEED_RECOMMENDED',
  };

  return {
    ...config,
    feedUrl: config.candidates[0],
    maxItems: HTTP_LIMITS.maxItemsPerSource,
    maxRequests: HTTP_LIMITS.maxRequestsPerConnector,

    async verify(options = {}) {
      const liveAllowed = options.liveAllowed === true;
      const reg = getRegulatorById(config.regulatorId);
      const src = getSourceById(config.sourceId);
      const retrievedAt = new Date().toISOString();
      const base = {
        regulatorId: config.regulatorId,
        sourceId: config.sourceId,
        connectorId: config.connectorId,
        sourceName: src?.sourceType || config.sourceId,
        jurisdiction: reg?.jurisdiction || null,
        officialUrl: reg?.officialBaseUrl || config.candidates[0],
        retrievalMethod: 'official_digital_rulebook',
        retrievedAt,
      };
      if (!liveAllowed) {
        return empty(base, 'Live verification not enabled');
      }

      let lastError = null;
      let lastStatus = VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;

      for (const url of config.candidates) {
        const gate = assertUrlAllowed(url, config.allowedHosts);
        if (!gate.ok) continue;
        const res = await httpGet(url, { allowedHosts: config.allowedHosts });
        if (!res.ok) {
          lastError = res.networkCause
            ? `${res.message} (${res.networkCause})`
            : res.message;
          lastStatus =
            res.code === 'ACCESS_RESTRICTED'
              ? VERIFICATION_STATUS.ACCESS_RESTRICTED
              : res.code === 'AUTH_REQUIRED'
                ? VERIFICATION_STATUS.AUTH_REQUIRED
                : VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;
          continue;
        }

        const fp = await fingerprintContent(res.body);
        const title = pickTitle(res.body.toString('utf8', 0, 15000)) || 'CBUAE Rulebook';
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.LIVE_VERIFIED,
            httpStatus: res.httpStatus,
            contentType: res.contentType,
            title,
            sourceDocumentUrl: res.finalUrl,
            contentHash: fp.hash,
            provenance: {
              origin: PROVENANCE_ORIGIN,
              canonicalUrl: res.finalUrl,
              productionStrategy: 'DIRECT_OFFICIAL_HTML',
              retrievedAt,
            },
          }),
          items: [
            buildVerificationResult({
              ...base,
              verificationStatus: VERIFICATION_STATUS.LIVE_VERIFIED,
              httpStatus: res.httpStatus,
              contentType: res.contentType,
              title,
              sourceDocumentUrl: res.finalUrl,
              contentHash: fp.hash,
              provenance: { origin: PROVENANCE_ORIGIN, canonicalUrl: res.finalUrl, retrievedAt },
            }),
          ],
          publications: [
            buildNormalisedPublication({
              regulatorId: config.regulatorId,
              sourceId: config.sourceId,
              title,
              canonicalUrl: res.finalUrl,
              contentHash: fp.hash,
              retrievedAt,
            }),
          ],
        };
      }

      return {
        summary: buildVerificationResult({
          ...base,
          verificationStatus: lastStatus,
          error: lastError || 'All candidate URLs failed',
          provenance: {
            productionStrategy: config.productionStrategy,
            note: 'rulebook.centralbank.ae CNAMEs to Thomson Reuters; cbuae.thomsonreuters.com not resolvable in this DNS environment',
          },
        }),
        items: [],
        publications: [],
      };
    },
  };
}

export const cbuaeRulebookConnector = createCbUAEConnector();

export const BATCH_1B_CONNECTORS = [
  samaRulebookConnector,
  cmaSaRulesConnector,
  dfsaRulebookConnector,
  cbuaeRulebookConnector,
];

export const BATCH_1B_SOURCE_IDS = BATCH_1B_CONNECTORS.map((c) => c.sourceId);

function pickTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function empty(base, error) {
  return {
    summary: buildVerificationResult({
      ...base,
      verificationStatus: VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED,
      error,
    }),
    items: [],
    publications: [],
  };
}
