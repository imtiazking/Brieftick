import 'server-only';

import type { AskRiResponse } from '@/lib/ri/services/ask-ri';

type PdfCitation = {
  citationLabel?: string;
  publicationTitle?: string;
  publicationReference?: string;
  publicationId?: string;
  sourceUrl?: string;
  physicalPageNumber?: number;
  excerpt?: string;
  extractionRevisionId?: string;
  regulatoryStatus?: string;
  type?: string;
  regulatorShortName?: string;
  regulatoryAuthority?: string;
};

type PublicationPdfAnswer = {
  status?: string;
  answer?: string | null;
  citations?: PdfCitation[];
  findings?: unknown[];
  audit?: Record<string, unknown>;
};

function mapCitationForLab(c: PdfCitation | Record<string, unknown>) {
  const row = c as PdfCitation;
  const regulator = row.regulatorShortName || row.regulatoryAuthority || 'Regulator';
  const ref = row.publicationReference || row.publicationTitle || 'Publication';
  const page =
    row.physicalPageNumber != null ? ` · physical page ${row.physicalPageNumber}` : '';
  const citationKind =
    row.type === 'primary_pdf' || row.citationLabel?.includes('PDF')
      ? `${regulator} — ${ref}${page}`
      : row.citationLabel || `${regulator} — ${ref}${page}`;
  return {
    citationKind,
    recordId: ref,
    sourceRecordId: row.publicationId || '',
    excerpt: row.excerpt || '',
    physicalPageNumber: row.physicalPageNumber,
    publicationTitle: row.publicationTitle,
    publicationReference: row.publicationReference,
    publicationId: row.publicationId,
    sourceUrl: row.sourceUrl,
    extractionRevisionId: row.extractionRevisionId,
    regulatoryStatus: row.regulatoryStatus,
    citationType: row.type || 'primary_pdf',
  };
}

function pdfRetrievalFromCitations(result: AskRiResponse, citations: PdfCitation[]) {
  const recordTypes: Record<string, string> = {};
  const matchReasons: Record<string, string> = {};
  const matchedRecordIds = citations.map((c, index) => {
    const id = `pdf-page-${c.physicalPageNumber ?? index + 1}`;
    recordTypes[id] = 'Primary PDF evidence';
    matchReasons[id] =
      c.citationLabel ||
      `${c.publicationReference || 'Publication'} physical page ${c.physicalPageNumber ?? '?'}`;
    return id;
  });
  return {
    interpretedAs: result.interpretedAs,
    evidenceSource: 'pdf_primary_v1',
    matchedRecordIds,
    matchedRecordIdsAll: matchedRecordIds,
    recordTypes,
    matchReasons,
    totalMatchingRecords: citations.length,
    resultCount: citations.length,
  };
}

function retrievalFromProduction(result: AskRiResponse) {
  const r = result.retrieval as Record<string, unknown> | undefined;
  if (r) return r;
  const ids = (result.records || []).map((rec) => rec.id);
  const recordTypes: Record<string, string> = {};
  const matchReasons: Record<string, string> = {};
  for (const rec of result.records || []) {
    recordTypes[rec.id] = rec.type;
    if (rec.reason) matchReasons[rec.id] = rec.reason;
  }
  return {
    interpretedAs: result.interpretedAs,
    matchedRecordIds: ids,
    matchedRecordIdsAll: ids,
    recordTypes,
    matchReasons,
    totalMatchingRecords: result.recordCount,
    resultCount: result.recordCount,
  };
}

function answeredAnalysis(
  result: AskRiResponse,
  answer: string,
  citations: PdfCitation[],
  pdf?: PublicationPdfAnswer,
) {
  const pdfAudit = pdf?.audit ?? (result.publicationPdf as PublicationPdfAnswer | undefined)?.audit;
  const findings = (pdf?.findings || []) as { analysisExplanation?: string }[];
  const keyFindings = findings
    .map((f) => f.analysisExplanation?.trim())
    .filter(Boolean)
    .slice(0, 6) as string[];
  return {
    reviewStatus: 'HUMAN REVIEW REQUIRED',
    providerMode: 'PRODUCTION',
    evidenceConfidence: citations.length || result.recordCount > 0 ? 'HIGH' : 'MEDIUM',
    summary: answer,
    citations: citations.map(mapCitationForLab),
    workflowPayload: {
      answer,
      keyFindings,
      uncertainties: pdfAudit?.mustNotPresentAsBindingObligation
        ? ['Consultation-stage proposals — not binding obligations until FCA finalises rules and human review completes.']
        : [],
    },
    originalAiOutput: {
      answer,
      keyFindings,
      uncertainties: [],
    },
  };
}

/** Map production AskRiResponse → Design Lab `_lastAskRi` contract (no mock fixture AI). */
export function mapAskRiProductionToLabLastAsk(result: AskRiResponse) {
  const retrieval = retrievalFromProduction(result);
  const providerCallCount = 0;
  const connected = true;

  const pdf = result.publicationPdf as PublicationPdfAnswer | undefined;
  if (pdf) {
    if (pdf.status === 'EVIDENCE_RETRIEVAL_ERROR' || result.status === 'EVIDENCE_RETRIEVAL_ERROR') {
      return {
        ok: true,
        connected,
        technicalError: true,
        message: pdf.answer || result.answer,
        retrieval,
        providerCallCount,
      };
    }
    if (pdf.status === 'UNRESOLVED' || result.status === 'UNRESOLVED') {
      return {
        ok: true,
        connected,
        unresolved: true,
        message: pdf.answer || result.answer || 'Could not map question to verified publication evidence.',
        retrieval: { ...retrieval, interpretedAs: result.interpretedAs },
        providerCallCount,
      };
    }
    if (pdf.status === 'INSUFFICIENT_EVIDENCE' || result.status === 'INSUFFICIENT_EVIDENCE') {
      return {
        ok: true,
        connected,
        insufficient: true,
        message: pdf.answer || result.answer,
        retrieval,
        providerCallCount,
      };
    }
    const citations = (pdf.citations || result.citations || []) as PdfCitation[];
    return {
      ok: true,
      connected,
      providerCallCount,
      retrieval: pdfRetrievalFromCitations(result, citations),
      analysis: answeredAnalysis(result, pdf.answer || result.answer, citations, pdf),
      productionStatus: result.status,
    };
  }

  if (result.status === 'UNRESOLVED') {
    return {
      ok: true,
      connected,
      unresolved: true,
      message: result.answer,
      retrieval,
      providerCallCount,
    };
  }
  if (result.status === 'INSUFFICIENT_EVIDENCE') {
    return {
      ok: true,
      connected,
      insufficient: true,
      message: result.answer,
      retrieval,
      providerCallCount,
    };
  }
  if (result.status === 'ZERO_RESULTS') {
    return {
      ok: true,
      connected,
      zeroQualifiers: true,
      message: result.answer,
      retrieval,
      providerCallCount,
    };
  }

  const citations = (result.citations || []) as PdfCitation[];
  return {
    ok: true,
    connected,
    providerCallCount,
    retrieval,
    analysis: answeredAnalysis(result, result.answer, citations),
    productionStatus: result.status,
  };
}
