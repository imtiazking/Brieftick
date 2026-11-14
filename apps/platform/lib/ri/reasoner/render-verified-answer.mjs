import { resolveFinalRegulatoryStatus } from './evidence-sufficiency-policy.mjs';

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

  if (state === 'VERIFICATION_FAILED' || state === 'BLOCKED') {
    return {
      status: state,
      answer: lines.filter(Boolean).join('\n\n') || 'Insufficient verified evidence to answer.',
      citations,
      humanReviewRequired: true,
      evidenceLimitation: bundle?.contextLimitationNote || null,
      unresolvedAspects: modelOutput.unresolvedAspects || [],
      disclaimers: modelOutput.disclaimers || [],
      sufficiency,
    };
  }

  const policy = resolveFinalRegulatoryStatus({
    responseState: state,
    sufficiencyOverall: sufficiency,
    verifiedClaimCount: (verification.verifiedClaims || []).length,
    failedClaimCount: verification.failedClaims?.length ?? 0,
    unresolvedAspects: modelOutput.unresolvedAspects || [],
    questionCoverage: bundle?.questionCoverage || 'UNKNOWN',
    regulatoryIndexAbsent: Boolean(bundle?.regulatoryIndexAbsent),
  });

  return {
    status: policy.status,
    regulatoryReview: policy.regulatoryReview,
    policyReason: policy.reason,
    answer: lines.filter(Boolean).join('\n\n') || 'Insufficient verified evidence to answer.',
    citations,
    humanReviewRequired: Boolean(modelOutput.humanReviewRequired),
    evidenceLimitation: bundle?.contextLimitationNote || null,
    unresolvedAspects: modelOutput.unresolvedAspects || [],
    disclaimers: modelOutput.disclaimers || [],
    sufficiency,
  };
}
