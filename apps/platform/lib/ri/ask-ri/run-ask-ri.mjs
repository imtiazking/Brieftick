/**
 * Production Ask RI — deterministic plan + execution (ported Design Lab semantics).
 */
import { parseAskQuery, retrieveRiRecords } from './port/ai/ri-retrieval.js';
import { ASK_RI_RESULT_STATES } from './port/ai/ri-query-executor.js';
import { buildInterpretedAsPlainEnglish } from './port/ai/ri-interpreted-as.js';
import { answerAskRiFromBestPublicationPdfEvidence } from './publication-pdf-evidence.mjs';
import { answerAskRiFromBestPublicationHtmlEvidence } from './publication-html-evidence.mjs';
import { questionMentionsPublicationReference } from './publication-pdf-question-match.mjs';
import { questionRequestsPdfSupplement } from './publication-question-scope.mjs';

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

function catalogueInterpretedAs(modes = []) {
  const parts = [];
  if (modes.includes('html_article_v2')) {
    parts.push('FCA webpage (html_article_v2) with section-level citations');
  }
  if (modes.includes('pdf_primary_v1')) {
    parts.push('primary PDF (pdf_primary_v1) with physical page citations where indexed');
  }
  return `${parts.join('; ')}. Supervisory examples are not new obligations; FG22/5 PDF is cited only when indexed as a separate catalogue publication.`;
}

function buildCatalogueEvidenceResult(question, payload) {
  const {
    status,
    answer,
    citations = [],
    audit = {},
    mode,
    htmlAnswer,
    pdfAnswer,
    pdfSupplement,
  } = payload;
  const modes = [];
  if (htmlAnswer?.status === 'ANSWERED' && (citations.some((c) => c.type === 'html_article_v2') || htmlAnswer.citations?.length)) {
    modes.push('html_article_v2');
  }
  const pdfContributed =
    (pdfAnswer?.status === 'ANSWERED' && pdfAnswer.citations?.length) ||
    (pdfSupplement?.status === 'ANSWERED' && pdfSupplement.citations?.length);
  if (pdfContributed) modes.push('pdf_primary_v1');
  const publicationPdfOut =
    pdfAnswer?.status === 'ANSWERED' && pdfAnswer.citations?.length
      ? pdfAnswer
      : pdfSupplement?.status === 'ANSWERED' && pdfSupplement.citations?.length
        ? pdfSupplement
        : undefined;
  return {
    question,
    interpretedAs: catalogueInterpretedAs(modes),
    status,
    answer,
    records: [],
    recordCount: 0,
    citations,
    evidence: citations.map((c) => c.evidenceId).filter(Boolean),
    queryPlan: { mode: mode || 'catalogue_publication_evidence_v1', modes },
    execution: {
      resultState: status,
      providerUsed: false,
      evidenceSource: modes[0] || 'catalogue_publication_evidence_v1',
      humanReviewStatus: audit.humanReviewStatus,
      mustNotPresentAsBindingObligation: audit.mustNotPresentAsBindingObligation,
      matchScore: audit.matchScore,
      publicationReference: audit.publicationReference,
      supplementaryPdfAttached: Boolean(
        pdfSupplement?.status === 'ANSWERED' && pdfSupplement.citations?.length,
      ),
      evidenceSources: modes,
    },
    publicationPdf: publicationPdfOut,
    publicationHtml: htmlAnswer?.status === 'ANSWERED' ? htmlAnswer : undefined,
  };
}

function mergeCatalogueCitations(htmlCitations = [], pdfCitations = [], primaryPublicationId) {
  const markPdf = pdfCitations.map((c) => ({
    ...c,
    citationLabel: c.citationLabel?.includes('—')
      ? c.citationLabel
      : `${c.citationLabel || 'PDF'} (separate catalogue publication; not the FCA webpage)`,
    attributedPublicationId: c.publicationId,
    distinctFromPublicationId: primaryPublicationId,
  }));
  const combined = [...htmlCitations, ...markPdf];
  const seen = new Set();
  const out = [];
  for (const c of combined) {
    const key = `${c.type}:${c.publicationId}:${c.evidenceId || c.physicalPageNumber}:${c.sectionReference || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, 12);
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

function catalogueLoadFailureAnswer(htmlErrors, pdfErrors, meta = {}) {
  const codes = [...new Set([...(htmlErrors || []), ...(pdfErrors || [])].map((e) => e.code).filter(Boolean))];
  if (codes.includes('html_integrity_mismatch') || codes.includes('html_text_integrity_mismatch')) {
    return 'Stored FCA webpage evidence failed SHA-256 verification; html_article_v2 citations are blocked.';
  }
  if (codes.includes('html_revision_query_zero_rows')) {
    const versions = meta.publicationVersionCount;
    const scoped = meta.scopedPublicationIds?.join(', ') || 'unknown';
    return `No html_article_v2 extraction revision could be loaded for catalogue publication(s) ${scoped}${versions != null ? ` (${versions} publication version row(s) checked)` : ''}. Webpage evidence is not available to Ask RI without an indexed html_article_v2 revision.`;
  }
  if (codes.includes('revision_query_zero_rows')) {
    const wantsPdf = codes.length === 1;
    if (wantsPdf) {
      return 'No pdf_primary_v1 extraction revision is indexed for the referenced publication. This HTML publication does not require a PDF to answer webpage-scoped questions.';
    }
  }
  return pdfLoadFailureAnswer(pdfErrors.length ? pdfErrors : htmlErrors);
}

export function runAskRiDeterministic(state, question) {
  const pdfEvidenceList = state.publicationPdfEvidence || [];
  const pdfErrors = state.publicationPdfEvidenceErrors || [];
  const htmlEvidenceList = state.publicationHtmlEvidence || [];
  const htmlErrors = state.publicationHtmlEvidenceErrors || [];
  const mentionsPublication = questionMentionsPublicationReference(question);

  if (mentionsPublication) {
    if (htmlEvidenceList.length) {
      const htmlAnswer = answerAskRiFromBestPublicationHtmlEvidence(htmlEvidenceList, question);
      if (htmlAnswer.status === 'ANSWERED') {
        const primaryId = htmlEvidenceList[0]?.publicationId;
        let pdfSupplement = null;
        let citations = [...(htmlAnswer.citations || [])];
        let answer = htmlAnswer.answer;
        if (pdfEvidenceList.length && questionRequestsPdfSupplement(question)) {
          pdfSupplement = answerAskRiFromBestPublicationPdfEvidence(pdfEvidenceList, question);
          if (pdfSupplement.status === 'ANSWERED' && pdfSupplement.citations?.length) {
            citations = mergeCatalogueCitations(citations, pdfSupplement.citations, primaryId);
            answer = `${answer}\n\nRelated indexed PDF guidance: ${pdfSupplement.citations[0]?.publicationTitle || 'see PDF citations below'} — citations are from a separate catalogue publication, not the webpage HTML.`;
          } else if (pdfSupplement.status === 'INSUFFICIENT_EVIDENCE') {
            answer = `${answer}\n\nPDF supplement: ${pdfSupplement.answer || 'FG22/5 or other linked PDF is not indexed with pdf_primary_v1 in this environment.'}`;
          }
        }
        return buildCatalogueEvidenceResult(question, {
          status: 'ANSWERED',
          answer,
          citations,
          audit: htmlAnswer.audit,
          mode: 'catalogue_publication_evidence_v1',
          htmlAnswer,
          pdfSupplement,
        });
      }
      if (htmlAnswer.status === 'INSUFFICIENT_EVIDENCE' || htmlAnswer.status === 'UNRESOLVED') {
        if (pdfEvidenceList.length) {
          const pdfAnswer = answerAskRiFromBestPublicationPdfEvidence(pdfEvidenceList, question);
          if (
            pdfAnswer.status === 'ANSWERED' ||
            pdfAnswer.status === 'INSUFFICIENT_EVIDENCE' ||
            pdfAnswer.status === 'UNRESOLVED'
          ) {
            return buildCatalogueEvidenceResult(question, {
              status: pdfAnswer.status,
              answer: pdfAnswer.answer,
              citations: pdfAnswer.citations || [],
              audit: pdfAnswer.audit,
              mode: 'publication_pdf_primary_v1',
              pdfAnswer,
            });
          }
        }
        return buildCatalogueEvidenceResult(question, {
          status: htmlAnswer.status,
          answer: htmlAnswer.answer,
          citations: [],
          audit: htmlAnswer.audit,
          mode: 'html_article_v2',
          htmlAnswer,
        });
      }
    }

    if (pdfEvidenceList.length) {
      const pdfAnswer = answerAskRiFromBestPublicationPdfEvidence(pdfEvidenceList, question);
      if (
        pdfAnswer.status === 'ANSWERED' ||
        pdfAnswer.status === 'INSUFFICIENT_EVIDENCE' ||
        pdfAnswer.status === 'UNRESOLVED'
      ) {
        return buildCatalogueEvidenceResult(question, {
          status: pdfAnswer.status,
          answer: pdfAnswer.answer,
          citations: pdfAnswer.citations || [],
          audit: pdfAnswer.audit,
          mode: 'publication_pdf_primary_v1',
          pdfAnswer,
        });
      }
    }

    const answer = catalogueLoadFailureAnswer(htmlErrors, pdfErrors, state.publicationPdfEvidenceLoadMeta || {});
    const failureStatus =
      pdfLoadFailureIsTechnical([...htmlErrors, ...pdfErrors]) ? 'EVIDENCE_RETRIEVAL_ERROR' : 'INSUFFICIENT_EVIDENCE';
    return buildCatalogueEvidenceResult(question, {
      status: failureStatus,
      answer,
      citations: [],
      audit: {
        evidenceSource: 'catalogue_publication_evidence_v1',
        loadErrorCodes: [...htmlErrors, ...pdfErrors].map((e) => e.code),
      },
      mode: 'catalogue_publication_evidence_v1',
    });
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

