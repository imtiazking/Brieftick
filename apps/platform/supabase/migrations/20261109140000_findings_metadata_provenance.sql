-- Authorised UAT / operational lab provenance on tenant findings (BUS-UAT-015).
alter table public.findings
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists findings_metadata_gin_idx on public.findings using gin (metadata);
