/**
 * Safe HTML → structured text (untrusted source content).
 */
import { CONNECTOR_ERRORS, connectorError } from './connector-errors.js';

export function parseRegulatoryHtml(html, expectations = {}) {
  const text = typeof html === 'string' ? html : new TextDecoder().decode(html);
  if (!text || text.length < 20) {
    return connectorError(CONNECTOR_ERRORS.PARSE_FAILED, 'HTML content too short');
  }
  const title = extractTitle(text) || expectations.fallbackTitle || '';
  if (expectations.requireTitle && !title) {
    return connectorError(CONNECTOR_ERRORS.PARSER_STRUCTURE_CHANGED, 'Expected publication title not found');
  }
  const main = extractMainContent(text);
  if (expectations.requireContentContainer && main.length < 40) {
    return connectorError(CONNECTOR_ERRORS.PARSER_STRUCTURE_CHANGED, 'Expected content container not found');
  }
  const paragraphs = splitParagraphs(main);
  const warnings = [];
  if (!title) warnings.push('missing publication title');
  if (paragraphs.length < 1) warnings.push('no paragraph blocks extracted');
  const quality = warnings.length ? (paragraphs.length ? 'Complete with Warnings' : 'Partial') : 'Complete';
  if (quality === 'Partial') {
    return connectorError(CONNECTOR_ERRORS.PARSE_FAILED, 'Could not extract meaningful content');
  }
  return {
    ok: true,
    title: stripTags(title),
    paragraphs,
    sections: buildSections(paragraphs),
    metadata: extractMeta(text),
    warnings,
    parseQuality: quality,
    untrustedContentTag: 'UNTRUSTED_SOURCE_CONTENT',
  };
}

function extractTitle(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t ? stripTags(t[1]) : '';
}

function extractMainContent(html) {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article[1];
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

function splitParagraphs(fragment) {
  const ps = [...fragment.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripTags(m[1]).trim()).filter(Boolean);
  if (ps.length) return ps;
  const plain = stripTags(fragment).trim();
  return plain ? plain.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [];
}

function buildSections(paragraphs) {
  return [
    {
      heading: 'Main content',
      sectionNumber: null,
      paragraphs,
      ordinal: 1,
      citationLabel: null,
    },
  ];
}

function extractMeta(html) {
  const pub = html.match(/property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);
  return { publishedAt: pub ? pub[1].slice(0, 10) : null };
}

function stripTags(s) {
  return (s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
