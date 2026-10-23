export function validateCitations(claims, allowedSectionIds) {
  const allowed = new Set(allowedSectionIds || []);
  const invalidCitations = [];
  for (const claim of claims || []) {
    const ids = claim.sourceSectionIds || [];
    const invalid = ids.filter((id) => !allowed.has(id));
    if (invalid.length) {
      invalidCitations.push({ invalidSectionIds: invalid });
      claim.citationStatus = 'Invalid Citation';
    }
  }
  return { ok: invalidCitations.length === 0, code: invalidCitations.length ? 'AI_CITATION_INVALID' : null };
}
