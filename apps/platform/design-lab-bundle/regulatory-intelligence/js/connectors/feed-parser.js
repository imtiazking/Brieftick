/**
 * Minimal RSS/Atom feed parsing (no external deps).
 */
import { CONNECTOR_ERRORS, connectorError } from './connector-errors.js';

export function parseFeedXml(xml) {
  const text = typeof xml === 'string' ? xml : new TextDecoder().decode(xml);
  if (!text.includes('<rss') && !text.includes('<feed')) {
    return connectorError(CONNECTOR_ERRORS.PARSE_FAILED, 'Not a recognised RSS/Atom feed');
  }
  const items = [];
  const itemBlocks = text.match(/<item[\s\S]*?<\/item>/gi) || text.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of itemBlocks) {
    const title = extractTag(block, 'title');
    const link = extractLink(block);
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated');
    const guid = extractTag(block, 'guid') || extractTag(block, 'id');
    const description = extractTag(block, 'description') || extractTag(block, 'summary');
    if (!title && !link) continue;
    items.push({
      title: decodeEntities(title),
      link,
      publishedAt: normaliseDate(pubDate),
      externalSourceId: guid || link,
      summary: decodeEntities(description),
      discoveryMethod: 'rss',
      sourceMetadata: { rawPubDate: pubDate },
    });
  }
  if (!items.length) {
    return connectorError(CONNECTOR_ERRORS.PARSER_STRUCTURE_CHANGED, 'Feed parsed but no items found');
  }
  return { ok: true, items };
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function extractLink(block) {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (atom) return atom[1];
  const plain = extractTag(block, 'link');
  if (plain && !plain.includes('<')) return plain;
  return '';
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normaliseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
