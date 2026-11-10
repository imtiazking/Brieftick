const RESPONSE_STATES = new Set([
  'ANSWERED',
  'PARTIAL_ANSWER',
  'INSUFFICIENT_EVIDENCE',
  'BLOCKED',
  'VERIFICATION_FAILED',
]);

const SUFFICIENCY = new Set(['DIRECT_SUPPORT', 'PARTIAL_SUPPORT', 'RELATED_CONTEXT_ONLY', 'NO_SUPPORT']);

const CLAIM_CLASS = new Set([
  'verified_fact',
  'guidance_expectation',
  'consultation_proposal',
  'reasoned_implication',
  'unsupported',
]);

const VERIFICATION_STATUS = new Set(['PASSED', 'FAILED', 'PARTIAL']);

export function validateReasonerOutput(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return { ok: false, errors: ['not_object'] };

  if (doc.schemaVersion !== 'forgeniq.ask-ri.reasoner-output.v1') errors.push('schemaVersion');
  if (!RESPONSE_STATES.has(doc.responseState)) errors.push('responseState');
  if (!doc.sufficiencyAssessment || !SUFFICIENCY.has(doc.sufficiencyAssessment.overall)) {
    errors.push('sufficiencyAssessment.overall');
  }
  if (!Array.isArray(doc.claims)) errors.push('claims_not_array');
  if (!VERIFICATION_STATUS.has(doc.verificationStatus)) errors.push('verificationStatus');
  if (typeof doc.humanReviewRequired !== 'boolean') errors.push('humanReviewRequired');
  if (!Array.isArray(doc.unresolvedAspects)) errors.push('unresolvedAspects');
  if (!Array.isArray(doc.citations)) errors.push('citations');
  if (!Array.isArray(doc.uncertaintyNotes)) errors.push('uncertaintyNotes');

  for (const [i, claim] of (doc.claims || []).entries()) {
    if (!claim.claimId) errors.push(`claim_${i}_claimId`);
    if (!claim.claimText) errors.push(`claim_${i}_claimText`);
    if (!CLAIM_CLASS.has(claim.classification)) errors.push(`claim_${i}_classification`);
    if (!Array.isArray(claim.citations)) errors.push(`claim_${i}_citations`);
    for (const [j, cit] of (claim.citations || []).entries()) {
      if (!cit.evidenceChunkId) errors.push(`claim_${i}_cit_${j}_chunkId`);
      if (!cit.publicationId) errors.push(`claim_${i}_cit_${j}_publicationId`);
      if (!cit.extractionRevisionId) errors.push(`claim_${i}_cit_${j}_revision`);
      if (typeof cit.excerptStartOffset !== 'number' || typeof cit.excerptEndOffset !== 'number') {
        errors.push(`claim_${i}_cit_${j}_offsets`);
      }
      if (!cit.verbatimExcerpt) errors.push(`claim_${i}_cit_${j}_excerpt`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function buildEmptyReasonerOutput(overrides = {}) {
  return {
    schemaVersion: 'forgeniq.ask-ri.reasoner-output.v1',
    responseState: 'BLOCKED',
    sufficiencyAssessment: {
      overall: 'NO_SUPPORT',
      explanation: 'No model invocation.',
      publicationsConsidered: [],
      publicationsAnswering: [],
    },
    narrativeSummary: null,
    claims: [],
    citations: [],
    unresolvedAspects: [],
    humanReviewRequired: true,
    uncertaintyNotes: [],
    verificationStatus: 'FAILED',
    relatedContextNote: null,
    disclaimers: ['FORGENIQ Ask RI V2 prototype — not production legal advice.'],
    ...overrides,
  };
}
