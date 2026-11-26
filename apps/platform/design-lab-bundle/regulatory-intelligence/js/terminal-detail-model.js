/**
 * Pure view-models for the Publications / Obligations quick-view modal (no DOM, no store access).
 * Fields with no value are shown as an em dash, never invented. Every value is rendered escaped by the caller.
 */

const DASH = '—';

function text(value) {
  if (value == null) return DASH;
  const s = String(value).trim();
  return s ? s : DASH;
}

function dateText(value, format) {
  if (!value) return DASH;
  try {
    return format ? format(value) : String(value);
  } catch {
    return String(value);
  }
}

/** @param {Record<string, any>} p publication record from the store @param {(d: string) => string} [format] */
export function buildPublicationDetail(p, format) {
  if (!p || !p.id) return null;
  const display = p.display || {};
  const detail = p._detail || {};
  const summary = String(detail.summary || p.summary || '').trim();
  return {
    kind: 'publication',
    id: String(p.id),
    eyebrow: text(p.regulator),
    title: text(p.title),
    badges: [display.libraryStatus, display.publicationType].filter(Boolean).map(String),
    fields: [
      { label: 'Reference', value: text(display.reference ?? p.reference) },
      { label: 'Type', value: text(display.publicationType ?? p.publicationType) },
      { label: 'Topic', value: text(display.topic ?? p.topic) },
      { label: 'Published', value: dateText(p.publishedDate, format) },
      { label: 'Effective', value: dateText(p.effectiveDate, format) },
      { label: 'Version', value: text(display.libraryVersion) },
      { label: 'Status', value: text(display.libraryStatus) },
    ],
    summary: summary || null,
    sourceUrl: typeof detail.canonicalUrl === 'string' && /^https:\/\//.test(detail.canonicalUrl) ? detail.canonicalUrl : null,
    fullHref: `#/publication/${encodeURIComponent(String(p.id))}`,
    fullLabel: 'Open publication',
  };
}

/** @param {Record<string, any>} o obligation record from the store @param {(d: string) => string} [format] */
export function buildObligationDetail(o, format) {
  if (!o || !o.id) return null;
  const statement = String(o.statement || o.title || '').trim();
  return {
    kind: 'obligation',
    id: String(o.id),
    eyebrow: text(o.externalKey || String(o.id).slice(0, 8)),
    title: statement ? (statement.length > 160 ? `${statement.slice(0, 160)}…` : statement) : DASH,
    badges: [o.status, o.priority].filter(Boolean).map(String),
    fields: [
      { label: 'Source publication', value: text(o.publicationTitle) },
      { label: 'Citation', value: text(o.citation) },
      { label: 'Owner', value: text(o.ownerLabel || o.owner) },
      { label: 'Priority', value: text(o.priority) },
      { label: 'Effective', value: dateText(o.effectiveDate, format) },
      { label: 'Due', value: dateText(o.dueDate, format) },
      { label: 'Status', value: text(o.status) },
      { label: 'Provenance', value: text(o.dataProvenance) },
    ],
    summary: statement.length > 160 ? statement : null,
    sourceUrl: null,
    fullHref: `#/obligation/${encodeURIComponent(String(o.id))}`,
    fullLabel: 'Open obligation',
  };
}

export const DETAIL_KINDS = Object.freeze(['publication', 'obligation']);
