const VERIFICATION_NOTICE =
  'Source verification notice: This summary was refreshed from the FCA website after the original ingestion. The current source fingerprint differs from the stored publication version. A substantive regulatory change has not been established.';

type MetadataCorrection = {
  versionKind?: string;
  summaryMatchesIngestSourceHash?: boolean;
  ingestSourceHash?: string;
  liveContentFingerprint?: string;
  liveContentRetrievedAt?: string;
  correctedAt?: string;
};

export type PublicationSummaryVerificationNotice = {
  message: string;
  summaryRetrievedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Factual notice when catalogue summary was refreshed under disclosed source-hash drift.
 */
export function getPublicationSummaryVerificationNotice(
  provenance: unknown,
): PublicationSummaryVerificationNotice | null {
  if (!isRecord(provenance)) return null;
  const raw = provenance.metadataCorrections;
  if (!Array.isArray(raw)) return null;

  let best: MetadataCorrection | null = null;
  let bestAt = '';

  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const correction = entry as MetadataCorrection;
    const driftKind = correction.versionKind === 'metadata_correction_with_source_hash_drift';
    const explicitMismatch = correction.summaryMatchesIngestSourceHash === false;
    if (!driftKind && !explicitMismatch) continue;

    const ingest = correction.ingestSourceHash;
    const live = correction.liveContentFingerprint;
    if (!ingest || !live || ingest === live) continue;

    const at = correction.liveContentRetrievedAt ?? correction.correctedAt ?? '';
    if (!best || at > bestAt) {
      best = correction;
      bestAt = at;
    }
  }

  if (!best || !bestAt) return null;

  return {
    message: VERIFICATION_NOTICE,
    summaryRetrievedAt: bestAt,
  };
}
