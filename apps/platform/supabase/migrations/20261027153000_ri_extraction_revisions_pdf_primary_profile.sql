-- Step 80 — Document pdf_primary_v1 semantics on existing extraction revision table (staging review only).
-- DO NOT APPLY until approved. No new tables required: UNIQUE(source_snapshot_id, extraction_profile)
-- allows html_article_v2 and pdf_primary_v1 rows for the same snapshot.

comment on column public.regulatory_source_extraction_revisions.raw_content_sha256 is
  'Content SHA-256 for this profile: snapshot HTML bytes (html_article_v2) or primary PDF bytes (pdf_primary_v1).';

comment on column public.regulatory_source_extraction_revisions.normalised_html_storage_path is
  'html_article_v2: normalised HTML; pdf_primary_v1: structured JSON extraction manifest (content-addressed).';

comment on column public.regulatory_source_extraction_revisions.normalised_text_storage_path is
  'html_article_v2: article plain text; pdf_primary_v1: full extracted PDF text.';

comment on column public.regulatory_source_extraction_revisions.extraction_algorithm is
  'html_article_v2: SHA-256; pdf_primary_v1: pdf-text parser version (see derived metadata artifactSemantics).';
