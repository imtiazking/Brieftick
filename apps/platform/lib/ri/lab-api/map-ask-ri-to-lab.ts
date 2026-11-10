import 'server-only';

import type { AskRiResponse } from '@/lib/ri/services/ask-ri';
import {
  countCitationsByMedium,
  resolveCatalogueEvidenceSource,
} from './map-ask-ri-catalogue-pure.mjs';

export { countCitationsByMedium, resolveCatalogueEvidenceSource };

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
  sectionReference?: string;
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
    row.type === 'html_article_v2'
      ? row.citationLabel || `${regulator} — ${ref} — webpage section`
      : row.type === 'primary_pdf' || row.citationLabel?.includes('PDF')
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
    cataloguePublicationUrl: (row as { cataloguePublicationUrl?: string }).cataloguePublicationUrl,
    primaryPdfSourceUrl: (row as { primaryPdfSourceUrl?: string }).primaryPdfSourceUrl,
    primaryPdfPageUrl: (row as { primaryPdfPageUrl?: string }).primaryPdfPageUrl,
    extractionRevisionId: row.extractionRevisionId,
    regulatoryStatus: row.regulatoryStatus,
    citationType: row.type || 'primary_pdf',
    sectionReference: row.sectionReference,
    attributedPublicationId: (row as { attributedPublicationId?: string }).attributedPublicationId,
  };
}

function pickCatalogueAnswerBody(
  result: AskRiResponse,
  html?: PublicationPdfAnswer,
  pdf?: PublicationPdfAnswer,
) {
  if (result.status === 'ANSWERED' && html?.status === 'ANSWERED') {
    return html.answer || result.answer;
  }
  if (result.status === 'ANSWERED' && pdf?.status === 'ANSWERED') {
    return pdf.answer || result.answer;
  }
  return result.answer;
}

function catalogueRetrievalFromCitations(
  result: AskRiResponse,
  citations: PdfCitation[],
  evidenceSource: ReturnType<typeof resolveCatalogueEvidenceSource>,
) {
  const recordTypes: Record<string, string> = {};
  const matchReasons: Record<string, string> = {};
  const isHtml = evidenceSource === 'html_article_v2' || evidenceSource === 'mixed_catalogue_evidence';
  const matchedRecordIds = citations.map((c, index) => {
    const isHtmlCite = c.type === 'html_article_v2';
    const id = isHtmlCite
      ? `html-cite-${index + 1}`
      : `pdf-page-${c.physicalPageNumber ?? index + 1}`;
    recordTypes[id] = isHtmlCite ? 'FCA webpage evidence' : 'Primary PDF evidence';
    const sectionRef = c.sectionReference;
    matchReasons[id] =
      c.citationLabel ||
      (isHtmlCite
        ? `${c.publicationTitle || c.publicationReference || 'Publication'}${sectionRef ? ` — ${sectionRef}` : ''}`
        : `${c.publicationReference || 'Publication'} physical page ${c.physicalPageNumber ?? '?'}`);
    return id;
  });
  const { html, pdf } = countCitationsByMedium(citations);
  return {
    interpretedAs: result.interpretedAs,
    evidenceSource: evidenceSource === 'mixed_catalogue_evidence' ? 'html_article_v2' : evidenceSource,
    evidenceSources: evidenceSource === 'mixed_catalogue_evidence' ? ['html_article_v2', 'pdf_primary_v1'] : [evidenceSource],
    htmlCitationCount: html,
    pdfCitationCount: pdf,
    matchedRecordIds,
    matchedRecordIdsAll: matchedRecordIds,
    recordTypes,
    matchReasons,
    totalMatchingRecords: citations.length,
    resultCount: citations.length,
    isHtml,
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
  opts?: { pdf?: PublicationPdfAnswer; html?: PublicationPdfAnswer },
) {
  const pdf = opts?.pdf;
  const html = opts?.html;
  const pdfAudit = pdf?.audit ?? (result.publicationPdf as PublicationPdfAnswer | undefined)?.audit;
  const htmlAudit = html?.audit ?? (result as { publicationHtml?: PublicationPdfAnswer }).publicationHtml?.audit;
  const findings = (pdf?.findings || []) as { analysisExplanation?: string }[];
  const pdfKeyFindings = findings
    .map((f) => f.analysisExplanation?.trim())
    .filter(Boolean)
    .slice(0, 6) as string[];
  const htmlKeyFindings = (htmlAudit?.keyFindings as string[] | undefined)?.filter(Boolean) || [];
  const keyFindings = htmlKeyFindings.length ? htmlKeyFindings : pdfKeyFindings;
  const uncertainties = [
    ...((htmlAudit?.uncertainties as string[] | undefined) || []),
    ...(pdfAudit?.consultationPreserved === true
      ? ['Consultation-stage proposals — not binding obligations until FCA finalises rules and human review completes.']
      : []),
  ].filter(Boolean);
  const explicitConfidence = (htmlAudit?.evidenceConfidence || pdfAudit?.evidenceConfidence) as string | undefined;
  const { html: htmlN, pdf: pdfN } = countCitationsByMedium(citations);
  let evidenceConfidence = explicitConfidence;
  if (!evidenceConfidence) {
    if (htmlN >= 3 || pdfN >= 3) evidenceConfidence = 'HIGH';
    else if (htmlN + pdfN >= 1) evidenceConfidence = 'MEDIUM';
    else evidenceConfidence = 'LOW';
  }

  return {
    reviewStatus: 'HUMAN REVIEW REQUIRED',
    providerMode: 'PRODUCTION',
    evidenceConfidence,
    summary: answer,
    citations: citations.map(mapCitationForLab),
    workflowPayload: {
      answer,
      keyFindings,
      uncertainties,
    },
    originalAiOutput: {
      answer,
      keyFindings,
      uncertainties,
    },
  };
}

/** Map production AskRiResponse → Design Lab `_lastAskRi` contract (no mock fixture AI). */
export function mapAskRiProductionToLabLastAsk(result: AskRiResponse) {
  const retrieval = retrievalFromProduction(result);
  const providerCallCount = 0;
  const connected = true;

  const pdf = result.publicationPdf as PublicationPdfAnswer | undefined;
  const html = (result as { publicationHtml?: PublicationPdfAnswer }).publicationHtml;
  const hasAnsweredHtml = html?.status === 'ANSWERED';
  const hasAnsweredPdf = pdf?.status === 'ANSWERED' && (pdf.citations?.length ?? 0) > 0;
  const catalogueEvidence =
    (hasAnsweredHtml ? html : undefined) || (hasAnsweredPdf ? pdf : undefined) || html || pdf;
  if (catalogueEvidence) {
    const active = catalogueEvidence;
    if (active.status === 'EVIDENCE_RETRIEVAL_ERROR' || result.status === 'EVIDENCE_RETRIEVAL_ERROR') {
      return {
        ok: true,
        connected,
        technicalError: true,
        message: active.answer || result.answer,
        retrieval,
        providerCallCount,
      };
    }
    if (result.status === 'UNRESOLVED' || (active.status === 'UNRESOLVED' && result.status !== 'ANSWERED')) {
      return {
        ok: true,
        connected,
        unresolved: true,
        message: active.answer || result.answer || 'Could not map question to verified publication evidence.',
        retrieval: { ...retrieval, interpretedAs: result.interpretedAs },
        providerCallCount,
      };
    }
    if (result.status === 'INSUFFICIENT_EVIDENCE' || active.status === 'INSUFFICIENT_EVIDENCE') {
      return {
        ok: true,
        connected,
        insufficient: true,
        message: active.answer || result.answer,
        retrieval,
        providerCallCount,
      };
    }
    const citations = (result.citations || active.citations || []) as PdfCitation[];
    const evidenceSource = resolveCatalogueEvidenceSource(result, citations);
    const answerBody = pickCatalogueAnswerBody(result, html, pdf);
    return {
      ok: true,
      connected,
      providerCallCount,
      retrieval: catalogueRetrievalFromCitations(result, citations, evidenceSource),
      analysis: answeredAnalysis(result, answerBody || result.answer, citations, { pdf, html }),
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
