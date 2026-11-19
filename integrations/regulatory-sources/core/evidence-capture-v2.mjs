import { fingerprintContent } from './fingerprint.mjs';
import { fingerprintContentV2, normaliseHtmlForFingerprintV2 } from './html-article-v2.mjs';
import { stripHtmlToPlainText } from './html-publication-text.mjs';
import { assessExtractionQuality } from './extraction-quality.mjs';
import { sha256Hex } from './fingerprint.mjs';

/**
 * Build v2 derived evidence from raw HTTP body.
 * Does not replace v1 fields used by live ingestion (html_article_v1 remains on fingerprint).
 *
 * @param {object} input
 * @param {Buffer | Uint8Array | string} input.body
 * @param {string} input.contentType
 * @param {string} input.finalUrl
 * @param {string} input.connectorId
 */
export async function buildEvidenceCaptureV2(input) {
  const contentType = String(input.contentType || '');
  const rawBuffer = Buffer.isBuffer(input.body)
    ? input.body
    : Buffer.from(input.body instanceof Uint8Array ? input.body : String(input.body));

  const v1Fingerprint = await fingerprintContent(rawBuffer, { contentType });

  const html = contentType.toLowerCase().includes('html') ? rawBuffer.toString('utf8') : '';
  const normV2 = html ? normaliseHtmlForFingerprintV2(html, { finalUrl: input.finalUrl }) : null;

  let normalisedArticleHtmlV2 = null;
  let normalisedArticleTextV2 = null;
  let fingerprintV2 = null;
  let publicationMetadata = null;
  let pdfAttachments = [];
  let extractionQuality = null;

  if (normV2?.ok) {
    normalisedArticleHtmlV2 = normV2.normalised;
    normalisedArticleTextV2 = stripHtmlToPlainText(normV2.normalised);
    fingerprintV2 = {
      algorithm: 'SHA-256',
      normalisation: 'html_article_v2',
      hash: await sha256Hex(normV2.normalised),
    };
    publicationMetadata = normV2.publicationMetadata;
    pdfAttachments = normV2.pdfAttachments || [];
    extractionQuality = assessExtractionQuality({
      plainText: normalisedArticleTextV2,
      htmlRegion: normV2.normalised,
      rawByteLength: rawBuffer.length,
      canonicalUrl: input.finalUrl,
      pdfAttachments,
      publicationMetadata,
      primaryPdfCaptured: false,
    });
  } else if (html) {
    extractionQuality = assessExtractionQuality({
      plainText: '',
      htmlRegion: '',
      rawByteLength: rawBuffer.length,
      canonicalUrl: input.finalUrl,
      pdfAttachments: [],
    });
    extractionQuality.status = 'failed';
    extractionQuality.signals.push(normV2?.code || 'fca_extraction_failed');
    extractionQuality.obligationGradeSuitable = false;
  }

  const fpV2Check = await fingerprintContentV2(rawBuffer, {
    contentType,
    finalUrl: input.finalUrl,
  });

  return {
    rawBody: rawBuffer,
    contentType,
    finalUrl: input.finalUrl,
    connectorId: input.connectorId,
    fingerprintV1: {
      algorithm: v1Fingerprint.algorithm,
      normalisation: v1Fingerprint.normalisation,
      hash: v1Fingerprint.hash,
    },
    fingerprintV2: fingerprintV2 || {
      algorithm: 'SHA-256',
      normalisation: 'html_article_v2',
      hash: fpV2Check.hash,
      error: fpV2Check.error || normV2?.code || null,
    },
    normalisedArticleHtmlV2,
    normalisedArticleTextV2,
    publicationMetadata,
    pdfAttachments,
    extractionQuality,
    rawSha256: await sha256Hex(rawBuffer),
    normalisedHtmlV2Sha256: normalisedArticleHtmlV2 ? await sha256Hex(normalisedArticleHtmlV2) : null,
    normalisedTextV2Sha256: normalisedArticleTextV2 ? await sha256Hex(normalisedArticleTextV2) : null,
    extractionProfile: 'html_article_v2',
  };
}

/**
 * Re-derive v2 artefacts from immutable raw bytes without creating a regulatory version event.
 * @param {Buffer} rawBody
 * @param {{ contentType: string, finalUrl: string, connectorId?: string }} context
 */
export async function rederiveExtractionV2FromRaw(rawBody, context) {
  return buildEvidenceCaptureV2({
    body: rawBody,
    contentType: context.contentType,
    finalUrl: context.finalUrl,
    connectorId: context.connectorId || 'CONN-LEGACY-FCA',
  });
}
