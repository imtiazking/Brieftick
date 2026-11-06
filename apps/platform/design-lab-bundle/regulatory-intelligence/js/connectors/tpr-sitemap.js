/** Safe sitemap urlset parsing (regex — no XXE). */
import { CONNECTOR_ERRORS, connectorError } from './connector-errors.js';
import { TPR_SITEMAP_PREFIXES } from './tpr-constants.js';

export function parseSitemapXml(xml) {
  const text = typeof xml === 'string' ? xml : new TextDecoder().decode(xml);
  if (!text.includes('<urlset') && !text.includes('<loc>')) {
    return connectorError(CONNECTOR_ERRORS.PARSE_FAILED, 'Not a sitemap urlset');
  }
  const locs = [];
  const re = /<loc>([^<]+)<\/loc>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    locs.push(m[1].trim());
  }
  if (!locs.length) return connectorError(CONNECTOR_ERRORS.PARSER_STRUCTURE_CHANGED, 'Sitemap contained no loc elements');
  return { ok: true, urls: locs };
}

export function filterTprRegulatoryUrls(urls, limit = 50) {
  const out = [];
  for (const url of urls) {
    try {
      const u = new URL(url);
      const path = u.pathname;
      const ok = TPR_SITEMAP_PREFIXES.some((prefix) => path === prefix.replace(/\/$/, '') || path.startsWith(prefix));
      if (ok) out.push(url);
      if (out.length >= limit) break;
    } catch {
      /* skip */
    }
  }
  return out;
}
