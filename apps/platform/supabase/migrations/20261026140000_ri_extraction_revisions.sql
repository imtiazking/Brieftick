-- Phase 8C.1 — Derived extraction revisions (additive; does not alter v1 hashes or publication versions).
-- DO NOT APPLY to staging until approved.

create table public.regulatory_source_extraction_revisions (
  id uuid primary key default gen_random_uuid(),

  source_snapshot_id uuid not null
    references public.regulatory_source_snapshots (id) on delete restrict,
  publication_id uuid not null
    references public.regulatory_publications (id) on delete restrict,
  publication_version_id uuid not null
    references public.regulatory_publication_versions (id) on delete restrict,

  raw_content_sha256 text not null,
  extraction_profile text not null,
  extraction_algorithm text not null default 'SHA-256',

  derived_content_fingerprint text not null,
  normalised_html_sha256 text not null,
  normalised_text_sha256 text not null,

  normalised_html_storage_path text not null,
  normalised_text_storage_path text not null,
  derived_metadata_storage_path text not null,

  extraction_quality jsonb not null,
  publication_metadata jsonb not null default '{}'::jsonb,
  pdf_attachments jsonb not null default '[]'::jsonb,

  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by text not null,

  constraint regulatory_source_extraction_revisions_fingerprint_nonempty
    check (char_length(derived_content_fingerprint) >= 32),
  constraint regulatory_source_extraction_revisions_raw_sha_nonempty
    check (char_length(raw_content_sha256) >= 32),
  constraint regulatory_source_extraction_revisions_unique_profile
    unique (source_snapshot_id, extraction_profile)
);

create index regulatory_source_extraction_revisions_publication_id_idx
  on public.regulatory_source_extraction_revisions (publication_id);

create index regulatory_source_extraction_revisions_version_id_idx
  on public.regulatory_source_extraction_revisions (publication_version_id);

create index regulatory_source_extraction_revisions_created_at_idx
  on public.regulatory_source_extraction_revisions (created_at desc);

comment on table public.regulatory_source_extraction_revisions is
  'Append-only derived extraction artefacts (e.g. html_article_v2). Not a regulatory source version.';

comment on column public.regulatory_source_extraction_revisions.derived_content_fingerprint is
  'Fingerprint of normalised derived body under extraction_profile; distinct from regulatory source_fingerprint (v1).';

comment on column public.regulatory_source_extraction_revisions.extraction_quality is
  'Includes webpageExtraction, primaryDocument completeness, obligationGradeSuitable.';

alter table public.regulatory_source_extraction_revisions enable row level security;

create policy regulatory_source_extraction_revisions_select_platform_operator
on public.regulatory_source_extraction_revisions
for select
using (public.is_platform_operator());

revoke all on table public.regulatory_source_extraction_revisions from public;
-- Tenant authenticated users: read only when platform operator; no INSERT/UPDATE/DELETE policies for tenants.
grant select on table public.regulatory_source_extraction_revisions to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant insert, select on table public.regulatory_source_extraction_revisions to service_role;
  end if;
end $$;

create or replace function public.prevent_extraction_revision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'extraction_revisions_append_only';
end;
$$;

create trigger regulatory_source_extraction_revisions_no_update
before update on public.regulatory_source_extraction_revisions
for each row execute function public.prevent_extraction_revision_mutation();

create trigger regulatory_source_extraction_revisions_no_delete
before delete on public.regulatory_source_extraction_revisions
for each row execute function public.prevent_extraction_revision_mutation();
