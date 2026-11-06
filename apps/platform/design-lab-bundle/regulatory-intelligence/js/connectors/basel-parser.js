/**
 * Basel Framework HTML metadata (untrusted source).
 */
import { parseRegulatoryHtml } from './html-parser.js';

export function parseBaselStandardHtml(html, options = {}) {
  const base = parseRegulatoryHtml(html, { fallbackTitle: options.fallbackTitle });
  if (!base.ok) return base;
  const text = typeof html === 'string' ? html : new TextDecoder().decode(html);
  const effectiveMatch = text.match(/Effective as of[:\s]*<[^>]*>?\s*([^<]+)/i) || text.match(/effective as of[:\s]*(\d{1,2}\s+\w+\s+\d{4})/i);
  const futureMatch = text.match(/new future version|future version|will become applicable/i);
  const draftMatch = text.match(/\bDRAFT\b|under consultation/i);
  let versionStatus = 'CURRENT';
  if (draftMatch) versionStatus = 'DRAFT';
  else if (futureMatch && !effectiveMatch) versionStatus = 'FUTURE';
  const moduleFromPath = options.frameworkModule || extractModuleFromPath(options.path || '');
  return {
    ...base,
    effectiveDate: effectiveMatch ? normaliseDateText(effectiveMatch[1]) : null,
    versionStatus,
    frameworkModule: moduleFromPath,
    hasFutureVersionLink: Boolean(futureMatch),
  };
}

function extractModuleFromPath(path) {
  const m = (path || '').match(/\/standard\/([a-z]{3})/i);
  return m ? m[1].toUpperCase() : null;
}

function normaliseDateText(raw) {
  const t = (raw || '').replace(/\s+/g, ' ').trim();
  return t.length > 4 ? t : null;
}
