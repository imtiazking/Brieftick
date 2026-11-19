-- BUS-UAT-010 — persist immutable lab provenance on tenant regulatory obligations (inherited from parent change).

alter table public.regulatory_obligations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.regulatory_obligations.metadata is
  'Tenant-scoped JSON metadata. Lab provenance (recordProvenance, labProvenanceLocked, parentRegulatoryChangeId) is set at insert from parent regulatory change and must not be client-mutable.';

create index if not exists regulatory_obligations_metadata_gin_idx
  on public.regulatory_obligations using gin (metadata);
