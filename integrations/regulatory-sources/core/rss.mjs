/**
 * Minimal RSS 2.0 / Atom item extraction (untrusted input).
 */

const FCA_HUMAN_PUBLISHED =
  /^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s*-\s*(\d{1,2}:\d{2})$/;

const MONTH_BY_NAME = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * Normalise RSS/Atom published strings to PostgreSQL `date` (YYYY-MM-DD).
 * Does not invent dates when parsing fails.
 *
 * @param {string | null | undefined} raw
 * @returns {{ publicationDate: string | null, sourcePublishedAt: string | null }}
 */
export function normalizeRssPublicationDate(raw) {
  if (raw == null) return { publicationDate: null, sourcePublishedAt: null };
  const sourcePublishedAt = String(raw).trim();
  if (!sourcePublishedAt) return { publicationDate: null, sourcePublishedAt: null };

  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sourcePublishedAt);
  if (isoDateOnly) {
    const y = Number(isoDateOnly[1]);
    const m = Number(isoDateOnly[2]);
    const d = Number(isoDateOnly[3]);
    const publicationDate = toValidDateOnly(y, m, d);
    return { publicationDate, sourcePublishedAt };
  }

  const fca = FCA_HUMAN_PUBLISHED.exec(sourcePublishedAt);
  if (fca) {
    const month = MONTH_BY_NAME[fca[1].toLowerCase()];
    const day = Number(fca[2]);
    const year = Number(fca[3]);
    if (month) {
      const publicationDate = toValidDateOnly(year, month, day);
      return { publicationDate, sourcePublishedAt };
    }
    return { publicationDate: null, sourcePublishedAt };
  }

  const parsedMs = Date.parse(sourcePublishedAt);
  if (!Number.isNaN(parsedMs)) {
    const dt = new Date(parsedMs);
    const publicationDate = toValidDateOnly(
      dt.getUTCFullYear(),
      dt.getUTCMonth() + 1,
      dt.getUTCDate(),
    );
    return { publicationDate, sourcePublishedAt };
  }

  return { publicationDate: null, sourcePublishedAt };
}

function toValidDateOnly(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const probe = Date.UTC(year, month - 1, day);
  const dt = new Date(probe);
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseFeedItems(xml, maxItems = 3) {
  const cap = Math.max(1, Math.floor(maxItems));
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  if (isAtom) {
    const entryBlocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const block of entryBlocks.slice(0, cap)) {
      const title = pickTag(block, 'title');
      const link = pickAtomLink(block);
      const publishedRaw = pickTag(block, 'published') || pickTag(block, 'updated');
      const id = pickTag(block, 'id');
      const { publicationDate, sourcePublishedAt } = normalizeRssPublicationDate(publishedRaw);
      if (title && link) {
        items.push({
          title: decodeEntities(title),
          link,
          published: sourcePublishedAt,
          publicationDate,
          externalId: id,
        });
      }
    }
    return items;
  }
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks.slice(0, cap)) {
    const title = pickTag(block, 'title');
    const link = pickTag(block, 'link') || pickTag(block, 'guid');
    const publishedRaw = pickTag(block, 'pubDate') || pickTag(block, 'date');
    const { publicationDate, sourcePublishedAt } = normalizeRssPublicationDate(publishedRaw);
    if (title && link) {
      items.push({
        title: decodeEntities(title),
        link: link.trim(),
        published: sourcePublishedAt,
        publicationDate,
      });
    }
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
