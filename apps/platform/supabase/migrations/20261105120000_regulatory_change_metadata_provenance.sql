-- BUS-UAT-005 — persist immutable lab creation provenance on tenant regulatory changes.

alter table public.regulatory_changes
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.regulatory_changes.metadata is
  'Tenant-scoped JSON metadata. Lab creation provenance (labCreationMode, recordProvenance, labProvenanceLocked) is set at insert and must not be client-mutable.';

create index if not exists regulatory_changes_metadata_gin_idx
  on public.regulatory_changes using gin (metadata);
