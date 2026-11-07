/**
 * Active monitoring requires success evidence within the configured stale window.
 * @param {string | null | undefined} lastSuccessAt ISO timestamp
 * @param {number | null | undefined} staleAfterMinutes from regulatory_source_operations
 * @param {Date} [now]
 */
export function isMonitoringSuccessRecent(lastSuccessAt, staleAfterMinutes, now = new Date()) {
  if (!lastSuccessAt) return false;
  const cap = typeof staleAfterMinutes === 'number' && staleAfterMinutes > 0 ? staleAfterMinutes : 10080;
  const ageMin = (now.getTime() - new Date(lastSuccessAt).getTime()) / 60000;
  return ageMin <= cap;
}
