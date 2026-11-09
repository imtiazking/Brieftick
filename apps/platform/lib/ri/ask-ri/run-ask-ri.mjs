/**
 * Production Ask RI — deterministic plan + execution (ported Design Lab semantics).
 */
import { parseAskQuery, retrieveRiRecords } from './port/ai/ri-retrieval.js';
import { ASK_RI_RESULT_STATES } from './port/ai/ri-query-executor.js';
import { buildInterpretedAsPlainEnglish } from './port/ai/ri-interpreted-as.js';
import { answerAskRiFromBestPublicationPdfEvidence } from './publication-pdf-evidence.mjs';
import { questionMentionsPublicationReference } from './publication-pdf-question-match.mjs';

export { ASK_RI_RESULT_STATES };

function mapStatus(resultState) {
  if (resultState === ASK_RI_RESULT_STATES.UNRESOLVED_QUERY_SEMANTICS) return 'UNRESOLVED';
  if (resultState === ASK_RI_RESULT_STATES.INSUFFICIENT_EVIDENCE) return 'INSUFFICIENT_EVIDENCE';
  if (resultState === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS) return 'ZERO_RESULTS';
  if (resultState === ASK_RI_RESULT_STATES.RESOLVED) return 'ANSWERED';
  return 'FAILED';
}

function deterministicAnswer(retrieval) {
  const primary = retrieval.requestedTargetType || retrieval.plan?.primaryTargetType || 'Record';
  const count = retrieval.primaryResultCount ?? retrieval.matchedRecordIds?.length ?? 0;
  const ids = (retrieval.primaryResultIds || retrieval.matchedRecordIds || []).slice(0, 20);
  if (retrieval.resultState === ASK_RI_RESULT_STATES.ZERO_QUALIFIERS) {
    return `No matching ${primary} records were found in your organisation's RI data.`;
  }
  if (count === 0) {
    return `No qualifying ${primary} records matched the interpreted query.`;
  }
  return `Found ${count} ${primary} record(s) matching the verified query plan${ids.length ? `: ${ids.join(', ')}` : ''}.`;
}

function pdfInterpretedAs() {
  return 'Publication primary PDF evidence (physical page citations; consultation-stage where applicable; not binding obligations).';
}

function buildPdfPrimaryResult(question, pdfAnswer) {
  return {
    question,
    interpretedAs: pdfInterpretedAs(),
    status: pdfAnswer.status,
    answer: pdfAnswer.answer,
    records: [],
    recordCount: 0,
    citations: pdfAnswer.citations || [],
    evidence: (pdfAnswer.citations || []).map((c) => c.evidenceId),
    queryPlan: { mode: 'publication_pdf_primary_v1' },
    execution: {
      resultState: pdfAnswer.status,
      providerUsed: false,
      evidenceSource: 'pdf_primary_v1',
      humanReviewStatus: pdfAnswer.audit?.humanReviewStatus,
      mustNotPresentAsBindingObligation: pdfAnswer.audit?.mustNotPresentAsBindingObligation,
      matchScore: pdfAnswer.audit?.matchScore,
      publicationReference: pdfAnswer.audit?.publicationReference,
    },
    publicationPdf: pdfAnswer,
  };
}

function pdfLoadFailureAnswer(errors) {
  const codes = [...new Set((errors || []).map((e) => e.code).filter(Boolean))];
  const primary = codes[0] || 'pdf_evidence_not_loaded';
  if (
    primary === 'admin_client_unavailable' ||
    primary === 'storage_credentials_unavailable' ||
    primary === 'supabase_admin_auth_failed'
  ) {
    return 'Technical evidence retrieval error: server-side Supabase administrator access is not configured correctly for this environment (check SUPABASE_SERVICE_ROLE_KEY matches the staging project). This is not missing tenant RI records or insufficient regulatory source content.';
  }
  if (primary === 'revision_query_failed') {
    return 'Technical evidence retrieval error: publication PDF extraction metadata could not be read from the database. No tenant Record fallback was used.';
  }
  if (primary === 'revision_query_zero_rows') {
    return 'No pdf_primary_v1 extraction revision exists for the publication referenced in this question.';
  }
  if (primary === 'catalogue_publication_not_visible') {
    return 'The publication linked to the PDF extraction revision could not be loaded.';
  }
  if (primary === 'structured_integrity_mismatch' || primary === 'page_boundaries_not_confirmed') {
    return 'Stored primary PDF evidence failed integrity verification; page-specific citations are blocked.';
  }
  if (primary === 'missing_structured_storage_path') {
    return 'Primary PDF structured extraction is not available for the referenced publication.';
  }
  return 'Verified publication PDF evidence for this question could not be loaded. No answer was taken from generic Record retrieval.';
}

const PDF_LOAD_TECHNICAL_CODES = new Set([
  'admin_client_unavailable',
  'storage_credentials_unavailable',
  'supabase_admin_auth_failed',
  'revision_query_failed',
  'pdf_evidence_load_failed',
]);

function pdfLoadFailureIsTechnical(errors) {
  return (errors || []).some((e) => PDF_LOAD_TECHNICAL_CODES.has(e.code));
}

function pdfLoadFailureStatus(errors) {
  return pdfLoadFailureIsTechnical(errors) ? 'EVIDENCE_RETRIEVAL_ERROR' : 'INSUFFICIENT_EVIDENCE';
}

export function runAskRiDeterministic(state, question) {
  const pdfEvidenceList = state.publicationPdfEvidence || [];
  const pdfErrors = state.publicationPdfEvidenceErrors || [];
  const mentionsPublication = questionMentionsPublicationReference(question);

  if (pdfEvidenceList.length) {
    const pdfAnswer = answerAskRiFromBestPublicationPdfEvidence(pdfEvidenceList, question);
    if (
      pdfAnswer.status === 'ANSWERED' ||
      pdfAnswer.status === 'INSUFFICIENT_EVIDENCE' ||
      pdfAnswer.status === 'UNRESOLVED'
    ) {
      return buildPdfPrimaryResult(question, pdfAnswer);
    }
  }

  if (mentionsPublication) {
    const answer =
      pdfErrors?.length > 0
        ? pdfLoadFailureAnswer(pdfErrors)
        : 'Publication-scoped question did not resolve to verified primary PDF evidence (catalogue title, CP reference, or publication id). No answer was taken from generic tenant Record retrieval.';
    const failureStatus =
      pdfErrors?.length > 0 ? pdfLoadFailureStatus(pdfErrors) : 'INSUFFICIENT_EVIDENCE';
    return {
      question,
      interpretedAs: pdfInterpretedAs(),
      status: failureStatus,
      answer,
      records: [],
      recordCount: 0,
      citations: [],
      evidence: [],
      queryPlan: {
        mode: 'publication_pdf_primary_v1',
        pdfEvidenceLoaded: false,
        loadErrorCodes: [...new Set(pdfErrors.map((e) => e.code).filter(Boolean))],
      },
      execution: {
        resultState: failureStatus,
        providerUsed: false,
        evidenceSource: 'pdf_primary_v1',
        pdfEvidenceLoaded: false,
        technicalRetrievalFailure: pdfLoadFailureIsTechnical(pdfErrors),
      },
      publicationPdf: {
        status: failureStatus,
        answer,
        citations: [],
        audit: {
          evidenceSource: 'pdf_primary_v1',
          loadErrorCodes: pdfErrors.map((e) => e.code),
          technicalRetrievalFailure: pdfLoadFailureIsTechnical(pdfErrors),
        },
      },
    };
  }

  if (questionMentionsPublicationReference(question)) {
    return {
      question,
      interpretedAs: pdfInterpretedAs(),
      status: 'INSUFFICIENT_EVIDENCE',
      answer:
        'Publication-named question could not be mapped to loaded primary PDF evidence. Generic tenant Record retrieval was not used.',
      records: [],
      recordCount: 0,
      citations: [],
      evidence: [],
      queryPlan: { mode: 'publication_pdf_primary_v1', pdfEvidenceLoaded: false, defensiveGuard: true },
      execution: {
        resultState: 'INSUFFICIENT_EVIDENCE',
        providerUsed: false,
        evidenceSource: 'pdf_primary_v1',
        pdfEvidenceLoaded: false,
      },
      publicationPdf: {
        status: 'INSUFFICIENT_EVIDENCE',
        answer:
          'Publication-named question could not be mapped to loaded primary PDF evidence. Generic tenant Record retrieval was not used.',
        citations: [],
        audit: { evidenceSource: 'pdf_primary_v1', defensiveGuard: true },
      },
    };
  }

  const parsed = parseAskQuery(question, state);
  const retrieval = retrieveRiRecords(state, question, { parsed });
  const status = mapStatus(retrieval.resultState);
  const interpretedAs =
    retrieval.interpretedAs ||
    buildInterpretedAsPlainEnglish(parsed.plan, parsed.filters, retrieval.resultState, {
      asOfDate: state.asOfDate,
    });

  const records = (retrieval.matchedRecordIdsAll || retrieval.matchedRecordIds || []).map((id) => ({
    id,
    type: retrieval.recordTypes?.[id] || 'Unknown',
    reason: retrieval.matchReasons?.[id] || null,
  }));

  return {
    question,
    interpretedAs,
    status,
    answer: deterministicAnswer(retrieval),
    records,
    recordCount: records.length,
    citations: retrieval.citations || [],
    evidence: retrieval.evidenceIds || [],
    queryPlan: parsed.plan,
    execution: {
      resultState: retrieval.resultState,
      evaluatedCounts: retrieval.evaluatedCounts || {},
      primaryResultCount: retrieval.primaryResultCount,
      providerUsed: false,
      evidenceSource: 'tenant_ri_records',
    },
    retrieval,
  };
}

