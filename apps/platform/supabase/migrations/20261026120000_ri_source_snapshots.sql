-- Phase 8C.1 — Regulatory source snapshots (metadata index).
-- DO NOT APPLY until approved. Additive only; does not alter existing hashes or versions.

create table public.regulatory_source_snapshots (
  id uuid primary key default gen_random_uuid(),

  publication_id uuid not null
    references public.regulatory_publications (id) on delete restrict,
  publication_version_id uuid not null
    references public.regulatory_publication_versions (id) on delete restrict,

  ingestion_run_id uuid not null
    references public.ingestion_runs (id) on delete restrict,
  ingestion_item_id uuid
    references public.ingestion_items (id) on delete set null,

  canonical_url text not null,
  retrieved_at timestamptz not null,

  -- Existing regulatory source fingerprint (must match version row at commit time)
  source_fingerprint text not null,
  fingerprint_algorithm text not null default 'SHA-256',
  fingerprint_normalisation text not null,

  raw_content_sha256 text not null,
  normalised_html_sha256 text not null,
  normalised_text_sha256 text not null,

  raw_storage_path text not null,
  normalised_html_storage_path text not null,
  normalised_text_storage_path text not null,
  metadata_storage_path text not null,

  content_type text not null,
  byte_size_raw int not null check (byte_size_raw >= 0),
  byte_size_normalised_html int not null check (byte_size_normalised_html >= 0),
  byte_size_normalised_text int not null check (byte_size_normalised_text >= 0),

  licence_notice text,
  provenance jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint regulatory_source_snapshots_version_unique unique (publication_version_id),
  constraint regulatory_source_snapshots_fingerprint_nonempty check (char_length(source_fingerprint) >= 32)
);

create index regulatory_source_snapshots_publication_id_idx
  on public.regulatory_source_snapshots (publication_id);

create index regulatory_source_snapshots_ingestion_run_id_idx
  on public.regulatory_source_snapshots (ingestion_run_id);

create index regulatory_source_snapshots_retrieved_at_idx
  on public.regulatory_source_snapshots (retrieved_at desc);

comment on table public.regulatory_source_snapshots is
  'Immutable ingest-time source evidence index. Bytes live in Storage bucket regulatory-source-snapshots.';

comment on column public.regulatory_source_snapshots.source_fingerprint is
  'Regulatory source fingerprint at ingest (e.g. html_article_v1 SHA-256). Must equal regulatory_publication_versions.source_hash.';

alter table public.regulatory_source_snapshots enable row level security;

-- Platform operators only (same model as ingestion tables post phase8 security)
create policy regulatory_source_snapshots_select_platform_operator
on public.regulatory_source_snapshots
for select
using (public.is_platform_operator());

-- Inserts via service role / ingestion worker only (no authenticated insert policy)
revoke all on table public.regulatory_source_snapshots from public;
grant select on table public.regulatory_source_snapshots to authenticated;
-- Inserts/updates: ingestion worker via service_role (bypasses RLS). No authenticated INSERT policy by design.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table public.regulatory_source_snapshots to service_role;
  end if;
end $$;
