import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getRegulatorById, getSourceById } from '../../../packages/reference-data/index.mjs';
import { httpGet } from './http-client.mjs';
import { fingerprintContent } from './fingerprint.mjs';
import { assertUrlAllowed } from './url-safety.mjs';
import {
  VERIFICATION_STATUS,
  buildVerificationResult,
  buildNormalisedPublication,
  PROVENANCE_ORIGIN,
  HTTP_LIMITS,
} from './contract.mjs';
import {
  inferPublicationClass,
  isPortalRejectionBody,
  isRegulatoryPdfBody,
  pickDecisionReference,
} from './regulatory-document-body.mjs';
import { extractRegulatoryPdfContent } from './regulatory-pdf-extract.mjs';
import { extractDocumentLinks } from './document-library.mjs';
import { dirnameFromImportMeta } from './esm-dirname.mjs';

const REG_SOURCES_ROOT = path.join(dirnameFromImportMeta(), '..');

function resolveCaBundlePem(config) {
  if (config.caBundlePem) return config.caBundlePem;
  if (!config.caBundlePath) return null;
  return readFileSync(path.join(REG_SOURCES_ROOT, config.caBundlePath), 'utf8');
}

/**
 * Listing page → official download URLs → validated PDF ingestion.
 * @param {object} config
 * @param {(html: string, listingUrl: string) => { url: string, title: string, publicationType?: string }[]} config.extractDocuments
 * @param {string} [config.caBundlePath] repo-relative path under integrations/regulatory-sources/
 */
export function createListingPdfConnector(config) {
  let caBundlePemCache;
  const getCaBundlePem = () => {
    if (caBundlePemCache === undefined) {
      caBundlePemCache = resolveCaBundlePem(config);
    }
    return caBundlePemCache;
  };

  return {
    connectorId: config.connectorId,
    regulatorId: config.regulatorId,
    sourceId: config.sourceId,
    allowedHosts: config.allowedHosts,
    feedUrl: config.listingUrl,
    listingUrl: config.listingUrl,
    retrievalMethod: config.retrievalMethod || 'official_listing_pdf',
    productionStrategy: config.productionStrategy || 'DIRECT_OFFICIAL_DOCUMENT_LIBRARY',
    maxItems: config.maxItems ?? HTTP_LIMITS.maxItemsPerSource,
    maxRequests: config.maxRequests ?? HTTP_LIMITS.maxRequestsPerConnector,
    publicationType: config.publicationType || 'regulation',
    get caBundlePem() {
      return getCaBundlePem();
    },

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
        officialUrl: reg?.officialBaseUrl || config.listingUrl,
        retrievalMethod: this.retrievalMethod,
        retrievedAt,
      };
      if (!liveAllowed) return fail(base, 'Live verification not enabled');

      const httpOpts = {
        allowedHosts: config.allowedHosts,
        caBundlePem: this.caBundlePem || undefined,
        maxBytes: config.maxDownloadBytes ?? 15 * 1024 * 1024,
      };

      const listRes = await httpGet(config.listingUrl, httpOpts);
      if (!listRes.ok) return fail(base, listRes.message, mapHttp(listRes));

      const html = listRes.body.toString('utf8');
      if (isPortalRejectionBody(listRes.body, listRes.contentType)) {
        return fail(base, 'Portal rejection page — not a regulatory document');
      }

      let docs = config.extractDocuments(html, listRes.finalUrl || config.listingUrl);
      if (options.onlyCanonicalUrl) {
        docs = docs.filter((d) => d.url === options.onlyCanonicalUrl);
      }
      docs = docs.slice(0, options.maxItems ?? this.maxItems);
      if (docs.length === 0) {
        return {
          summary: buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.UNSUPPORTED_SOURCE_FORMAT,
            error: 'No official document links in listing',
          }),
          items: [],
          publications: [],
        };
      }

      const items = [];
      const publications = [];
      let requests = 1;

      for (const doc of docs) {
        if (requests >= this.maxRequests) break;
        const gate = assertUrlAllowed(doc.url, config.allowedHosts);
        if (!gate.ok) continue;
        requests += 1;
        const docRes = await resolveRegulatoryPdfResponse(doc.url, config, httpOpts);
        if (!docRes) continue;

        const isPdf = isRegulatoryPdfBody(docRes.body, docRes.contentType);
        const isHtmlInstrument =
          !isPdf &&
          config.acceptOfficialHtmlInstrument === true &&
          (docRes.contentType || '').includes('text/html') &&
          docRes.body.length >= (config.minHtmlInstrumentBytes ?? 80_000) &&
          !isPortalRejectionBody(docRes.body, docRes.contentType);
        if (!isPdf && !isHtmlInstrument) continue;

        const fp = await fingerprintContent(docRes.body);
        let title = doc.title?.trim() || pickDecisionReference(doc.title) || doc.url;
        if (isPdf) {
          try {
            const extracted = await extractRegulatoryPdfContent(docRes.body, { maxPages: 2 });
            const firstLine = extracted?.pages?.[0]?.text?.split('\n').find((l) => l.trim().length > 12);
            if (firstLine && firstLine.length > title.length * 0.5) title = firstLine.trim().slice(0, 240);
          } catch {
            /* pdf-parse optional */
          }
        } else if (isHtmlInstrument) {
          const html = docRes.body.toString('utf8');
          const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ').trim();
          if (h1 && h1.length > 4) title = h1.slice(0, 240);
          const lawId = doc.url.match(/lawId=([^&]+)/i)?.[1];
          if (lawId) title = `${title} (${lawId.slice(0, 8)})`;
        }

        const publicationType =
          doc.publicationType ||
          inferPublicationClass(title, config.publicationType || this.publicationType);

        const provenance = {
          origin: PROVENANCE_ORIGIN,
          regulatorId: config.regulatorId,
          sourceId: config.sourceId,
          canonicalUrl: docRes.finalUrl,
          listingUrl: config.listingUrl,
          retrievalMethod: this.retrievalMethod,
          productionStrategy: this.productionStrategy,
          contentType: docRes.contentType,
          decisionReference: pickDecisionReference(title),
          retrievedAt,
        };

        items.push(
          buildVerificationResult({
            ...base,
            verificationStatus: VERIFICATION_STATUS.LIVE_VERIFIED,
            httpStatus: docRes.httpStatus,
            contentType: docRes.contentType,
            title,
            sourceDocumentUrl: docRes.finalUrl,
            sourceDocumentId: docRes.finalUrl,
            contentHash: fp.hash,
            provenance,
          }),
        );
        publications.push(
          buildNormalisedPublication({
            regulatorId: config.regulatorId,
            sourceId: config.sourceId,
            title,
            publicationType,
            canonicalUrl: docRes.finalUrl,
            contentHash: fp.hash,
            retrievedAt,
            externalId: pickDecisionReference(title) || fp.hash.slice(0, 16),
          }),
        );
      }

      const status =
        items.length > 0 ? VERIFICATION_STATUS.LIVE_VERIFIED : VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;
      return {
        summary: buildVerificationResult({
          ...base,
          verificationStatus: status,
          title: items[0]?.title || null,
          sourceDocumentUrl: items[0]?.sourceDocumentUrl || null,
          contentHash: items[0]?.contentHash || null,
          error: items.length === 0 ? 'No valid PDF documents retrieved' : null,
          provenance: items[0]?.provenance || { productionStrategy: this.productionStrategy },
        }),
        items,
        publications,
      };
    },
  };
}

function mapHttp(res) {
  if (res.code === 'ACCESS_RESTRICTED') return VERIFICATION_STATUS.ACCESS_RESTRICTED;
  if (res.code === 'AUTH_REQUIRED') return VERIFICATION_STATUS.AUTH_REQUIRED;
  return VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED;
}

function fail(base, error, status = VERIFICATION_STATUS.LIVE_RETRIEVAL_FAILED) {
  return {
    summary: buildVerificationResult({ ...base, verificationStatus: status, error }),
    items: [],
    publications: [],
  };
}

async function resolveRegulatoryPdfResponse(startUrl, config, httpOpts) {
  let url = startUrl;
  for (let hop = 0; hop < (config.followHtmlToPdf ? 2 : 1); hop += 1) {
    const docRes = await httpGet(url, {
      ...httpOpts,
      accept: 'application/pdf,application/octet-stream,text/html,*/*',
    });
    if (!docRes.ok) return null;
    if (isPortalRejectionBody(docRes.body, docRes.contentType)) return null;
    if (isRegulatoryPdfBody(docRes.body, docRes.contentType)) return docRes;
    if (
      config.acceptOfficialHtmlInstrument &&
      (docRes.contentType || '').includes('text/html') &&
      docRes.body.length >= (config.minHtmlInstrumentBytes ?? 80_000)
    ) {
      return docRes;
    }
    if (!config.followHtmlToPdf || hop > 0) return null;
    const inner = extractDocumentLinks(
      docRes.body.toString('utf8'),
      docRes.finalUrl,
      config.allowedHosts,
      3,
    );
    const pdfCandidate = inner.find((d) => /\.pdf|download|documents?\//i.test(d.link));
    if (!pdfCandidate) return null;
    url = pdfCandidate.link;
  }
  return null;
}
