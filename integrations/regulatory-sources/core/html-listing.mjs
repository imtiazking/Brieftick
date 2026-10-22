import { assertUrlAllowed } from './url-safety.mjs';

const SKIP_EXT = /\.(css|js|png|jpe?g|gif|svg|ico|woff2?)(\?|$)/i;

/**
 * Extract likely publication links from an official listing HTML page.
 * @param {string} html
 * @param {string} pageUrl
 * @param {string[]} allowedHosts
 * @param {number} max
 */
export function extractListingLinks(html, pageUrl, allowedHosts, max = 3) {
  const base = new URL(pageUrl);
  const seen = new Set();
  const out = [];
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
    if (SKIP_EXT.test(path)) continue;
    if (gate.url.hostname === base.hostname && gate.url.pathname === base.pathname) continue;
    const key = gate.url.origin + gate.url.pathname;
    if (seen.has(key)) continue;
    const segments = path.split('/').filter(Boolean);
    const looksPublication =
      /\/(20\d{2})\//.test(path) ||
      /(publication|notice|notices|news|guidance|rule|circular|consultation|enforcement|decision|press-release|media-center)/i.test(
        path,
      );
    if (!looksPublication) continue;
    if (segments.length < 3) continue;
    const last = segments[segments.length - 1];
    if (['news', 'publications', 'notices', 'enforcement', 'consultations'].includes(last)) continue;
    seen.add(key);
    const titleGuess = last.replace(/\.(aspx|html)$/i, '').replace(/-/g, ' ');
    const score = (/\/20\d{2}\//.test(path) ? 10 : 0) + segments.length;
    out.push({ link: gate.url.toString(), title: titleGuess, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, max);
}
