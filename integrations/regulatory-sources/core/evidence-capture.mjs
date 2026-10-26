import { fingerprintContent, normaliseHtmlForFingerprint, sha256Hex } from './fingerprint.mjs';
import { extractPrimaryContentHtml, stripHtmlToPlainText } from './html-publication-text.mjs';

/**
 * Build ingest-time source evidence from an HTTP response body.
 * Raw bytes: the decoded response body buffer held by the HTTP client (UTF-8 for HTML),
 * not compressed wire bytes unless the client exposes them (it does not today).
 *
 * @param {object} input
 * @param {Buffer | Uint8Array | string} input.body
 * @param {string} input.contentType
 * @param {string} input.finalUrl
 * @param {string} input.connectorId
 */
export async function buildEvidenceCapture(input) {
  const contentType = String(input.contentType || '');
  const rawBuffer = Buffer.isBuffer(input.body)
    ? input.body
    : Buffer.from(input.body instanceof Uint8Array ? input.body : String(input.body));

  const fp = await fingerprintContent(rawBuffer, { contentType });
  const html = contentType.toLowerCase().includes('html') ? rawBuffer.toString('utf8') : '';
  const normalisedArticleHtml = html ? normaliseHtmlForFingerprint(html) : '';
  const primary = html ? extractPrimaryContentHtml(html) : null;
  const normalisedArticleText = primary
    ? stripHtmlToPlainText(primary)
    : normalisedArticleHtml
      ? stripHtmlToPlainText(normalisedArticleHtml)
      : '';

  if (fp.normalisation === 'html_article_v1' && normalisedArticleHtml) {
    const recomputed = await sha256Hex(normalisedArticleHtml);
    if (recomputed !== fp.hash) {
      throw new Error('evidence_capture_fingerprint_mismatch');
    }
  }

  return {
    rawBody: rawBuffer,
    contentType,
    finalUrl: input.finalUrl,
    connectorId: input.connectorId,
    charset: contentType.toLowerCase().includes('charset=utf-8') ? 'utf-8' : null,
    normalisedArticleHtml,
    normalisedArticleText,
    fingerprint: {
      algorithm: fp.algorithm,
      normalisation: fp.normalisation,
      hash: fp.hash,
    },
    rawSha256: await sha256Hex(rawBuffer),
    normalisedHtmlSha256: normalisedArticleHtml ? await sha256Hex(normalisedArticleHtml) : null,
    normalisedTextSha256: normalisedArticleText ? await sha256Hex(normalisedArticleText) : null,
  };
}
