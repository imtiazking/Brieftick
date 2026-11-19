import { CP26_38_STAGING_POST_BACKFILL_COUNTS } from './cp26-38-staging-identity.mjs';

/**
 * Minimum staging catalogue counts after CP26/38 backfill (Step 78+).
 * Live FCA pilots may increase versions and snapshots without adding publications.
 */
export const STAGING_REGULATORY_COUNT_MINIMUMS = { ...CP26_38_STAGING_POST_BACKFILL_COUNTS };

/**
 * @param {{ publications: number, publication_versions: number, source_snapshots: number, extraction_revisions: number }} counts
 */
export function assertStagingRegulatoryCountsAtLeastBaseline(counts) {
  for (const [key, minimum] of Object.entries(STAGING_REGULATORY_COUNT_MINIMUMS)) {
    const actual = counts[key];
    if (typeof actual !== 'number' || actual < minimum) {
      throw new Error(`staging_database_count_below_minimum:${key}`);
    }
  }
  if (counts.publication_versions < counts.publications) {
    throw new Error('staging_database_invariant:publication_versions_lt_publications');
  }
  if (counts.source_snapshots < 1) {
    throw new Error('staging_database_invariant:source_snapshots_empty');
  }
}
