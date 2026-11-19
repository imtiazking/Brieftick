-- Step 81C — catalogue read for ingestion snapshot version rows (additive).
-- Aligns with global regulatory_publications catalogue (authenticated Clerk users).
-- Does NOT grant access to regulatory_source_snapshots, extraction revisions, or Storage paths.
-- NOT APPLIED until explicitly approved.

create policy regulatory_publication_versions_select_authenticated_catalogue
on public.regulatory_publication_versions
for select
to authenticated
using (public.current_clerk_user_id() <> '');

comment on policy regulatory_publication_versions_select_authenticated_catalogue on public.regulatory_publication_versions is
  'Global catalogue: version metadata (hashes, URLs, retrieved_at) for regulatory_publications. No organisation_id on this table.';
