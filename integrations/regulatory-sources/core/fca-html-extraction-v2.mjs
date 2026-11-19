import {
  classListIncludes,
  extractElementsByTagName,
  removeElementsWithClass,
  stripDocumentChrome,
} from './html-dom-lite.mjs';
import { stripHtmlToPlainText } from './html-publication-text.mjs';
import { discoverPdfAttachments } from './pdf-attachments.mjs';
import { buildFcaPublicationMetadata } from './fca-publication-metadata.mjs';

const EXCLUDED_ARTICLE_CLASSES = new Set([
  'publication-timeline-slick',
]);

const PREFERRED_ARTICLE_CLASS_TOKENS = [
  'article-header',
  'node-publication-longform',
  'node-data',
  'node-publication',
];

/**
 * @typedef {{ ok: true, bodyHtml: string, selection: object, publicationMetadata: object, pdfAttachments: object[] } | { ok: false, code: string, message?: string }} FcaExtractionResult
 */

/**
 * Select substantive FCA publication HTML using structural article parsing.
 * @param {string} html
 * @param {{ finalUrl?: string }} [options]
 * @returns {FcaExtractionResult}
 */
export function selectFcaPublicationBodyHtml(html, options = {}) {
  const cleaned = stripDocumentChrome(html);
  const articles = extractElementsByTagName(cleaned, 'article');
  if (articles.length === 0) {
    const fallback = extractNodeContentFallback(cleaned);
    if (!fallback) {
      return { ok: false, code: 'fca_extraction_no_article', message: 'No article container found' };
    }
    return packageResult(fallback, 'node__content', options.finalUrl, cleaned);
  }

  const candidates = articles.filter((a) => {
    for (const excluded of EXCLUDED_ARTICLE_CLASSES) {
      if (classListIncludes(a.attrs, excluded)) return false;
    }
    if (/publication-timeline/i.test(a.attrs)) return false;
    return true;
  });

  let chosen = null;
  let reason = 'largest_text';

  for (const token of PREFERRED_ARTICLE_CLASS_TOKENS) {
    const preferred = candidates.find((a) => classListIncludes(a.attrs, token));
    if (preferred) {
      chosen = preferred;
      reason = `preferred_class_${token}`;
      break;
    }
  }

  if (!chosen && candidates.length > 0) {
    chosen = candidates.reduce((best, cur) => {
      const bestLen = stripHtmlToPlainText(best.outerHtml).length;
      const curLen = stripHtmlToPlainText(cur.outerHtml).length;
      return curLen > bestLen ? cur : best;
    });
  }

  if (!chosen) {
    return { ok: false, code: 'fca_extraction_only_timeline', message: 'Only timeline widgets found' };
  }

  let bodyHtml = chosen.outerHtml;
  bodyHtml = removeElementsWithClass(bodyHtml, 'publication-timeline-slick');
  bodyHtml = removeNestedTimelineArticles(bodyHtml);

  const plainText = stripHtmlToPlainText(bodyHtml);
  const plainLen = plainText.length;
  if (plainLen < 40) {
    return { ok: false, code: 'fca_extraction_too_short', message: 'Extracted body too short' };
  }
  if (
    plainLen < 120 &&
    /^consultation opens\b/i.test(plainText) &&
    /consultation closes\b/i.test(plainText) &&
    !/\b(consulting|firm|financial|regulatory)\b/i.test(plainText)
  ) {
    return { ok: false, code: 'fca_extraction_timeline_only', message: 'Timeline widget without narrative' };
  }

  return packageResult(bodyHtml, reason, options.finalUrl, cleaned, chosen.attrs);
}

function packageResult(bodyHtml, selectionReason, finalUrl, fullHtml, articleAttrs = '') {
  const publicationMetadata = buildFcaPublicationMetadata(
    bodyHtml,
    fullHtml,
    articleAttrs,
    finalUrl || '',
  );
  const pdfAttachments = discoverPdfAttachments(fullHtml, finalUrl || '');
  return {
    ok: true,
    bodyHtml,
    selection: { method: 'html_article_v2', reason: selectionReason },
    publicationMetadata,
    pdfAttachments,
  };
}

function removeNestedTimelineArticles(html) {
  const articles = extractElementsByTagName(html, 'article');
  let s = html;
  for (const a of articles) {
    if (classListIncludes(a.attrs, 'publication-timeline-slick')) {
      s = s.replace(a.outerHtml, '');
    }
  }
  return s;
}

function extractNodeContentFallback(cleaned) {
  const main = cleaned.match(/<main[\s\S]*?<\/main>/i);
  if (main) return main[0];
  const nodeContent = cleaned.match(
    /<div[^>]+class="[^"]*node__content[^"]*"[\s\S]*?<\/div>\s*<\/div>/i,
  );
  return nodeContent ? nodeContent[0] : null;
}

/**
 * Canonical whitespace normalisation for v2 fingerprint input.
 * @param {string} html
 */
export function canonicaliseHtmlForFingerprintV2(html) {
  return String(html).replace(/\s+/g, ' ').trim();
}
