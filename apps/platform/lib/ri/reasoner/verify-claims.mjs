/**
 * Deterministic post-model claim verification (Phase 2C.2).
 */
import { validateReasonerOutput } from './reasoner-output-schema.mjs';

const ENTITY_MAP = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

export function canonicalizeExcerptText(text) {
  let s = String(text || '');
  for (const [ent, ch] of Object.entries(ENTITY_MAP)) {
    s = s.split(ent).join(ch);
  }
  return s.replace(/\s+/g, ' ').trim();
}

function sliceSource(chunk, start, end) {
  const text = String(chunk.verbatimText || '');
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  return text.slice(safeStart, safeEnd);
}

function excerptMatchesSource(chunk, citation) {
  const fromOffsets = canonicalizeExcerptText(sliceSource(chunk, citation.excerptStartOffset, citation.excerptEndOffset));
  const fromExcerpt = canonicalizeExcerptText(citation.verbatimExcerpt);
  if (!fromExcerpt.length) return { ok: false, reason: 'empty_excerpt' };
  if (fromOffsets === fromExcerpt) return { ok: true };
  if (fromOffsets.includes(fromExcerpt) || fromExcerpt.includes(fromOffsets)) return { ok: true };
  const full = canonicalizeExcerptText(chunk.verbatimText);
  if (full.includes(fromExcerpt)) return { ok: true };
  return { ok: false, reason: 'excerpt_mismatch' };
}

/**
 * @param {object} modelOutput
 * @param {{ evidenceChunks: object[], chunkById: Map }} bundle
 */
export function verifyReasonerClaims(modelOutput, bundle) {
  const schema = validateReasonerOutput(modelOutput);
  const failures = [];
  const perClaim = [];

  if (!schema.ok) {
    return {
      ok: false,
      schemaOk: false,
      failures: schema.errors.map((e) => ({ check: 'schema', code: e })),
      perClaim: [],
      verifiedClaims: [],
      unsupportedClaims: modelOutput?.claims || [],
    };
  }

  const pubIdsInBundle = new Set((bundle.evidenceChunks || []).map((c) => c.publicationId));

  for (const claim of modelOutput.claims) {
    const claimResult = { claimId: claim.claimId, ok: true, citationResults: [] };
    if (claim.classification === 'unsupported') {
      claimResult.ok = false;
      failures.push({ check: 'unsupported_claim_in_answer', claimId: claim.claimId });
    }

    for (const cit of claim.citations || []) {
      const chunk = bundle.chunkById.get(cit.evidenceChunkId);
      const citRes = { evidenceChunkId: cit.evidenceChunkId, ok: true, reasons: [] };
      if (!chunk) {
        citRes.ok = false;
        citRes.reasons.push('chunk_not_in_bundle');
      } else {
        if (!pubIdsInBundle.has(cit.publicationId)) citRes.reasons.push('publication_not_in_bundle');
        if (cit.publicationId !== chunk.publicationId) citRes.reasons.push('publication_id_mismatch');
        if (cit.extractionRevisionId !== chunk.extractionRevisionId) citRes.reasons.push('extraction_revision_mismatch');
        const page = chunk.physicalPageNumber;
        if (cit.physicalPageNumber != null && page != null && cit.physicalPageNumber !== page) {
          citRes.reasons.push('page_mismatch');
        }
        if (cit.sectionReference && chunk.sectionReference && cit.sectionReference !== chunk.sectionReference) {
          citRes.reasons.push('section_mismatch');
        }
        const ex = excerptMatchesSource(chunk, cit);
        if (!ex.ok) citRes.reasons.push(ex.reason);
        if (claim.classification === 'verified_fact' && citRes.reasons.length) {
          citRes.reasons.push('verified_fact_requires_strict_citation');
        }
      }
      if (citRes.reasons.length) {
        citRes.ok = false;
        claimResult.ok = false;
        for (const r of citRes.reasons) failures.push({ check: r, claimId: claim.claimId, evidenceChunkId: cit.evidenceChunkId });
      }
      claimResult.citationResults.push(citRes);
    }

    if ((claim.classification === 'reasoned_implication' || claim.classification === 'consultation_proposal') && claim.humanReviewRequired !== true) {
      failures.push({ check: 'human_review_flag', claimId: claim.claimId });
      claimResult.ok = false;
    }

    perClaim.push(claimResult);
  }

  for (const topCit of modelOutput.citations || []) {
    if (!bundle.chunkById.get(topCit.evidenceChunkId)) {
      failures.push({ check: 'top_level_citation_unknown', evidenceChunkId: topCit.evidenceChunkId });
    }
  }

  const verifiedClaims = modelOutput.claims.filter((c, i) => perClaim[i]?.ok);
  const unsupportedClaims = modelOutput.claims.filter((c, i) => !perClaim[i]?.ok);

  const mandatoryFail = failures.some((f) =>
    ['chunk_not_in_bundle', 'publication_not_in_bundle', 'excerpt_mismatch', 'schema'].includes(f.check),
  );

  return {
    ok: failures.length === 0,
    schemaOk: true,
    mandatoryFailed: mandatoryFail,
    failures,
    perClaim,
    verifiedClaims,
    unsupportedClaims,
  };
}
