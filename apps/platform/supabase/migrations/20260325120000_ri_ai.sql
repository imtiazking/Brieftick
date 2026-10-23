-- FORGENIQ RI — organisation-scoped AI analysis (human-in-the-loop)

create type public.ai_execution_status as enum (
  'REQUESTED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'VALIDATION_FAILED'
);

create type public.ai_review_status as enum (
  'AI_DRAFT',
  'HUMAN_REVIEW_REQUIRED',
  'PARTIALLY_ACCEPTED',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED'
);

create type public.ai_freshness_status as enum (
  'CURRENT',
  'OUTDATED'
);

create type public.ai_citation_status as enum (
  'VERIFIED',
  'PARTIAL',
  'UNVERIFIED',
  'INVALID'
);

create table public.ai_use_cases (
  id text primary key,
  name text not null,
  description text,
  risk_classification text,
  human_oversight_required boolean not null default true,
  source_grounding_required boolean not null default true,
  status text not null default 'Active',
  analysis_types text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  use_case_id text not null references public.ai_use_cases (id),
  publication_id uuid not null references public.regulatory_publications (id) on delete restrict,
  publication_version_id uuid not null references public.regulatory_publication_versions (id) on delete restrict,
  target_entity_type text,
  target_entity_id text,
  execution_status public.ai_execution_status not null default 'REQUESTED',
  review_status public.ai_review_status not null default 'AI_DRAFT',
  freshness public.ai_freshness_status not null default 'CURRENT',
  provider text not null,
  model text,
  prompt_version text not null,
  processing_eligibility text not null default 'REVIEW_REQUIRED',
  structured_output jsonb,
  error_code text,
  error_message text,
  latency_ms integer,
  requested_by text not null,
  correlation_id text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_analysis_runs_idempotency unique (organisation_id, idempotency_key)
);

create index ai_analysis_runs_org_idx on public.ai_analysis_runs (organisation_id);
create index ai_analysis_runs_pub_idx on public.ai_analysis_runs (publication_id, publication_version_id);

create table public.ai_analysis_citations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  analysis_run_id uuid not null references public.ai_analysis_runs (id) on delete cascade,
  claim_index integer not null,
  claim_text text not null,
  source_section_ids text[] not null default '{}',
  citation_status public.ai_citation_status not null default 'UNVERIFIED',
  grounding_status text,
  created_at timestamptz not null default now()
);

create index ai_analysis_citations_run_idx on public.ai_analysis_citations (analysis_run_id);

create table public.ai_analysis_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  analysis_run_id uuid not null references public.ai_analysis_runs (id) on delete cascade,
  decision public.ai_review_status not null,
  reviewer_user_id text not null,
  accepted_claim_indexes integer[] not null default '{}',
  rejected_claim_indexes integer[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create index ai_analysis_reviews_run_idx on public.ai_analysis_reviews (analysis_run_id);

alter table public.ai_use_cases enable row level security;
alter table public.ai_analysis_runs enable row level security;
alter table public.ai_analysis_citations enable row level security;
alter table public.ai_analysis_reviews enable row level security;

create policy ai_use_cases_select_authenticated
on public.ai_use_cases for select
using (public.current_clerk_user_id() <> '');

create policy ai_analysis_runs_select_member on public.ai_analysis_runs for select
using (public.is_active_member(organisation_id));
create policy ai_analysis_runs_insert_member on public.ai_analysis_runs for insert
with check (public.is_active_member(organisation_id));
create policy ai_analysis_runs_update_member on public.ai_analysis_runs for update
using (public.is_active_member(organisation_id)) with check (public.is_active_member(organisation_id));
create policy ai_analysis_runs_delete_member on public.ai_analysis_runs for delete
using (public.is_active_member(organisation_id));

create policy ai_analysis_citations_select_member on public.ai_analysis_citations for select
using (public.is_active_member(organisation_id));
create policy ai_analysis_citations_insert_member on public.ai_analysis_citations for insert
with check (public.is_active_member(organisation_id));
create policy ai_analysis_citations_update_member on public.ai_analysis_citations for update
using (public.is_active_member(organisation_id)) with check (public.is_active_member(organisation_id));
create policy ai_analysis_citations_delete_member on public.ai_analysis_citations for delete
using (public.is_active_member(organisation_id));

create policy ai_analysis_reviews_select_member on public.ai_analysis_reviews for select
using (public.is_active_member(organisation_id));
create policy ai_analysis_reviews_insert_member on public.ai_analysis_reviews for insert
with check (public.is_active_member(organisation_id));
create policy ai_analysis_reviews_update_member on public.ai_analysis_reviews for update
using (public.is_active_member(organisation_id)) with check (public.is_active_member(organisation_id));
create policy ai_analysis_reviews_delete_member on public.ai_analysis_reviews for delete
using (public.is_active_member(organisation_id));

insert into public.ai_use_cases (id, name, description, risk_classification, analysis_types) values
  ('UC-RI-001', 'Regulatory Publication Classification', 'Classify incoming publications for triage.', 'Moderate', array['Publication Classification']),
  ('UC-RI-002', 'Regulatory Change Extraction', 'Extract candidate changes from source sections.', 'High Governance Sensitivity', array['Regulatory Change Extraction']),
  ('UC-RI-003', 'Applicability Recommendation', 'Recommend applicability for regulatory changes.', 'High Governance Sensitivity', array['Applicability Recommendation']),
  ('UC-RI-004', 'Impact Suggestion', 'Suggest impact dimensions for assessments.', 'Moderate', array['Impact Suggestion']),
  ('UC-RI-005', 'Candidate Obligation Extraction', 'Extract candidate obligations with citations.', 'High Governance Sensitivity', array['Obligation Extraction'])
on conflict (id) do nothing;
