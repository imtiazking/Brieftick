/**
 * Deterministic JSON canonicalisation for context hashing.
 */
function sortKeys(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortKeys(value[key]);
  }
  return out;
}

export function canonicalJsonString(value) {
  return JSON.stringify(sortKeys(value));
}
