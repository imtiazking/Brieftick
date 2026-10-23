export function validateCitations(claims, allowedSectionIds) {
  const allowed = new Set(allowedSectionIds || []);
  const results = [];
  for (const claim of claims || []) {
    const ids = claim.sourceSectionIds || [];
    const invalid = ids.filter((id) => !allowed.has(id));
    if (invalid.length) {
      results.push({
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
    ok: results.length === 0,
    invalidCitations: results,
    code: results.length ? 'AI_CITATION_INVALID' : null,
  };
}
