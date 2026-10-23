import { parseRegulatoryHtml } from './html-parser.js';
import { parsePdfBoundary, validatePdfContentType } from './pdf-parser.js';
import { parseFeedXml } from './feed-parser.js';
import { CONNECTOR_ERRORS, connectorError } from './connector-errors.js';

export const PARSER_VERSION = 'RI-PARSER-2.0';

export function parseHtmlDocument(html, options = {}) {
  const r = parseRegulatoryHtml(html, options);
  if (!r.ok) return r;
  return { ...r, parserVersion: PARSER_VERSION, parserType: 'html' };
}

export function parsePdfDocument(bytes, fixtureText = null) {
  const r = parsePdfBoundary(bytes, fixtureText);
  return { ...r, parserVersion: PARSER_VERSION, parserType: 'pdf' };
}

export function parseXmlFeed(xml) {
  const r = parseFeedXml(xml);
  if (!r.ok) return r;
  return { ...r, parserVersion: PARSER_VERSION, parserType: 'rss' };
}

export function validateContentType(expected, actual) {
  const a = (actual || '').toLowerCase();
  const allowed = (Array.isArray(expected) ? expected : [expected]).map((x) => x.toLowerCase());
  if (!a) return connectorError(CONNECTOR_ERRORS.CONTENT_TYPE_UNSUPPORTED, 'Missing content type');
  const ok = allowed.some((e) => a.includes(e));
  if (!ok) return connectorError(CONNECTOR_ERRORS.CONTENT_TYPE_UNSUPPORTED, `Unsupported content type: ${actual}`);
  return { ok: true };
}
