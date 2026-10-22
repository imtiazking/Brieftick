-- FORGENIQ RI — regulatory ingestion operations (global, not tenant-scoped)

create type public.ingestion_run_status as enum (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'PARTIAL'
);

create type public.ingestion_run_type as enum (
  'MANUAL',
  'TEST'
);

create type public.source_ingestion_mode as enum (
  'DISABLED',
  'TEST_ONLY',
  'ENABLED'
);

create type public.ingestion_item_retrieval_status as enum (
  'PENDING',
  'RETRIEVED',
  'FAILED',
  'SKIPPED'
);

create type public.ingestion_item_normalisation_status as enum (
  'PENDING',
  'NEW',
  'UPDATED',
  'UNCHANGED',
  'INELIGIBLE',
  'FAILED'
);

alter table public.regulatory_sources
  add column if not exists ingestion_mode public.source_ingestion_mode not null default 'DISABLED';

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.regulatory_sources (id) on delete restrict,
  run_type public.ingestion_run_type not null default 'MANUAL',
  status public.ingestion_run_status not null default 'PENDING',
  started_at timestamptz,
  completed_at timestamptz,
  records_discovered int not null default 0,
  records_new int not null default 0,
  records_updated int not null default 0,
  records_unchanged int not null default 0,
  records_failed int not null default 0,
  error_summary text,
  initiated_by text,
  environment text not null default 'local',
  created_at timestamptz not null default now()
);

create index ingestion_runs_source_id_idx on public.ingestion_runs (source_id);
create index ingestion_runs_created_at_idx on public.ingestion_runs (created_at desc);

create table public.ingestion_items (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid not null references public.ingestion_runs (id) on delete cascade,
  source_id uuid not null references public.regulatory_sources (id) on delete restrict,
  external_document_id text,
  canonical_url text,
  title text,
  publication_date date,
  content_type text,
  source_hash text,
  retrieval_status public.ingestion_item_retrieval_status not null default 'PENDING',
  normalisation_status public.ingestion_item_normalisation_status not null default 'PENDING',
  publication_id uuid references public.regulatory_publications (id) on delete set null,
  error_detail text,
  retrieved_at timestamptz,
  created_at timestamptz not null default now()
);

create index ingestion_items_run_id_idx on public.ingestion_items (ingestion_run_id);
create index ingestion_items_publication_id_idx on public.ingestion_items (publication_id);

create table public.regulatory_publication_versions (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.regulatory_publications (id) on delete restrict,
  version_number int not null,
  source_hash text not null,
  canonical_url text not null,
  retrieved_at timestamptz not null,
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint regulatory_publication_versions_unique unique (publication_id, version_number)
);

create index regulatory_publication_versions_publication_id_idx
  on public.regulatory_publication_versions (publication_id);

create unique index regulatory_publications_source_external_doc_unique
  on public.regulatory_publications (source_id, external_document_id)
  where external_document_id is not null and external_document_id <> '';

create unique index regulatory_publications_source_canonical_url_unique
  on public.regulatory_publications (source_id, canonical_url);

alter table public.ingestion_runs enable row level security;
alter table public.ingestion_items enable row level security;
alter table public.regulatory_publication_versions enable row level security;

create policy ingestion_runs_select_authenticated
on public.ingestion_runs for select
using (public.current_clerk_user_id() <> '');

create policy ingestion_items_select_authenticated
on public.ingestion_items for select
using (public.current_clerk_user_id() <> '');

create policy regulatory_publication_versions_select_authenticated
on public.regulatory_publication_versions for select
using (public.current_clerk_user_id() <> '');
