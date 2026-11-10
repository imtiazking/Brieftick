const OUTPUT_SHAPE = `{
  "schemaVersion": "forgeniq.ask-ri.reasoner-output.v1",
  "responseState": "ANSWERED|PARTIAL_ANSWER|INSUFFICIENT_EVIDENCE|BLOCKED|VERIFICATION_FAILED",
  "sufficiencyAssessment": {
    "overall": "DIRECT_SUPPORT|PARTIAL_SUPPORT|RELATED_CONTEXT_ONLY|NO_SUPPORT",
    "explanation": "string",
    "publicationsConsidered": ["publicationId uuid"],
    "publicationsAnswering": ["publicationId uuid"]
  },
  "narrativeSummary": "string or null",
  "claims": [{
    "claimId": "c1",
    "claimText": "string",
    "classification": "verified_fact|guidance_expectation|consultation_proposal|reasoned_implication|unsupported",
    "regulatoryStatusOfSource": "from evidence metadata only",
    "evidenceConfidence": "high|medium|low",
    "humanReviewRequired": true,
    "citations": [{
      "evidenceChunkId": "id from bundle",
      "publicationId": "uuid",
      "extractionRevisionId": "uuid",
      "physicalPageNumber": number|null,
      "sectionReference": "string|null",
      "excerptStartOffset": 0,
      "excerptEndOffset": 100,
      "verbatimExcerpt": "exact substring of chunk verbatimText"
    }]
  }],
  "citations": [],
  "unresolvedAspects": ["string"],
  "humanReviewRequired": true,
  "uncertaintyNotes": ["string"],
  "verificationStatus": "PASSED",
  "relatedContextNote": "string|null",
  "disclaimers": ["string"]
}`;

export function buildReasonerSystemPrompt() {
  return `You are FORGENIQ Ask RI V2 — a grounded regulatory reasoner for UK FCA public publications only.

Rules:
- Use ONLY the provided evidence chunks. Do not invent publications, URLs, metadata, or legal obligations.
- Cite using evidenceChunkId and verbatim substrings with correct char offsets within that chunk's verbatimText.
- Distinguish consultation proposals from binding rules and finalised guidance.
- classification consultation_proposal for CP proposals; never state proposals as enacted law.
- reasoned_implication requires humanReviewRequired true (control impacts, indirect effects).
- If evidence does not directly answer the question, set sufficiency RELATED_CONTEXT_ONLY or NO_SUPPORT and responseState INSUFFICIENT_EVIDENCE or PARTIAL_ANSWER.
- Do not answer tenant-specific organisation questions from public evidence alone.
- Return a single JSON object matching the schema exactly. No markdown fences.

Output JSON schema:
${OUTPUT_SHAPE}`;
}

export function buildReasonerUserPrompt(question, bundle) {
  const preambles = (bundle.statusPreambles || []).map((p) => `- ${p.publicationId}: ${p.text}`).join('\n');
  const chunks = bundle.evidenceChunks.map((c) => ({
    evidenceChunkId: c.evidenceChunkId,
    publicationId: c.publicationId,
    publicationReference: c.publicationReference,
    publicationTitle: c.publicationTitle,
    regulatorId: c.regulatorId,
    regulatoryStatus: c.regulatoryStatus,
    publicationType: c.publicationType,
    publicationDate: c.publicationDate,
    extractionRevisionId: c.extractionRevisionId,
    physicalPageNumber: c.physicalPageNumber,
    sectionReference: c.sectionReference,
    verbatimText: c.verbatimText,
    charSpanInSource: c.charSpanInSource,
  }));

  return `Question:
${question}

Status preambles (application-authored):
${preambles || '(none)'}

Context limitation:
${bundle.contextLimitationNote || 'None'}

Evidence chunks (read-only):
${JSON.stringify(chunks, null, 0)}`;
}
