-- Phase 7C.6A — AI-assisted lineage, materialisation idempotency, notifications

alter type public.notification_event_type add value if not exists 'AI_REVIEW_REQUIRED';
alter type public.notification_event_type add value if not exists 'AI_ANALYSIS_OUTDATED';
alter type public.notification_event_type add value if not exists 'AI_REVIEW_COMPLETED';
alter type public.notification_event_type add value if not exists 'AI_MATERIALISATION_COMPLETED';

alter table public.regulatory_changes
  add column if not exists origin text not null default 'MANUAL',
  add column if not exists publication_version_id uuid references public.regulatory_publication_versions (id) on delete restrict,
  add column if not exists ai_analysis_run_id uuid references public.ai_analysis_runs (id) on delete restrict,
  add column if not exists ai_analysis_review_id uuid references public.ai_analysis_reviews (id) on delete restrict,
  add column if not exists created_by_user_id text;

alter table public.regulatory_obligations
  add column if not exists origin text not null default 'MANUAL',
  add column if not exists publication_version_id uuid references public.regulatory_publication_versions (id) on delete restrict,
  add column if not exists ai_analysis_run_id uuid references public.ai_analysis_runs (id) on delete restrict,
  add column if not exists ai_analysis_review_id uuid references public.ai_analysis_reviews (id) on delete restrict,
  add column if not exists created_by_user_id text;

create table public.ai_claim_materialisations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  analysis_run_id uuid not null references public.ai_analysis_runs (id) on delete restrict,
  analysis_review_id uuid not null references public.ai_analysis_reviews (id) on delete restrict,
  claim_index integer not null,
  entity_type text not null check (entity_type in ('regulatory_change', 'regulatory_obligation')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  constraint ai_claim_materialisations_unique unique (analysis_review_id, claim_index, entity_type)
);

create index ai_claim_materialisations_run_idx on public.ai_claim_materialisations (analysis_run_id);
create index ai_claim_materialisations_entity_idx on public.ai_claim_materialisations (entity_type, entity_id);

alter table public.ai_claim_materialisations enable row level security;

create policy ai_claim_materialisations_select_member on public.ai_claim_materialisations for select
using (public.is_active_member(organisation_id));
create policy ai_claim_materialisations_insert_member on public.ai_claim_materialisations for insert
with check (public.is_active_member(organisation_id));
