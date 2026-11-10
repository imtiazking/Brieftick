-- FORGENIQ Ask RI V2 — semantic retrieval (DESIGN ONLY)
-- Phase 2B.1 — DO NOT APPLY without operator approval.
-- Catalogue regulatory evidence only; no tenant embeddings.

-- Requires: CREATE EXTENSION IF NOT EXISTS vector; (Supabase: enable in dashboard)

create table if not exists public.regulatory_evidence_chunks (
  id uuid primary key default gen_random_uuid(),

  publication_id uuid not null
    references public.regulatory_publications (id) on delete restrict,
  extraction_revision_id uuid not null
    references public.regulatory_source_extraction_revisions (id) on delete restrict,
  publication_version_id uuid
    references public.regulatory_publication_versions (id) on delete restrict,

  regulator text not null default 'FCA',
  publication_title text not null,
  publication_status text not null, -- consultation | finalised_guidance | policy_statement | superseded | unknown
  extraction_profile text not null, -- pdf_primary_v1 | html_article_v2

  chunk_index integer not null,
  chunk_text text not null,
  chunk_text_sha256 text not null,
  token_count_estimate integer,

  source_url text,
  canonical_url text,
  physical_page_number integer,
  html_section_id text,
  section_reference text,
  document_evidence_id text,

  content_hash text not null, -- aligns with revision raw/normalised SHA where applicable
  integrity_verified boolean not null default false,
  chunking_profile text not null default 'regulatory_semantic_v1',
  metadata jsonb not null default '{}'::jsonb,

  is_current_for_publication boolean not null default true,
  superseded_at timestamptz,

  embedding_model text,
  embedding_dimensions smallint,
  embedding vector(1536), -- placeholder dims; set at implementation from chosen model

  created_at timestamptz not null default now(),
  indexed_at timestamptz,

  constraint regulatory_evidence_chunks_text_sha_nonempty
    check (char_length(chunk_text_sha256) >= 32),
  constraint regulatory_evidence_chunks_unique_revision_index
    unique (extraction_revision_id, chunk_index, chunking_profile)
);

create index regulatory_evidence_chunks_publication_id_idx
  on public.regulatory_evidence_chunks (publication_id);

create index regulatory_evidence_chunks_revision_id_idx
  on public.regulatory_evidence_chunks (extraction_revision_id);

create index regulatory_evidence_chunks_current_idx
  on public.regulatory_evidence_chunks (publication_id, is_current_for_publication)
  where is_current_for_publication = true;

create index regulatory_evidence_chunks_status_idx
  on public.regulatory_evidence_chunks (publication_status);

-- pgvector ANN index (IVFFlat or HNSW — choose after volume baseline)
-- create index regulatory_evidence_chunks_embedding_ivfflat
--   on public.regulatory_evidence_chunks using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);

create table if not exists public.regulatory_evidence_chunk_index_runs (
  id uuid primary key default gen_random_uuid(),
  extraction_revision_id uuid not null
    references public.regulatory_source_extraction_revisions (id) on delete restrict,
  chunking_profile text not null,
  embedding_model text not null,
  chunk_count integer not null default 0,
  status text not null, -- pending | success | failed | superseded
  error_summary text,
  content_hash text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by text not null
);

comment on table public.regulatory_evidence_chunks is
  'Semantic-indexed catalogue evidence chunks. Public regulator text only — no tenant data.';

alter table public.regulatory_evidence_chunks enable row level security;

-- Read: authenticated users with catalogue access (mirror publication catalogue policies)
-- create policy regulatory_evidence_chunks_select_authenticated ...

-- Write: service role / ingestion workers only
-- create policy regulatory_evidence_chunks_insert_service_role ...

-- Example RPC (design sketch):
-- create or replace function public.search_regulatory_evidence_chunks(
--   query_embedding vector(1536),
--   match_count int default 12,
--   filter_regulator text default null,
--   filter_status text[] default null,
--   current_only boolean default true
-- ) returns table (...) language sql stable security definer as $$ ... $$;
