/**
 * Safe Atom/XML parsing for legislation.gov.uk (regex-based, no external entities).
 */
import { CONNECTOR_ERRORS, connectorError } from './connector-errors.js';

export function parseLegislationAtom(xml) {
  const text = typeof xml === 'string' ? xml : new TextDecoder().decode(xml);
  if (!text.includes('<feed') && !text.includes('<entry')) {
    return connectorError(CONNECTOR_ERRORS.PARSE_FAILED, 'Not a legislation Atom feed');
  }
  const feedMeta = {
    documentMainType: extractAttr(text, 'ukm:DocumentMainType', 'Value'),
    year: extractAttr(text, 'ukm:Year', 'Value'),
    number: extractAttr(text, 'ukm:Number', 'Value'),
    updated: extractTag(text, 'updated'),
  };
  const entries = [];
  const blocks = text.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    const id = extractTag(block, 'id');
    const title = decodeEntities(extractTag(block, 'title'));
    const updated = extractTag(block, 'updated');
    const published = extractTag(block, 'published');
    const link = extractLink(block);
    const docType = extractAttr(block, 'ukm:DocumentMainType', 'Value');
    const docStatus = extractAttr(block, 'ukm:DocumentStatus', 'Value');
    if (!id && !link && !title) continue;
    entries.push({
      id,
      title,
      link,
      updated,
      published,
      documentMainType: docType,
      documentStatus: docStatus,
    });
  }
  return { ok: true, feedMeta, entries };
}

export function parseLegislationSearchFeed(xml) {
  const parsed = parseLegislationAtom(xml);
  if (!parsed.ok) return parsed;
  const items = parsed.entries
    .filter((e) => e.title && (e.link || e.id))
    .map((e) => ({
      title: e.title,
      link: normaliseLegislationHttps(e.link || e.id),
      publishedAt: (e.published || e.updated || '').slice(0, 10) || null,
      externalSourceId: e.id,
      documentMainType: e.documentMainType,
      discoveryMethod: 'legislation-govuk-atom',
    }));
  if (!items.length) {
    return connectorError(CONNECTOR_ERRORS.PARSER_STRUCTURE_CHANGED, 'Legislation feed had no usable entries');
  }
  return { ok: true, items };
}

export function normaliseLegislationHttps(url) {
  if (!url) return url;
  return url.replace(/^http:\/\//i, 'https://');
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function extractAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function extractLink(block) {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (atom) return atom[1];
  return extractTag(block, 'link');
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
