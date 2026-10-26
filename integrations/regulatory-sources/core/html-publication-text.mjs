import { normaliseHtmlForFingerprint } from './fingerprint.mjs';

const DEFAULT_MAX_SUMMARY_LENGTH = 400;

/**
 * Extract primary FCA content region for readable text (publication + /data/ pages).
 * @param {string} html
 * @returns {string|null}
 */
export function extractPrimaryContentHtml(html) {
  const stripped = normaliseHtmlForFingerprint(html);
  if (!stripped) return null;
  if (/^<article[\s>]/i.test(stripped)) return stripped;
  const raw = String(html);
  const main = raw.match(/<main[\s\S]*?<\/main>/i);
  if (main) return main[0];
  const nodeContent = raw.match(/<div[^>]+class="[^"]*node__content[^"]*"[\s\S]*?<\/div>\s*<\/div>/i);
  if (nodeContent) return nodeContent[0];
  return stripped.length > 0 ? stripped : null;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function stripHtmlToPlainText(htmlFragment) {
  if (!htmlFragment) return '';
  let s = String(htmlFragment);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeHtmlEntities(s);
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Heuristic rejection of CSS / chrome mistaken as summary text.
 * @param {string} text
 */
export function summaryTextLooksCorrupted(text) {
  if (!text || text.length < 20) return true;
  const sample = text.slice(0, 200);
  if (/^div#[\w-]+/.test(sample)) return true;
  if ((sample.match(/\{/g) || []).length >= 2 && (sample.match(/#/g) || []).length >= 2) return true;
  const braceRatio = (text.match(/[{}]/g) || []).length / text.length;
  if (braceRatio > 0.08) return true;
  const alphaWords = text.match(/[a-zA-Z]{4,}/g);
  if (!alphaWords || alphaWords.length < 3) return true;
  return false;
}

/**
 * @param {string} html
 * @param {{ maxLength?: number }} [options]
 * @returns {string|null}
 */
export function extractPublicationSummaryFromHtml(html, options = {}) {
  const maxLength = options.maxLength ?? DEFAULT_MAX_SUMMARY_LENGTH;
  const region = extractPrimaryContentHtml(html);
  if (!region) return null;
  const plain = stripHtmlToPlainText(region);
  if (!plain || summaryTextLooksCorrupted(plain)) return null;
  if (plain.length <= maxLength) return plain;
  const truncated = plain.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated).trim() + '…';
}
