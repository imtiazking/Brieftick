import { classListIncludes, extractElementsByTagName } from './html-dom-lite.mjs';
import { stripHtmlToPlainText } from './html-publication-text.mjs';
import { discoverPdfAttachments } from './pdf-attachments.mjs';

/**
 * @param {string} bodyHtml
 * @param {string} fullHtml
 * @param {string} [articleAttrs]
 * @param {string} [finalUrl]
 */
export function buildFcaPublicationMetadata(bodyHtml, fullHtml, articleAttrs = '', finalUrl = '') {
  const title = extractPublicationTitle(bodyHtml, fullHtml);
  const typeField = bodyHtml.match(
    /field--name-field-publication-type[\s\S]*?field__item[^>]*>([\s\S]*?)<\//i,
  );
  const publicationTypeLabel = typeField ? stripHtmlToPlainText(typeField[1]) : null;
  const consultationTimeline = extractConsultationTimelineMetadata(fullHtml);
  const pdfAttachments = discoverPdfAttachments(fullHtml, finalUrl);
  const primaryPdf = pdfAttachments.find((p) => p.likelyPrimaryRegulatoryDocument) || null;

  return {
    title,
    publicationTypeLabel,
    consultationTimeline,
    primaryPdf: primaryPdf
      ? {
          url: primaryPdf.url,
          title: primaryPdf.title,
          relationship: primaryPdf.relationship,
          captured: false,
        }
      : null,
    primaryDocumentClassification: primaryPdf ? 'pdf_primary_webpage_summary' : 'webpage_only',
    drupalAbout: parseAboutAttr(articleAttrs),
    drupalNodeId: parseNodeId(articleAttrs),
  };
}

function parseAboutAttr(articleAttrs) {
  const m = /about="([^"]+)"/i.exec(articleAttrs || '');
  return m?.[1] || null;
}

function parseNodeId(articleAttrs) {
  const m = /data-history-node-id="([^"]+)"/i.exec(articleAttrs || '');
  return m?.[1] || null;
}

function extractPublicationTitle(bodyHtml, fullHtml) {
  const h1 = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = stripHtmlToPlainText(h1[1]);
    if (t.length > 3) return t;
  }
  for (const level of ['h2', 'h3']) {
    const re = new RegExp(`<${level}[^>]*>([\\s\\S]*?)<\\/${level}>`, 'i');
    const m = bodyHtml.match(re);
    if (m) {
      const t = stripHtmlToPlainText(m[1]);
      if (/CP\d+\/\d+/i.test(t) || t.length > 12) return t;
    }
  }
  const og = fullHtml.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  if (og?.[1]) return decodeHtmlEntities(og[1].trim());
  const cpLine = stripHtmlToPlainText(bodyHtml).match(/CP\d+\/\d+:\s*[^.]+/i);
  if (cpLine) return cpLine[0].trim();
  return null;
}

function extractConsultationTimelineMetadata(fullHtml) {
  const articles = extractElementsByTagName(fullHtml, 'article');
  const timeline = articles.find((a) => classListIncludes(a.attrs, 'publication-timeline-slick'));
  if (!timeline) {
    return { present: false, opens: null, closes: null, opensDate: null, closesDate: null };
  }
  const plain = stripHtmlToPlainText(timeline.outerHtml);
  const dates = plain.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  return {
    present: true,
    opens: /consultation opens/i.test(plain) ? true : null,
    closes: /consultation closes/i.test(plain) ? true : null,
    opensDate: dates[0] || null,
    closesDate: dates[dates.length - 1] || null,
  };
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
