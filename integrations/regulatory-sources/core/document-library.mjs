import { assertUrlAllowed } from './url-safety.mjs';

/**
 * Extract official document URLs (PDF, details pages) from regulator HTML indexes.
 */
export function extractDocumentLinks(html, pageUrl, allowedHosts, max = 3) {
  const base = new URL(pageUrl);
  const seen = new Set();
  const candidates = [];
  const hrefRe = /href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    let href = m[1].replace(/&amp;/g, '&');
    if (href.startsWith('mailto:') || href.startsWith('javascript:')) continue;
    let abs;
    try {
      abs = new URL(href, base).toString();
    } catch {
      continue;
    }
    const gate = assertUrlAllowed(abs, allowedHosts);
    if (!gate.ok) continue;
    const path = gate.url.pathname.toLowerCase();
    const key = gate.url.origin + gate.url.pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    const isPdf = /\.pdf$/i.test(path);
    const isDetails = /details\.aspx/i.test(path);
    const isDocFolder = /\/(documents?|files?|download|attachments?|media)\//i.test(path);
    const isRegulatoryDoc =
      isPdf ||
      isDetails ||
      isDocFolder ||
      /\.(docx?|xlsx?)$/i.test(path) ||
      /\/rules?\//i.test(path) ||
      /\/regulations?\//i.test(path);
    if (!isRegulatoryDoc) continue;
    const score =
      (isPdf ? 8 : isDetails ? 6 : 4) + (/\/20\d{2}/.test(path) ? 2 : 0);
    const title = decodeURIComponent(path.split('/').pop() || path).replace(/-/g, ' ');
    candidates.push({ link: gate.url.toString(), title, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, max);
}
