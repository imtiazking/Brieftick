/**
 * Ask RI — publication primary PDF evidence (pdf_primary_v1) retrieval and answering.
 */
import { analyzeRegulatoryPdfDocument } from '../../../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';
import {
  buildEvidenceGroundedRegulatoryFindings,
  validateFindingsEvidenceAnchors,
} from '../ingestion/snapshot/primary-pdf-ai-findings.mjs';
import {
  enrichPublicationPdfEvidenceForMatching,
  rankEvidenceBlocksForQuestion,
  scorePublicationQuestionMatch,
  selectBestPublicationPdfEvidence,
  STEP80_ASK_RI_SAMPLE_QUESTION,
} from './publication-pdf-question-match.mjs';

export { STEP80_ASK_RI_SAMPLE_QUESTION };

/**
 * @param {object} publicationEvidence
 * @param {string} question
 */
export function answerAskRiFromPublicationPdfEvidence(publicationEvidence, question) {
  const publicationEvidenceCtx = enrichPublicationPdfEvidenceForMatching(publicationEvidence);

  if (publicationEvidenceCtx?.structured?.pageBoundaryConfirmed !== true) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: 'Primary PDF page boundaries are not confirmed; page-specific citations are blocked.',
      citations: [],
      audit: {
        providerUsed: false,
        evidenceSource: 'pdf_primary_v1',
        warnings: publicationEvidenceCtx?.structured?.warnings,
      },
    };
  }
  if (!publicationEvidenceCtx?.evidenceBlocks?.length) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: 'Primary PDF evidence is not available for this publication.',
      citations: [],
      audit: { providerUsed: false, evidenceSource: 'pdf_primary_v1' },
    };
  }

  if (publicationEvidenceCtx.obligationGradeSuitable === true) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer:
        'This publication PDF is not approved for obligation-grade use. Human review is required before regulatory obligations can be cited.',
      citations: [],
      audit: { providerUsed: false, evidenceSource: 'pdf_primary_v1', humanReviewStatus: 'pending_review' },
    };
  }

  const requireIntegrity = publicationEvidenceCtx.integrityVerified !== undefined;
  const matchScore = scorePublicationQuestionMatch(publicationEvidenceCtx, question, {
    requireIntegrityVerified: requireIntegrity,
  });
  if (matchScore < 8) {
    return {
      status: 'UNRESOLVED',
      answer: 'This question is not mapped to this publication PDF evidence.',
      citations: [],
      audit: {
        providerUsed: false,
        evidenceSource: 'pdf_primary_v1',
        matchScore,
        publicationReference: publicationEvidenceCtx.publicationReference,
      },
    };
  }

  const analysis =
    publicationEvidenceCtx.analysis ||
    analyzeRegulatoryPdfDocument({
      structured: publicationEvidenceCtx.structured,
      publicationMetadata: publicationEvidenceCtx.publicationMetadata,
      canonicalUrl: publicationEvidenceCtx.canonicalUrl,
    });

  const findingsResult = buildEvidenceGroundedRegulatoryFindings({
    publicationId: publicationEvidenceCtx.publicationId,
    extractionRevisionId: publicationEvidenceCtx.extractionRevisionId,
    analysis,
    evidenceBlocks: publicationEvidenceCtx.evidenceBlocks,
    structured: publicationEvidenceCtx.structured,
  });

  const rankedBlocks = rankEvidenceBlocksForQuestion(question, publicationEvidenceCtx.evidenceBlocks);
  const topicSupported = rankedBlocks.length > 0 || findingsResult.ok;

  if (!topicSupported) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer:
        'The stored primary PDF does not contain verified passages that answer this question. No answer was fabricated.',
      citations: [],
      audit: {
        providerUsed: false,
        evidenceSource: 'pdf_primary_v1',
        analysis,
        matchScore,
        publicationReference: publicationEvidenceCtx.publicationReference,
      },
    };
  }

  if (!findingsResult.ok) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: findingsResult.message,
      citations: [],
      audit: {
        providerUsed: false,
        evidenceSource: 'pdf_primary_v1',
        analysis,
        matchScore,
        publicationReference: publicationEvidenceCtx.publicationReference,
      },
    };
  }

  const validated = validateFindingsEvidenceAnchors(findingsResult.findings);
  const proposals = validated.accepted.filter((f) => f.regulatoryStatus === 'proposed');

  const citationSource = buildPdfCitationContext(publicationEvidenceCtx, analysis);

  const citationsFromFindings = proposals.slice(0, 5).map((f) =>
    formatPrimaryPdfCitation(citationSource, f),
  );

  const citationsFromBlocks = rankedBlocks.slice(0, 5).map((r) =>
    formatPrimaryPdfCitation(citationSource, {
      sourcePdfEvidenceId: r.block.documentEvidenceId,
      supportingPageNumber: r.block.pageNumber,
      supportingExcerpt: r.block.extractedText,
      regulatoryStatus: analysis.regulatoryStatus?.phase === 'consultation' ? 'proposed' : 'source_supported',
    }),
  );

  const citations = dedupeCitations([...citationsFromFindings, ...citationsFromBlocks]).slice(0, 8);

  const composed = composeSubstantivePdfAnswer({
    question,
    citationSource,
    analysis,
    validated,
    rankedBlocks,
    citations,
  });

  if (!citations.length) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      answer: composed.answer,
      citations: [],
      audit: {
        providerUsed: false,
        evidenceSource: 'pdf_primary_v1',
        humanReviewStatus: 'pending_review',
        mustNotPresentAsBindingObligation: true,
        matchScore,
        publicationReference: publicationEvidenceCtx.publicationReference,
      },
    };
  }

  return {
    status: 'ANSWERED',
    answer: composed.answer,
    citations,
    findings: validated.accepted,
    rejectedFindings: validated.rejected,
    regulatoryClassification: analysis.publicationClassification,
    consultationPreserved: analysis.consultationPreserved,
    audit: {
      providerUsed: false,
      evidenceSource: 'pdf_primary_v1',
      humanReviewStatus: 'pending_review',
      mustNotPresentAsBindingObligation: true,
      matchScore,
      synthesisMode: 'deterministic_source_grounded',
    },
  };
}

/**
 * @param {object[]} evidenceList
 * @param {string} question
 */
export function answerAskRiFromBestPublicationPdfEvidence(evidenceList, question) {
  const best = selectBestPublicationPdfEvidence(evidenceList, question);
  if (!best) {
    return {
      status: 'UNRESOLVED',
      answer: null,
      citations: [],
      audit: { evidenceSource: 'pdf_primary_v1', matchScore: 0 },
    };
  }
  return answerAskRiFromPublicationPdfEvidence(best, question);
}

function buildPdfCitationContext(publicationEvidence, analysis) {
  return {
    regulatoryAuthority: publicationEvidence.regulatorLabel || 'Regulatory authority',
    regulatorShortName: publicationEvidence.regulatorShortName,
    publicationTitle: publicationEvidence.publicationTitle,
    publicationReference: publicationEvidence.publicationReference,
    sourceUrl: publicationEvidence.canonicalUrl,
    extractionRevisionId: publicationEvidence.extractionRevisionId,
    publicationId: publicationEvidence.publicationId,
    consultationPreserved: analysis.consultationPreserved === true,
  };
}

function formatPrimaryPdfCitation(ctx, finding) {
  const page = finding.supportingPageNumber;
  const status = finding.regulatoryStatus === 'proposed' ? 'consultation proposal' : finding.regulatoryStatus;
  const ref = ctx.publicationReference || ctx.publicationTitle || 'Publication';
  const regulator = ctx.regulatorShortName || ctx.regulatoryAuthority || 'Regulator';
  return {
    type: 'primary_pdf',
    regulatoryAuthority: ctx.regulatoryAuthority,
    regulatorShortName: ctx.regulatorShortName,
    publicationTitle: ctx.publicationTitle,
    publicationReference: ctx.publicationReference,
    sourceUrl: ctx.sourceUrl,
    physicalPageNumber: page,
    pageNumber: page,
    excerpt: String(finding.supportingExcerpt || '').slice(0, 600),
    extractionRevisionId: ctx.extractionRevisionId,
    publicationId: ctx.publicationId,
    evidenceId: finding.sourcePdfEvidenceId,
    regulatoryStatus: finding.regulatoryStatus,
    citationLabel: `${regulator} — ${ref} — physical page ${page} (${status}; PDF evidence)`,
    mustNotPresentAsBindingObligation: ctx.consultationPreserved,
  };
}

const CONTROL_AREA_LABELS = {
  financial_crime_compliance: 'financial crime compliance controls',
  customer_due_diligence: 'customer due diligence controls',
  compliance_controls: 'systems and controls',
  governance: 'governance and senior management oversight',
};

function composeSubstantivePdfAnswer({ question, citationSource, analysis, validated, rankedBlocks, citations }) {
  const refLabel = citationSource.publicationReference || citationSource.publicationTitle || 'this publication';
  const stageLabel = analysis.consultationPreserved
    ? 'FCA consultation proposals (not final binding rules)'
    : 'source-supported regulatory material';

  const proposalSummaries = validated.accepted
    .filter((f) => f.regulatoryStatus === 'proposed' || f.factClass === 'source_supported_fact')
    .slice(0, 4)
    .map((f) => String(f.analysisExplanation || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const parts = [];
  parts.push(
    `${citationSource.regulatoryAuthority} ${refLabel} — ${stageLabel}. The following summary is a deterministic synthesis from verified primary PDF passages only (not generative AI).`,
  );

  if (proposalSummaries.length) {
    parts.push(
      `Proposed changes and consultation themes evidenced in the PDF include: ${proposalSummaries.map((s, i) => `(${i + 1}) ${s.slice(0, 280)}${s.length > 280 ? '…' : ''}`).join(' ')}`,
    );
  } else if (rankedBlocks.length) {
    const snippets = rankedBlocks.slice(0, 3).map((r) => {
      const t = String(r.block.extractedText || '').replace(/\s+/g, ' ').trim();
      return `page ${r.block.pageNumber}: "${t.slice(0, 160)}${t.length > 160 ? '…' : ''}"`;
    });
    parts.push(`Relevant verified passages include ${snippets.join('; ')}.`);
  }

  const q = String(question || '').toLowerCase();
  const asksControls = /financial crime|control|aml|fraud|sanction|due diligence|systems and controls/.test(q);
  if (asksControls && analysis.applicability?.businessFunctions?.length) {
    const areas = analysis.applicability.businessFunctions
      .map((f) => CONTROL_AREA_LABELS[f] || f)
      .join(', ');
    parts.push(
      `Organisations may need to assess impact on: ${areas}. This maps source terminology to potential control domains — not a firm-specific gap analysis or new obligation.`,
    );
  }

  const controlBlocks = rankedBlocks
    .filter((r) => /financial crime|aml|fraud|control|due diligence|sanction|ctf|money laundering/i.test(r.block.extractedText || ''))
    .slice(0, 2);
  for (const r of controlBlocks) {
    const t = String(r.block.extractedText || '').replace(/\s+/g, ' ').trim();
    parts.push(`Financial crime–related source text (physical page ${r.block.pageNumber}): "${t.slice(0, 200)}${t.length > 200 ? '…' : ''}"`);
  }

  parts.push(
    `${citations.length} primary PDF page citation(s) below anchor this response. Human review is required before compliance or control change decisions.`,
  );

  return { answer: parts.join(' '), keyFindings: proposalSummaries.slice(0, 5) };
}

function dedupeCitations(citations) {
  const seen = new Set();
  const out = [];
  for (const c of citations) {
    const key = `${c.evidenceId}:${c.physicalPageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * @param {object} pdfRevisionRow
 * @param {object} structured
 * @param {object[]} evidenceBlocks
 */
export function buildPublicationPdfEvidenceIndex(pdfRevisionRow, structured, evidenceBlocks) {
  const analysis = analyzeRegulatoryPdfDocument({
    structured,
    publicationMetadata: pdfRevisionRow.publication_metadata,
    canonicalUrl: pdfRevisionRow.canonical_url,
  });
  return {
    publicationId: pdfRevisionRow.publication_id,
    extractionRevisionId: pdfRevisionRow.revision_id || pdfRevisionRow.id,
    extractionProfile: pdfRevisionRow.extraction_profile,
    sourcePdfSha256: pdfRevisionRow.raw_content_sha256,
    structured,
    evidenceBlocks: evidenceBlocks || [],
    analysis,
    publicationMetadata: pdfRevisionRow.publication_metadata,
    canonicalUrl: pdfRevisionRow.canonical_url || pdfRevisionRow.publication_metadata?.canonicalUrl,
  };
}

