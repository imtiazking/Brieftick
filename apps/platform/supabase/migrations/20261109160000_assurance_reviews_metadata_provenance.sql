-- Authorised UAT / operational lab provenance on tenant assurance reviews (BUS-UAT-016).
alter table public.assurance_reviews
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists assurance_reviews_metadata_gin_idx on public.assurance_reviews using gin (metadata);
