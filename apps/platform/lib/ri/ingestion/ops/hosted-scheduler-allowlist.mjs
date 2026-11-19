/**
 * Sources approved for hosted staging scheduler (Phase 84 — not the 10 blocked sources, not OFAC SDN).
 */
export const HOSTED_SCHEDULER_EXCLUDED_SOURCE_IDS = new Set([
  'SRC-OFAC-SDN-LISTS',
  'SRC-CBUAE-DIGITAL-RULEBOOK',
]);

/**
 * @param {string} sourceExternalKey
 */
export function isSourceAllowedForHostedScheduler(sourceExternalKey) {
  return !HOSTED_SCHEDULER_EXCLUDED_SOURCE_IDS.has(sourceExternalKey);
}
