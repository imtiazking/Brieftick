/** Pure helpers shared by production services and local DB acceptance. */

export function resolveAcceptedClaimIndexes(decision, acceptedClaimIndexes, totalClaims) {
  if (decision === 'REJECTED') return [];
  if (acceptedClaimIndexes?.length > 0) return acceptedClaimIndexes;
  if (decision === 'ACCEPTED' && totalClaims > 0) {
    return Array.from({ length: totalClaims }, (_, i) => i);
  }
  return [];
}
