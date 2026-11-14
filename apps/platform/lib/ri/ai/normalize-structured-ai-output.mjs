/**
 * Align provider JSON (candidates[]) with persisted claims[] + citation validation.
 */

const BINDING_VALUES = new Set([
  'binding_requirement',
  'regulatory_rule',
  'finalised_guidance_expectation',
]);
const NON_BINDING = new Set(['guidance', 'explanatory_commentary', 'consultation_proposal', 'unknown']);

/**
 * @param {unknown} raw
 * @param {Set<string>} allowedSectionIds
 */
function resolveCandidateSourceSectionIds(raw, allowedSectionIds) {
  const ids = [];
  if (Array.isArray(raw?.sourceSectionIds)) {
    for (const id of raw.sourceSectionIds) {
      if (typeof id === 'string' && allowedSectionIds.has(id)) ids.push(id);
    }
  }
  if (!ids.length && typeof raw?.sourceSection === 'string' && allowedSectionIds.has(raw.sourceSection)) {
    ids.push(raw.sourceSection);
  }
  if (!ids.length && typeof raw?.sourceSectionId === 'string' && allowedSectionIds.has(raw.sourceSectionId)) {
    ids.push(raw.sourceSectionId);
  }
  return [...new Set(ids)];
}

/**
 * @param {Record<string, unknown>} structured
 * @param {string} schemaName
 * @param {string[]} allowedSectionIds
 */
export function normalizeAnalysisStructuredOutput(structured, schemaName, allowedSectionIds) {
  if (!structured || typeof structured !== 'object') {
    return { structured: { insufficientEvidence: true, confidence: 0, candidates: [], claims: [] }, claims: [] };
  }

  const allowed = new Set(allowedSectionIds || []);
  const out = { ...structured };

  if (schemaName === 'ObligationExtractionResult' || schemaName === 'ChangeExtractionResult') {
    const candidates = Array.isArray(out.candidates) ? out.candidates : [];
    let claims = Array.isArray(out.claims) ? out.claims : [];

    if (!claims.length && candidates.length) {
      claims = candidates.map((c, index) => {
        const sourceSectionIds = resolveCandidateSourceSectionIds(c, allowed);
        const text =
          (typeof c.statement === 'string' && c.statement) ||
          (typeof c.title === 'string' && c.title) ||
          '';
        const bindingNature =
          typeof c.bindingNature === 'string'
            ? c.bindingNature
            : typeof c.bindingStatus === 'string'
              ? c.bindingStatus
              : 'unknown';
        const confidence = typeof c.confidence === 'number' ? c.confidence : Number(out.confidence) || null;
        const groundingStatus = sourceSectionIds.length
          ? 'Supported'
          : 'Insufficient Source Evidence';
        const citationStatus = sourceSectionIds.length ? 'Supported' : 'Missing';
        return {
          text,
          confidence,
          sourceSectionIds,
          bindingNature,
          materiality: c.materiality,
          citation: c.citation,
          sourceSection: c.sourceSection,
          effectiveDate: c.effectiveDate,
          applicabilityConditions: c.applicabilityConditions,
          sourceQuotation: c.sourceQuotation,
          _candidateIndex: index,
          citationStatus,
          groundingStatus,
        };
      });
      out.claims = claims;
    }

    const supported = claims.filter((c) => (c.sourceSectionIds || []).length > 0);
    if (!supported.length && candidates.length > 0) {
      out.insufficientEvidence = true;
      out.insufficientEvidenceReason = 'no_candidates_with_valid_pdf_evidence_ids';
    }
    if (!candidates.length && !claims.length) {
      out.insufficientEvidence = true;
      out.insufficientEvidenceReason = 'empty_extraction_result';
    }

    out._normalizedAt = new Date().toISOString();
    out._normalizedSchema = schemaName;
  }

  const claimsOut = Array.isArray(out.claims) ? out.claims : [];
  return { structured: out, claims: claimsOut };
}

export function isBindingObligationCandidate(claim) {
  const nature = String(claim?.bindingNature || '').toLowerCase();
  if (NON_BINDING.has(nature)) return false;
  if (BINDING_VALUES.has(nature)) return true;
  return nature === 'binding_obligation';
}