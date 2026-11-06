const STRUCTURED_FIELD_RE = /^(date|reference|status|moduleCode|publicationType|recordVersion)$/i;

export function normalizeExcerptText(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerptMeetsMinimum(excerpt, contextText, fieldReference = null) {
  if (fieldReference && STRUCTURED_FIELD_RE.test(fieldReference)) {
    return { ok: true };
  }
  const normExcerpt = normalizeExcerptText(excerpt);
  const normContext = normalizeExcerptText(contextText);
  if (normExcerpt.length < 20) {
    return { ok: false, message: 'Citation excerpt requires at least 20 normalized characters' };
  }
  if (!normContext.includes(normExcerpt)) {
    return { ok: false, message: 'Citation excerpt not found verbatim in supplied context' };
  }
  return { ok: true };
}
