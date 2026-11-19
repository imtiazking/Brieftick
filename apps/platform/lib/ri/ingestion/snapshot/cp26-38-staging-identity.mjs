/**
 * Staging identity for CP26/38 (immutable regulatory evidence — not modified by extraction revisions).
 * V2 content is represented only via regulatory_source_extraction_revisions (html_article_v2).
 */
export const CP26_38_STAGING = {
  publicationId: '4d05b49b-a4a4-4101-8c87-7d3983315f25',
  publicationVersionNumber: 1,
  sourceFingerprintV1: 'ab29a03021ba9e22f83bdfe01ed7e92dbf40a0852e4463c20f541db921101e7d',
  snapshotId: 'a1c48328-a7ee-4bda-97aa-b04c34198cf6',
  rawContentSha256: 'fd1f13c5e40233fe018900ad662837e3cca1e97f29f5aaa85ae2f70b41186418',
  obligationGradeSuitableUntilPrimaryPdf: false,
  /** Persisted html_article_v2 extraction revision (Step 78 backfill). */
  extractionRevisionId: '50197cc3-c7e7-4835-b566-f6174105eba2',
  /** Persisted pdf_primary_v1 extraction revision (Step 80 ingest). */
  pdfExtractionRevisionId: 'c003a60a-eff8-4152-a2ce-47e20a206e29',
  /** SHA-256 of immutable FCA primary PDF bytes (distinct from HTML snapshot raw_content_sha256). */
  primaryPdfRawContentSha256:
    'e27a5e44dd773651045a2bf05ae5924a5640efbe2710e5f6aa365cf1538a08d5',
  primaryPdfPhysicalPageCount: 91,
  canonicalUrl:
    'https://www.fca.org.uk/publications/consultation-papers/cp26-38-financial-crime-guide-updates',
  primaryPdfUrl: 'https://www.fca.org.uk/publication/consultation/cp26-38.pdf',
  /** SHA-256 of raw metadata JSON bytes at derived_metadata_storage_path (Step 78). */
  extractionRevisionMetadataSha256:
    '58986fdf74a676765c6e12232d3029238a7a0b102eb48487b81bc4e2718a66df',
};

/** Minimum staging catalogue counts after CP26/38 extraction revision backfill (may grow with pilots). */
export const CP26_38_STAGING_POST_BACKFILL_COUNTS = {
  publications: 7,
  publication_versions: 6,
  source_snapshots: 1,
  extraction_revisions: 1,
};
