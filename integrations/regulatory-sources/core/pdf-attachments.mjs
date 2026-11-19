import { parseHtmlAttributes } from './html-dom-lite.mjs';

/**
 * Discover linked PDF documents in HTML (metadata only — no download).
 * @param {string} html
 * @param {string} [pageUrl]
 */
export function discoverPdfAttachments(html, pageUrl = '') {
  const attachments = [];
  const re = /<a\s+([^>]*?)href\s*=\s*"([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(String(html))) !== null) {
    const href = m[2].trim();
    if (!/\.pdf(\?|#|$)/i.test(href)) continue;
    const abs = resolveUrl(href, pageUrl);
    if (seen.has(abs)) continue;
    seen.add(abs);
    const innerText = m[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const attrs = parseHtmlAttributes(`${m[1]} ${m[3]}`);
    attachments.push({
      url: abs,
      title: innerText || inferTitleFromUrl(abs),
      documentType: 'pdf',
      relationship: inferPdfRelationship(innerText, abs),
      likelyPrimaryRegulatoryDocument: likelyPrimaryPdf(innerText, abs),
    });
  }
  return attachments;
}

function resolveUrl(href, pageUrl) {
  if (/^https?:\/\//i.test(href)) return href;
  if (!pageUrl) return href;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return href;
  }
}

function inferTitleFromUrl(url) {
  const part = url.split('/').pop() || 'document.pdf';
  return decodeURIComponent(part.replace(/\?.*$/, ''));
}

function inferPdfRelationship(linkText, url) {
  const t = `${linkText} ${url}`.toLowerCase();
  if (t.includes('consultation') || /\bcp\d+/i.test(t)) return 'consultation_paper_pdf';
  if (t.includes('policy statement') || /\bps\d+/i.test(t)) return 'policy_statement_pdf';
  if (t.includes('finalised') || t.includes('final rules')) return 'final_rules_pdf';
  return 'supporting_pdf';
}

function likelyPrimaryPdf(linkText, url) {
  const t = `${linkText} ${url}`.toLowerCase();
  if (/\bread\b/.test(t) && (/\bcp\d+/i.test(t) || /\.pdf/.test(t))) return true;
  if (/\b(cp|ps)\d+/i.test(t)) return true;
  return false;
}
