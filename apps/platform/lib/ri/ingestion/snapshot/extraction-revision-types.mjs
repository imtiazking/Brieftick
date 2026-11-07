/**
 * Derived extraction profile identifiers (not regulatory source_fingerprint normalisation).
 * Algorithm changes must use a new profile string (e.g. html_article_v3), never reuse an existing
 * profile with different derived output — UNIQUE(source_snapshot_id, extraction_profile) enforces one row.
 */
export const EXTRACTION_PROFILE_HTML_ARTICLE_V2 = 'html_article_v2';
/** Primary regulatory PDF bytes + structured text extraction (additive; does not replace html_article_v2). */
export const EXTRACTION_PROFILE_PDF_PRIMARY_V1 = 'pdf_primary_v1';

export const EXTRACTION_REVISION_EVENT = {
  REGULATOR_PUBLICATION_CHANGED: 'regulator_publication_changed',
  EXTRACTION_ALGORITHM_IMPROVED: 'extraction_algorithm_improved',
  EXTRACTION_ERROR_CORRECTED: 'extraction_error_corrected',
};
