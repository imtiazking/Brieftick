import { EXTRACTION_REVISION_EVENT } from './extraction-revision-types.mjs';

/**
 * Extraction revisions record FORGENIQ-derived artefact changes only.
 * They must never be interpreted as regulator publication changes.
 *
 * @param {'create' | 'idempotent_hit'} outcome
 * @param {object} context
 */
export function buildExtractionRevisionProvenance(outcome, context) {
  return {
    kind: 'regulatory_source_extraction_revision',
    outcome,
    eventClass: EXTRACTION_REVISION_EVENT.EXTRACTION_ALGORITHM_IMPROVED,
    createsRegulatoryPublicationVersion: false,
    createsRegulatoryChange: false,
    mutatesSourceFingerprint: false,
    sourceSnapshotId: context.sourceSnapshotId,
    extractionProfile: context.extractionProfile,
    initiatedBy: context.initiatedBy || 'system',
    at: new Date().toISOString(),
    note:
      'Derived extraction revision only. Distinct from regulatory_publication_versions and source_hash (html_article_v1).',
  };
}

/**
 * @param {object} snapshotRow DB row for regulatory_source_snapshots
 * @param {object} versionRow DB row for regulatory_publication_versions
 */
export function assertRegulatoryEvidenceUnchanged(snapshotRow, versionRow) {
  if (snapshotRow.publication_version_id !== versionRow.id) {
    throw new Error('extraction_revision_version_mismatch');
  }
  if (snapshotRow.source_fingerprint !== versionRow.source_hash) {
    throw new Error('extraction_revision_source_fingerprint_drift');
  }
}
