-- BUS-UAT-011 — persist immutable lab provenance on tenant impact assessments (inherited from parent change).

alter table public.impact_assessments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.impact_assessments.metadata is
  'Tenant-scoped JSON metadata. Lab provenance (recordProvenance, labProvenanceLocked, parentRegulatoryChangeId) is set at insert from parent regulatory change and must not be client-mutable.';

create index if not exists impact_assessments_metadata_gin_idx
  on public.impact_assessments using gin (metadata);
