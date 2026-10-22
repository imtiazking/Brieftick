/**
 * Minimal RSS 2.0 / Atom item extraction (untrusted input).
 */
export function parseFeedItems(xml, maxItems = 3) {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  if (isAtom) {
    const entryBlocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const block of entryBlocks.slice(0, maxItems)) {
      const title = pickTag(block, 'title');
      const link = pickAtomLink(block);
      const published = pickTag(block, 'published') || pickTag(block, 'updated');
      const id = pickTag(block, 'id');
      if (title && link) items.push({ title: decodeEntities(title), link, published, externalId: id });
    }
    return items;
  }
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks.slice(0, maxItems)) {
    const title = pickTag(block, 'title');
    const link = pickTag(block, 'link') || pickTag(block, 'guid');
    const published = pickTag(block, 'pubDate') || pickTag(block, 'date');
    if (title && link) items.push({ title: decodeEntities(title), link: link.trim(), published });
  }
  return items;
}

function pickTag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  if (!m) return null;
  return stripCdata(m[1].trim());
}

function stripCdata(value) {
  if (!value) return value;
  const cdata = value.match(/^<!\[CDATA\[([\s\S]*?)]]>$/i);
  return (cdata ? cdata[1] : value).trim();
}

function pickAtomLink(block) {
  const relAlt = block.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i);
  if (relAlt) return relAlt[1];
  const href = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return href ? href[1] : null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
