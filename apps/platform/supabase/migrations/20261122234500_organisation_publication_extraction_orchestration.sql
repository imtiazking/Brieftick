-- Tenant-scoped extraction orchestration ledger (RI-CLS-007) — not stored on global catalogue rows.

alter table public.organisation_publications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.organisation_publications.metadata is
  'Tenant-scoped JSON metadata. _extractionOrchestration holds the live publication extraction ledger for this organisation publication link.';

create index if not exists organisation_publications_metadata_gin_idx
  on public.organisation_publications using gin (metadata);