/** Citation validation — ported from Design Lab ai-runtime/citation-validator.js */

export type AiClaim = {
  text?: string;
  sourceSectionIds?: string[];
  materiality?: string;
  citationStatus?: string;
  groundingStatus?: string;
};

export function validateCitations(claims: AiClaim[], allowedSectionIds: string[]) {
  const allowed = new Set(allowedSectionIds || []);
  const invalidCitations: { claimText?: string; invalidSectionIds: string[]; status: string }[] = [];
  for (const claim of claims || []) {
    const ids = claim.sourceSectionIds || [];
    const invalid = ids.filter((id) => !allowed.has(id));
    if (invalid.length) {
      invalidCitations.push({
        claimText: claim.text,
        invalidSectionIds: invalid,
        status: 'Invalid Citation',
      });
      claim.citationStatus = 'Invalid Citation';
      claim.groundingStatus = 'Unsupported Claim Detected';
    } else if (!ids.length && claim.materiality !== 'Low') {
      claim.citationStatus = 'Missing';
      claim.groundingStatus = claim.groundingStatus || 'Insufficient Source Evidence';
    } else {
      claim.citationStatus = claim.citationStatus || 'Supported';
    }
  }
  return {
    ok: invalidCitations.length === 0,
    invalidCitations,
    code: invalidCitations.length ? 'AI_CITATION_INVALID' : null,
  };
}

export function mapCitationStatusToDb(claim: AiClaim): 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED' | 'INVALID' {
  if (claim.citationStatus === 'Invalid Citation') return 'INVALID';
  if (claim.groundingStatus === 'Partially Supported') return 'PARTIAL';
  if (claim.citationStatus === 'Supported') return 'VERIFIED';
  return 'UNVERIFIED';
}
