/**
 * Separates technical extraction completeness from obligation-grade suitability.
 */
import { classifyFg22HtmlArticleV2Evidence } from './fg22-discovery-html-evidence.mjs';

/**
 * @param {object} htmlRevisionQuality extraction_quality from html_article_v2
 * @param {object} pdfRevisionQuality extraction_quality from pdf_primary_v1
 * @param {object} [analysisProvenance]
 * @param {object} [identityContext] optional publication + snapshot for fail-closed FG22 discovery HTML
 * @param {object} [identityContext.publication]
 * @param {object} [identityContext.snapshot]
 * @param {object} [identityContext.revisionRow]
 */
export function assessObligationGradePosture(
  htmlRevisionQuality,
  pdfRevisionQuality,
  analysisProvenance = {},
  identityContext = {},
) {
  const fg22HtmlClass = identityContext.publication
    ? classifyFg22HtmlArticleV2Evidence(
        identityContext.publication,
        identityContext.snapshot,
        identityContext.revisionRow || { extraction_quality: htmlRevisionQuality },
      )
    : { discoveryOnly: false };
  if (fg22HtmlClass.discoveryOnly) {
    return {
      technicalExtractionComplete: false,
      evidenceSufficiency: false,
      regulatoryInterpretationValid: false,
      humanApproval: false,
      obligationGradeSuitable: false,
      htmlRevisionObligationGradeUnchanged: true,
      fg22DiscoveryHtmlBlocked: true,
      fg22HtmlClassification: fg22HtmlClass,
      rationale: {
        technical: 'fg22_discovery_html_not_substantive',
        evidence: 'html_article_v2_excluded_use_pdf_primary_v1',
        interpretation: 'fg22_discovery_index_not_substantive',
        human: 'pending_human_review',
      },
    };
  }
  const htmlComplete =
    htmlRevisionQuality?.webpageExtraction?.status === 'complete' &&
    htmlRevisionQuality?.webpageExtraction?.confidence === 'high';
  const pdfCaptured = pdfRevisionQuality?.primaryDocument?.completeness === 'captured';
  const pdfExtractionComplete = pdfRevisionQuality?.primaryDocument?.extractionStatus === 'complete';

  const technicalExtractionComplete = htmlComplete && pdfCaptured && pdfExtractionComplete;

  const evidenceSufficiency =
    analysisProvenance.evidenceBlocksCount >= 3 &&
    analysisProvenance.findingsWithAnchors >= 1 &&
    analysisProvenance.insufficientEvidence !== true;

  const regulatoryInterpretationValid =
    analysisProvenance.consultationPreserved === true ||
    analysisProvenance.bindingObligationsDetected !== true;

  const humanApproval =
    analysisProvenance.humanReviewStatus === 'approved_for_obligation_use';

  return {
    technicalExtractionComplete,
    evidenceSufficiency,
    regulatoryInterpretationValid,
    humanApproval,
    obligationGradeSuitable:
      technicalExtractionComplete &&
      evidenceSufficiency &&
      regulatoryInterpretationValid &&
      humanApproval,
    htmlRevisionObligationGradeUnchanged: htmlRevisionQuality?.obligationGradeSuitable === false,
    rationale: {
      technical: technicalExtractionComplete
        ? 'html_and_pdf_captured'
        : 'incomplete_source_capture_or_extraction',
      evidence: evidenceSufficiency ? 'anchored_findings_present' : 'insufficient_anchored_evidence',
      interpretation: regulatoryInterpretationValid
        ? 'consultation_not_treated_as_binding'
        : 'interpretation_risk',
      human: humanApproval ? 'approved' : 'pending_human_review',
    },
  };
}
