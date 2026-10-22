-- FORGENIQ RI — global reference + publications (no organisation_id on catalogue)

create type public.catalogue_lifecycle_status as enum (
  'VERIFIED_EXISTING',
  'PLANNED',
  'RESEARCH_REQUIRED',
  'NOT_APPLICABLE'
);

create type public.integration_verification_status as enum (
  'LIVE_VERIFIED',
  'ACCESS_RESTRICTED',
  'AUTH_REQUIRED',
  'RETRIEVAL_FAILED',
  'RESEARCH_REQUIRED',
  'NOT_TESTED'
);

create type public.production_source_status as enum (
  'NOT_ENABLED',
  'ENABLED',
  'DISABLED'
);

create type public.coverage_verification_status as enum (
  'COVERAGE_VERIFIED',
  'PARTIALLY_VERIFIED',
  'CONNECTIVITY_ONLY',
  'SEMANTIC_MISMATCH',
  'NOT_TESTED'
);

create table public.regulators (
  id uuid primary key default gen_random_uuid(),
  external_key text not null,
  name text not null,
  acronym text not null,
  jurisdiction text not null,
  country text not null,
  region text not null,
  regulator_type text not null,
  official_base_url text not null,
  lifecycle_status public.catalogue_lifecycle_status not null default 'PLANNED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regulators_external_key_unique unique (external_key)
);

create table public.regulatory_sources (
  id uuid primary key default gen_random_uuid(),
  external_key text not null,
  regulator_id uuid not null references public.regulators (id) on delete restrict,
  name text not null,
  source_type text not null,
  canonical_url text,
  jurisdiction text not null,
  catalogue_status public.catalogue_lifecycle_status not null default 'PLANNED',
  verification_status public.integration_verification_status not null default 'NOT_TESTED',
  coverage_verification_status public.coverage_verification_status not null default 'NOT_TESTED',
  production_status public.production_source_status not null default 'NOT_ENABLED',
  production_strategy text,
  content_classes text[] not null default '{}',
  ri_uses text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regulatory_sources_external_key_unique unique (external_key)
);

create index regulatory_sources_regulator_id_idx on public.regulatory_sources (regulator_id);

create table public.regulatory_publications (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.regulatory_sources (id) on delete restrict,
  regulator_id uuid not null references public.regulators (id) on delete restrict,
  external_document_id text,
  title text not null,
  publication_type text not null,
  summary text,
  canonical_url text not null,
  publication_date date,
  effective_date date,
  consultation_deadline date,
  retrieved_at timestamptz,
  source_hash text,
  source_version text,
  data_origin text not null default 'catalogue',
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index regulatory_publications_source_id_idx on public.regulatory_publications (source_id);
create index regulatory_publications_regulator_id_idx on public.regulatory_publications (regulator_id);
create index regulatory_publications_publication_date_idx on public.regulatory_publications (publication_date);

create trigger regulators_set_updated_at
before update on public.regulators
for each row execute function public.set_updated_at();

create trigger regulatory_sources_set_updated_at
before update on public.regulatory_sources
for each row execute function public.set_updated_at();

create trigger regulatory_publications_set_updated_at
before update on public.regulatory_publications
for each row execute function public.set_updated_at();
