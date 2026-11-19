-- BUS-UAT-012 — locked lab provenance on risks, controls, and evidence items.

alter table public.risks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.risks.metadata is
  'Tenant-scoped JSON. Lab provenance (recordProvenance, labProvenanceLocked) set at create; not client-mutable.';

create index if not exists risks_metadata_gin_idx
  on public.risks using gin (metadata);

alter table public.controls
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.controls.metadata is
  'Tenant-scoped JSON. Lab provenance (recordProvenance, labProvenanceLocked) set at create; not client-mutable.';

create index if not exists controls_metadata_gin_idx
  on public.controls using gin (metadata);

alter table public.evidence_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.evidence_items.metadata is
  'Tenant-scoped JSON. Lab provenance for UAT vs operational isolation.';

create index if not exists evidence_items_metadata_gin_idx
  on public.evidence_items using gin (metadata);
