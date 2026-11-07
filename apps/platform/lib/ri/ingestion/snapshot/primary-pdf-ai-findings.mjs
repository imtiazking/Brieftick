import { createHash } from 'node:crypto';
import { pageTextIncludesExcerpt } from '../../../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';

/**
 * Evidence-grounded regulatory findings (deterministic scaffold; generative layer must validate against blocks).
 *
 * @param {object} params
 * @param {string} params.publicationId
 * @param {string} params.extractionRevisionId
 * @param {object} params.analysis from analyzeRegulatoryPdfDocument
 * @param {object[]} params.evidenceBlocks
 */
export function buildEvidenceGroundedRegulatoryFindings(params) {
  const { analysis, evidenceBlocks, structured } = params;
  if (structured?.pageBoundaryConfirmed !== true) {
    return {
      ok: false,
      code: 'INSUFFICIENT_EVIDENCE',
      message: 'Page boundaries not confirmed — page-specific findings blocked',
      findings: [],
    };
  }
  if (!evidenceBlocks?.length) {
    return {
      ok: false,
      code: 'INSUFFICIENT_EVIDENCE',
      message: 'No PDF evidence blocks available for analysis',
      findings: [],
    };
  }

  const findings = [];
  let n = 0;
  for (const dev of analysis.developments || []) {
    const support = matchEvidenceForSummary(evidenceBlocks, dev.summary, structured);
    if (!support) continue;
    n += 1;
    findings.push({
      findingId: `FIND-PDF-${createHash('sha256').update(`${params.publicationId}:${n}:${dev.summary.slice(0, 40)}`).digest('hex').slice(0, 12)}`,
      regulatoryPublicationId: params.publicationId,
      sourcePdfEvidenceId: support.documentEvidenceId,
      supportingPageNumber: support.pageNumber,
      sectionParagraphReference: support.paragraphReference || support.sectionReference,
      supportingExcerpt: support.extractedText.slice(0, 600),
      analysisExplanation: dev.summary,
      factClass: 'source_supported_fact',
      interpretation: null,
      potentialBusinessImpact: inferImpact(dev, analysis),
      recommendation: null,
      confidence: support.pageBoundaryConfirmed ? 'medium' : 'low',
      evidenceCompleteness: support.evidenceCompletenessStatus,
      regulatoryStatus: dev.regulatoryStatus,
      humanReviewStatus: 'pending_review',
      mustNotPresentAsBindingObligation: analysis.regulatoryStatus?.mustNotTreatProposalsAsBinding === true,
    });
  }

  if (!findings.length) {
    return {
      ok: false,
      code: 'INSUFFICIENT_EVIDENCE',
      message: 'No developments could be tied to PDF evidence blocks',
      findings: [],
    };
  }

  return { ok: true, findings, humanReviewRequired: true };
}

function matchEvidenceForSummary(blocks, summary, structured) {
  const pageTextByNumber = new Map((structured?.pages || []).map((p) => [p.pageNumber, p.text || '']));
  const needle = summary.slice(0, 60).toLowerCase();
  for (const b of blocks) {
    const pageText = pageTextByNumber.get(b.pageNumber) || '';
    if (pageTextIncludesExcerpt(pageText, b.extractedText) && b.extractedText.toLowerCase().includes(needle.slice(0, 30))) {
      return b;
    }
  }
  for (const b of blocks) {
    const pageText = pageTextByNumber.get(b.pageNumber) || '';
    if (pageTextIncludesExcerpt(pageText, b.extractedText)) return b;
  }
  return null;
}

function inferImpact(dev, analysis) {
  if (analysis.regulatoryStatus?.mustNotTreatProposalsAsBinding) {
    return {
      class: 'potential_impact_requires_validation',
      narrative:
        'Consultation-stage proposal — impact on financial crime controls requires firm-specific assessment after final rules.',
      isInterpretation: true,
    };
  }
  return null;
}

/**
 * Reject findings that lack evidence anchors.
 * @param {object[]} findings
 */
export function validateFindingsEvidenceAnchors(findings) {
  const rejected = [];
  const accepted = [];
  for (const f of findings) {
    if (!f.sourcePdfEvidenceId || !f.supportingExcerpt || f.supportingPageNumber == null) {
      rejected.push({ findingId: f.findingId, reason: 'missing_evidence_anchor' });
      continue;
    }
    if (f.pageBoundaryConfirmed === false) {
      rejected.push({ findingId: f.findingId, reason: 'page_boundary_not_confirmed' });
      continue;
    }
    if (f.mustNotPresentAsBindingObligation && f.regulatoryStatus === 'binding') {
      rejected.push({ findingId: f.findingId, reason: 'binding_status_on_consultation' });
      continue;
    }
    accepted.push(f);
  }
  return { accepted, rejected, ok: rejected.length === 0 };
}
