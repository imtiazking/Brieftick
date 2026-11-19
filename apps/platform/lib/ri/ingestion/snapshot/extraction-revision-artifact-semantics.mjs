import {
  EXTRACTION_PROFILE_HTML_ARTICLE_V2,
  EXTRACTION_PROFILE_PDF_PRIMARY_V1,
} from './extraction-revision-types.mjs';

/**
 * DB column names are historical; semantic roles differ by extraction_profile.
 * @param {string} extractionProfile
 */
export function resolveExtractionRevisionArtifactSemantics(extractionProfile) {
  if (extractionProfile === EXTRACTION_PROFILE_PDF_PRIMARY_V1) {
    return {
      profile: extractionProfile,
      rawBytesRole: 'primary_regulatory_pdf',
      normalisedHtmlStoragePathRole: 'pdf_structured_extraction_json',
      normalisedHtmlMediaType: 'application/json',
      normalisedTextStoragePathRole: 'pdf_extracted_plain_text',
      normalisedTextMediaType: 'text/plain',
      metadataStoragePathRole: 'extraction_revision_metadata',
      misrepresentationRisk: 'normalised_html_storage_path_must_not_be_treated_as_html',
    };
  }
  if (extractionProfile === EXTRACTION_PROFILE_HTML_ARTICLE_V2) {
    return {
      profile: extractionProfile,
      rawBytesRole: 'snapshot_html_raw',
      normalisedHtmlStoragePathRole: 'normalised_article_html',
      normalisedHtmlMediaType: 'text/html',
      normalisedTextStoragePathRole: 'article_plain_text',
      normalisedTextMediaType: 'text/plain',
      metadataStoragePathRole: 'extraction_revision_metadata',
      misrepresentationRisk: null,
    };
  }
  return {
    profile: extractionProfile,
    rawBytesRole: 'unknown',
    normalisedHtmlStoragePathRole: 'unknown',
    normalisedTextStoragePathRole: 'unknown',
    metadataStoragePathRole: 'extraction_revision_metadata',
    misrepresentationRisk: 'unknown_profile',
  };
}

/**
 * @param {object} revisionRow
 */
export function assertArtifactSemanticsConsistent(revisionRow) {
  const semantics = resolveExtractionRevisionArtifactSemantics(revisionRow.extraction_profile);
  const issues = [];
  if (semantics.profile === EXTRACTION_PROFILE_PDF_PRIMARY_V1) {
    const htmlPath = revisionRow.normalised_html_storage_path || '';
    if (htmlPath && !/\.pdf\.structured\.json$/i.test(htmlPath) && !/structured\.json/i.test(htmlPath)) {
      issues.push('pdf_structured_path_suffix_unexpected');
    }
    if (revisionRow.raw_content_sha256 === revisionRow.snapshot_raw_content_sha256) {
      issues.push('pdf_revision_raw_sha_must_not_equal_html_snapshot_sha');
    }
  }
  return { ok: issues.length === 0, semantics, issues };
}
