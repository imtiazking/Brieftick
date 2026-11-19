import { createHash } from 'node:crypto';
import { PS26_1_STAGING } from './ps26-1-staging-identity.mjs';

export function buildPs26MinimalLanding(pdfSha256) {
  const stubHtml = `<!DOCTYPE html><html><head><title>${PS26_1_STAGING.title}</title></head><body>
<p>FCA Policy Statement PS26/1. Primary regulatory text is the official publication PDF (Annex F CONC instrument).</p>
<p><a href="${PS26_1_STAGING.officialPdfUrl}">Primary PDF</a></p>
</body></html>`;
  const stubText =
    'FCA PS26/1 deferred payment credit. Primary regulatory text is the official publication PDF; HTML index only.';
  const rawSha = sha256Utf8(stubHtml);
  const textSha = sha256Utf8(stubText);
  const htmlSha = sha256Utf8(stubHtml);
  return {
    finalUrl: PS26_1_STAGING.landingPageUrl,
    contentHash: rawSha,
    evidenceCapture: {
      rawBody: Buffer.from(stubHtml, 'utf8'),
      rawSha256: rawSha,
      normalisedArticleHtml: stubHtml,
      normalisedHtmlSha256: htmlSha,
      normalisedArticleText: stubText,
      normalisedTextSha256: textSha,
      contentType: 'text/html; charset=utf-8',
      fingerprint: rawSha,
    },
    primaryPdfSha256: pdfSha256,
    htmlSnapshotRole: 'ps26_landing_index_only',
  };
}

function sha256Utf8(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}