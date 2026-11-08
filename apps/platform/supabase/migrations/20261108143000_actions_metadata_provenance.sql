-- BUS-UAT-013 — lab provenance metadata on remediation actions (aligned with risks/controls).
alter table public.actions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists actions_metadata_gin_idx on public.actions using gin (metadata);
