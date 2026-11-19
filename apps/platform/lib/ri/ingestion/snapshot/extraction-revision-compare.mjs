/**
 * @param {object} existing Row from regulatory_source_extraction_revisions
 * @param {object} proposed Insert payload fields
 */
export function extractionRevisionPayloadMatches(existing, proposed) {
  return (
    existing.raw_content_sha256 === proposed.rawContentSha256 &&
    existing.derived_content_fingerprint === proposed.derivedContentFingerprint &&
    existing.normalised_html_sha256 === proposed.normalisedHtmlSha256 &&
    existing.normalised_text_sha256 === proposed.normalisedTextSha256 &&
    existing.normalised_html_storage_path === proposed.normalisedHtmlStoragePath &&
    existing.normalised_text_storage_path === proposed.normalisedTextStoragePath &&
    existing.derived_metadata_storage_path === proposed.derivedMetadataStoragePath
  );
}

/** Compare stored revision to freshly derived output (paths omitted). */
export function revisionDerivedOutputMatches(existing, derived) {
  return (
    existing.raw_content_sha256 === derived.rawContentSha256 &&
    existing.derived_content_fingerprint === derived.derivedContentFingerprint &&
    existing.normalised_html_sha256 === derived.normalisedHtmlSha256 &&
    existing.normalised_text_sha256 === derived.normalisedTextSha256
  );
}

export function buildExtractionRevisionConflictDetail(existing, proposed) {
  const fields = [
    'raw_content_sha256',
    'derived_content_fingerprint',
    'normalised_html_sha256',
    'normalised_text_sha256',
    'normalised_html_storage_path',
    'normalised_text_storage_path',
    'derived_metadata_storage_path',
  ];
  const mismatches = [];
  for (const f of fields) {
    const propKey =
      f === 'raw_content_sha256'
        ? 'rawContentSha256'
        : f === 'derived_content_fingerprint'
          ? 'derivedContentFingerprint'
          : f === 'normalised_html_sha256'
            ? 'normalisedHtmlSha256'
            : f === 'normalised_text_sha256'
              ? 'normalisedTextSha256'
              : f === 'normalised_html_storage_path'
                ? 'normalisedHtmlStoragePath'
                : f === 'normalised_text_storage_path'
                  ? 'normalisedTextStoragePath'
                  : 'derivedMetadataStoragePath';
    if (existing[f] !== proposed[propKey]) {
      mismatches.push(f);
    }
  }
  return mismatches;
}
