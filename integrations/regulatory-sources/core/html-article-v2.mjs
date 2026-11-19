import { sha256Hex } from './fingerprint.mjs';
import {
  canonicaliseHtmlForFingerprintV2,
  selectFcaPublicationBodyHtml,
} from './fca-html-extraction-v2.mjs';

/**
 * html_article_v2 — structural FCA body selection (does not alter html_article_v1).
 * @param {string} html
 * @param {{ finalUrl?: string }} [options]
 */
export function normaliseHtmlForFingerprintV2(html, options = {}) {
  const selected = selectFcaPublicationBodyHtml(html, { finalUrl: options.finalUrl });
  if (!selected.ok) {
    return { ok: false, code: selected.code, message: selected.message };
  }
  return {
    ok: true,
    normalised: canonicaliseHtmlForFingerprintV2(selected.bodyHtml),
    selection: selected.selection,
    publicationMetadata: selected.publicationMetadata,
    pdfAttachments: selected.pdfAttachments,
  };
}

/**
 * @param {string | Buffer | Uint8Array} content
 * @param {{ contentType?: string, finalUrl?: string }} [options]
 */
export async function fingerprintContentV2(content, options = {}) {
  const contentType = options.contentType ?? '';
  if (!String(contentType).toLowerCase().includes('html')) {
    const text =
      typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
    const normalised = text.replace(/\r\n/g, '\n').trim();
    const hash = await sha256Hex(normalised);
    return { algorithm: 'SHA-256', hash, normalisation: 'raw_v1' };
  }

  const text = typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
  const norm = normaliseHtmlForFingerprintV2(text, { finalUrl: options.finalUrl });
  if (!norm.ok) {
    return {
      algorithm: 'SHA-256',
      hash: null,
      normalisation: 'html_article_v2',
      error: norm.code,
      message: norm.message,
    };
  }
  const hash = await sha256Hex(norm.normalised);
  return {
    algorithm: 'SHA-256',
    hash,
    normalisation: 'html_article_v2',
    selection: norm.selection,
    publicationMetadata: norm.publicationMetadata,
    pdfAttachments: norm.pdfAttachments,
  };
}
