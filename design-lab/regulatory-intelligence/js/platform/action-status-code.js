/** Canonical action status code for forms and PATCH (DB enum, e.g. IN_PROGRESS). */
export function normalizeActionStatusCode(raw) {
  if (raw === null || raw === undefined || raw === '') return 'OPEN';
  const s = String(raw).trim();
  if (/^[A-Z][A-Z0-9_]*$/.test(s)) return s;
  return s.toUpperCase().replace(/\s+/g, '_');
}

export function resolveActionStatusCode(action) {
  if (action?.statusCode != null && String(action.statusCode).trim() !== '') {
    return normalizeActionStatusCode(action.statusCode);
  }
  return normalizeActionStatusCode(action?.status ?? 'OPEN');
}
