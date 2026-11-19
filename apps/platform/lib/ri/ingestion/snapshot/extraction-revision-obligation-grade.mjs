/**
 * Explain obligationGradeSuitable without mutating stored quality flags.
 *
 * @param {object} extractionQuality
 * @param {object[]} [pdfAttachments]
 */
export function explainObligationGradeSuitability(extractionQuality, pdfAttachments = []) {
  const quality = extractionQuality || {};
  const suitable = quality.obligationGradeSuitable === true;
  const primary = quality.primaryDocument || {};
  const hasPrimaryPdfLink = pdfAttachments.some((p) => p.likelyPrimaryRegulatoryDocument);
  const reasons = [];

  if (primary.completeness === 'not_captured' || quality.signals?.includes('primary_pdf_not_captured')) {
    reasons.push('primary_regulatory_pdf_linked_but_not_captured_in_extraction');
  }
  if (quality.webpageExtraction?.status !== 'complete') {
    reasons.push('webpage_extraction_not_complete');
  }
  if (quality.webpageExtraction?.confidence !== 'high') {
    reasons.push('webpage_extraction_confidence_not_high');
  }
  if (primary.classification === 'pdf_primary' && !hasPrimaryPdfLink) {
    reasons.push('primary_document_classification_inconsistent');
  }

  const expectedForCp26PdfPrimaryPage =
    !suitable && (primary.completeness === 'not_captured' || reasons.length > 0);

  return {
    obligationGradeSuitable: suitable,
    expectedForCp26ConsultationPdfPrimary: expectedForCp26PdfPrimaryPage,
    primaryDocument: primary,
    signals: quality.signals || [],
    reasons,
    assessment:
      suitable
        ? 'suitable_for_obligation_grade_downstream'
        : 'not_suitable_until_primary_pdf_captured_or_policy_waived',
    additionalExtractionRecommended:
      primary.completeness === 'not_captured' && hasPrimaryPdfLink,
    flagCalculationConsistent:
      suitable === false
        ? reasons.length > 0 || primary.completeness === 'not_captured'
        : reasons.length === 0,
  };
}
