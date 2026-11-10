/**
 * Local evaluation renderer — does not add regulatory claims.
 */
export function renderVerifiedAskRiV2Answer(verification, modelOutput, bundle) {
  if (!verification?.ok) {
    return {
      status: 'VERIFICATION_FAILED',
      answer:
        'The reasoned response could not be verified against the evidence bundle. No authoritative regulatory conclusion is shown.',
      citations: [],
      humanReviewRequired: true,
      evidenceLimitation: bundle?.contextLimitationNote || null,
      unresolvedAspects: modelOutput?.unresolvedAspects || [],
      disclaimers: modelOutput?.disclaimers || ['Verification failed — review diagnostics.'],
    };
  }

  const state = modelOutput.responseState;
  const sufficiency = modelOutput.sufficiencyAssessment?.overall;
  const lines = [];

  if (modelOutput.narrativeSummary) lines.push(modelOutput.narrativeSummary);

  for (const claim of verification.verifiedClaims || []) {
    const label =
      claim.classification === 'consultation_proposal'
        ? '[Proposed — consultation]'
        : claim.classification === 'reasoned_implication'
          ? '[Reasoned implication — human review]'
          : claim.classification === 'guidance_expectation'
            ? '[Guidance expectation]'
            : claim.classification === 'verified_fact'
              ? '[Source states]'
              : `[${claim.classification}]`;
    lines.push(`${label} ${claim.claimText}`);
  }

  if (modelOutput.unresolvedAspects?.length) {
    lines.push(`Unresolved: ${modelOutput.unresolvedAspects.join('; ')}`);
  }
  if (bundle?.contextLimitationNote) {
    lines.push(`Evidence limitation: ${bundle.contextLimitationNote}`);
  }

  const citations = [];
  for (const claim of verification.verifiedClaims || []) {
    for (const cit of claim.citations || []) {
      const chunk = bundle.chunkById.get(cit.evidenceChunkId);
      citations.push({
        evidenceChunkId: cit.evidenceChunkId,
        publicationId: cit.publicationId,
        publicationTitle: chunk?.publicationTitle,
        publicationReference: chunk?.publicationReference,
        physicalPageNumber: chunk?.physicalPageNumber,
        sectionReference: chunk?.sectionReference,
        canonicalUrl: chunk?.canonicalUrl,
        extractionRevisionId: cit.extractionRevisionId,
        excerpt: cit.verbatimExcerpt,
      });
    }
  }

  let status = 'ANSWERED';
  if (state === 'INSUFFICIENT_EVIDENCE' || sufficiency === 'NO_SUPPORT') status = 'INSUFFICIENT_EVIDENCE';
  else if (state === 'PARTIAL_ANSWER' || sufficiency === 'PARTIAL_SUPPORT' || sufficiency === 'RELATED_CONTEXT_ONLY') {
    status = sufficiency === 'RELATED_CONTEXT_ONLY' ? 'INSUFFICIENT_EVIDENCE' : 'ANSWERED';
  } else if (state === 'VERIFICATION_FAILED' || state === 'BLOCKED') status = state;

  return {
    status,
    answer: lines.filter(Boolean).join('\n\n') || 'Insufficient verified evidence to answer.',
    citations,
    humanReviewRequired: Boolean(modelOutput.humanReviewRequired),
    evidenceLimitation: bundle?.contextLimitationNote || null,
    unresolvedAspects: modelOutput.unresolvedAspects || [],
    disclaimers: modelOutput.disclaimers || [],
    sufficiency,
  };
}
