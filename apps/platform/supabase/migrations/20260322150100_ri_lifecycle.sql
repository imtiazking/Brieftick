-- FORGENIQ RI — organisation-scoped lifecycle + explicit relationship tables

create type public.applicability_recommendation as enum (
  'APPLICABLE',
  'POSSIBLY_APPLICABLE',
  'NOT_APPLICABLE',
  'UNASSESSED'
);

create type public.applicability_assessment_status as enum (
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SUPERSEDED'
);

create type public.organisation_publication_triage_status as enum (
  'NEW',
  'TRIAGED',
  'IN_REVIEW',
  'CLOSED'
);

create type public.regulatory_change_status as enum (
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'CLOSED',
  'CANCELLED'
);

create type public.impact_assessment_status as enum (
  'DRAFT',
  'IN_PROGRESS',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CLOSED'
);

create type public.obligation_status as enum (
  'DRAFT',
  'IN_REVIEW',
  'OPEN',
  'IN_PROGRESS',
  'OVERDUE',
  'COMPLETE',
  'HISTORIC',
  'CLOSED'
);

create table public.organisation_publications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  publication_id uuid not null references public.regulatory_publications (id) on delete restrict,
  triage_status public.organisation_publication_triage_status not null default 'NEW',
  materiality text,
  assigned_to text,
  reviewed_at timestamptz,
  review_status text,
  relevance_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_publications_org_pub_unique unique (organisation_id, publication_id)
);

create index organisation_publications_organisation_id_idx on public.organisation_publications (organisation_id);
create index organisation_publications_publication_id_idx on public.organisation_publications (publication_id);

create table public.applicability_assessments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  publication_id uuid not null references public.regulatory_publications (id) on delete restrict,
  legal_entity_reference text,
  recommendation public.applicability_recommendation not null default 'UNASSESSED',
  confidence numeric(5, 4),
  rationale text,
  affected_business_areas text[] not null default '{}',
  affected_products text[] not null default '{}',
  affected_jurisdictions text[] not null default '{}',
  affected_regulated_activities text[] not null default '{}',
  status public.applicability_assessment_status not null default 'DRAFT',
  reviewed_by text,
  reviewed_at timestamptz,
  override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applicability_assessments_organisation_id_idx on public.applicability_assessments (organisation_id);
create index applicability_assessments_publication_id_idx on public.applicability_assessments (publication_id);

create table public.regulatory_changes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  publication_id uuid not null references public.regulatory_publications (id) on delete restrict,
  external_key text,
  title text not null,
  description text,
  change_type text not null,
  materiality text,
  effective_date date,
  implementation_deadline date,
  owner_user_id text,
  status public.regulatory_change_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index regulatory_changes_organisation_id_idx on public.regulatory_changes (organisation_id);
create index regulatory_changes_publication_id_idx on public.regulatory_changes (publication_id);
create index regulatory_changes_status_idx on public.regulatory_changes (status);
create index regulatory_changes_effective_date_idx on public.regulatory_changes (effective_date);

create table public.impact_assessments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  regulatory_change_id uuid not null references public.regulatory_changes (id) on delete restrict,
  status public.impact_assessment_status not null default 'DRAFT',
  materiality text,
  business_impact text,
  operational_impact text,
  technology_impact text,
  compliance_impact text,
  financial_impact text,
  implementation_complexity text,
  owner_user_id text,
  reviewer_user_id text,
  approver_user_id text,
  due_date date,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index impact_assessments_organisation_id_idx on public.impact_assessments (organisation_id);
create index impact_assessments_regulatory_change_id_idx on public.impact_assessments (regulatory_change_id);
create index impact_assessments_status_idx on public.impact_assessments (status);
create index impact_assessments_due_date_idx on public.impact_assessments (due_date);

create table public.impact_assessment_business_areas (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  impact_assessment_id uuid not null references public.impact_assessments (id) on delete cascade,
  business_area text not null,
  created_at timestamptz not null default now(),
  constraint impact_ia_ba_unique unique (impact_assessment_id, business_area)
);

create table public.impact_assessment_systems (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  impact_assessment_id uuid not null references public.impact_assessments (id) on delete cascade,
  system_name text not null,
  created_at timestamptz not null default now(),
  constraint impact_ia_sys_unique unique (impact_assessment_id, system_name)
);

create table public.impact_assessment_products (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  impact_assessment_id uuid not null references public.impact_assessments (id) on delete cascade,
  product_name text not null,
  created_at timestamptz not null default now(),
  constraint impact_ia_prod_unique unique (impact_assessment_id, product_name)
);

create table public.impact_assessment_legal_entities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  impact_assessment_id uuid not null references public.impact_assessments (id) on delete cascade,
  legal_entity_reference text not null,
  created_at timestamptz not null default now(),
  constraint impact_ia_le_unique unique (impact_assessment_id, legal_entity_reference)
);

create table public.regulatory_obligations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  regulatory_change_id uuid references public.regulatory_changes (id) on delete restrict,
  publication_id uuid references public.regulatory_publications (id) on delete restrict,
  external_key text,
  obligation_statement text not null,
  citation text,
  source_section text,
  owner_user_id text,
  priority text,
  effective_date date,
  due_date date,
  status public.obligation_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint regulatory_obligations_change_or_pub check (
    regulatory_change_id is not null or publication_id is not null
  )
);

create index regulatory_obligations_organisation_id_idx on public.regulatory_obligations (organisation_id);
create index regulatory_obligations_regulatory_change_id_idx on public.regulatory_obligations (regulatory_change_id);
create index regulatory_obligations_publication_id_idx on public.regulatory_obligations (publication_id);
create index regulatory_obligations_status_idx on public.regulatory_obligations (status);
create index regulatory_obligations_due_date_idx on public.regulatory_obligations (due_date);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  external_key text,
  name text not null,
  description text,
  owner_user_id text,
  version text not null default '1.0',
  status text not null default 'DRAFT',
  last_reviewed_at timestamptz,
  next_review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index policies_organisation_id_idx on public.policies (organisation_id);

create table public.obligation_policy_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  obligation_id uuid not null references public.regulatory_obligations (id) on delete restrict,
  policy_id uuid not null references public.policies (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint obligation_policy_links_unique unique (obligation_id, policy_id)
);

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  external_key text,
  title text not null,
  description text,
  category text,
  owner_user_id text,
  inherent_risk text,
  residual_risk text,
  status text not null default 'OPEN',
  review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index risks_organisation_id_idx on public.risks (organisation_id);

create table public.obligation_risk_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  obligation_id uuid not null references public.regulatory_obligations (id) on delete restrict,
  risk_id uuid not null references public.risks (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint obligation_risk_links_unique unique (obligation_id, risk_id)
);

create table public.controls (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  external_key text,
  name text not null,
  description text,
  owner_user_id text,
  control_type text,
  frequency text,
  nature text,
  execution_type text,
  effectiveness text,
  testing_status text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index controls_organisation_id_idx on public.controls (organisation_id);

create table public.risk_control_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  risk_id uuid not null references public.risks (id) on delete restrict,
  control_id uuid not null references public.controls (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint risk_control_links_unique unique (risk_id, control_id)
);

create table public.obligation_control_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  obligation_id uuid not null references public.regulatory_obligations (id) on delete restrict,
  control_id uuid not null references public.controls (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint obligation_control_links_unique unique (obligation_id, control_id)
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  external_key text,
  title text not null,
  description text,
  source_type text not null,
  owner_user_id text,
  reviewer_user_id text,
  priority text,
  due_date date,
  status text not null default 'OPEN',
  escalation_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index actions_organisation_id_idx on public.actions (organisation_id);
create index actions_status_idx on public.actions (status);
create index actions_due_date_idx on public.actions (due_date);

create table public.action_impact_assessment_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  action_id uuid not null references public.actions (id) on delete cascade,
  impact_assessment_id uuid not null references public.impact_assessments (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint action_ia_links_unique unique (action_id, impact_assessment_id)
);

create table public.action_obligation_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  action_id uuid not null references public.actions (id) on delete cascade,
  obligation_id uuid not null references public.regulatory_obligations (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint action_obligation_links_unique unique (action_id, obligation_id)
);

create table public.action_control_gap_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  action_id uuid not null references public.actions (id) on delete cascade,
  control_id uuid not null references public.controls (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint action_control_gap_links_unique unique (action_id, control_id)
);

create table public.action_policy_gap_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  action_id uuid not null references public.actions (id) on delete cascade,
  policy_id uuid not null references public.policies (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint action_policy_gap_links_unique unique (action_id, policy_id)
);

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  external_key text,
  title text not null,
  evidence_type text not null,
  description text,
  storage_path text,
  source_url text,
  source_hash text,
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index evidence_items_organisation_id_idx on public.evidence_items (organisation_id);

create table public.evidence_action_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  evidence_id uuid not null references public.evidence_items (id) on delete cascade,
  action_id uuid not null references public.actions (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint evidence_action_links_unique unique (evidence_id, action_id)
);

create table public.evidence_control_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  evidence_id uuid not null references public.evidence_items (id) on delete cascade,
  control_id uuid not null references public.controls (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint evidence_control_links_unique unique (evidence_id, control_id)
);

create table public.evidence_obligation_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  evidence_id uuid not null references public.evidence_items (id) on delete cascade,
  obligation_id uuid not null references public.regulatory_obligations (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint evidence_obligation_links_unique unique (evidence_id, obligation_id)
);

create table public.assurance_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  review_type text not null,
  result text not null,
  reviewer_user_id text,
  review_date date not null,
  next_review_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assurance_reviews_organisation_id_idx on public.assurance_reviews (organisation_id);

create table public.assurance_review_control_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  assurance_review_id uuid not null references public.assurance_reviews (id) on delete cascade,
  control_id uuid not null references public.controls (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint assurance_review_control_unique unique (assurance_review_id, control_id)
);

create table public.assurance_review_obligation_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  assurance_review_id uuid not null references public.assurance_reviews (id) on delete cascade,
  obligation_id uuid not null references public.regulatory_obligations (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint assurance_review_obligation_unique unique (assurance_review_id, obligation_id)
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  external_key text,
  title text not null,
  description text,
  severity text not null,
  status text not null default 'OPEN',
  owner_user_id text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index findings_organisation_id_idx on public.findings (organisation_id);

create table public.finding_control_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  finding_id uuid not null references public.findings (id) on delete cascade,
  control_id uuid not null references public.controls (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint finding_control_links_unique unique (finding_id, control_id)
);

create table public.finding_action_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  finding_id uuid not null references public.findings (id) on delete cascade,
  action_id uuid not null references public.actions (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint finding_action_links_unique unique (finding_id, action_id)
);

create table public.finding_assurance_review_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  finding_id uuid not null references public.findings (id) on delete cascade,
  assurance_review_id uuid not null references public.assurance_reviews (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint finding_assurance_links_unique unique (finding_id, assurance_review_id)
);

create table public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index workflow_events_organisation_id_idx on public.workflow_events (organisation_id);
create index workflow_events_entity_idx on public.workflow_events (entity_type, entity_id);

-- updated_at triggers
create trigger organisation_publications_set_updated_at
before update on public.organisation_publications for each row execute function public.set_updated_at();
create trigger applicability_assessments_set_updated_at
before update on public.applicability_assessments for each row execute function public.set_updated_at();
create trigger regulatory_changes_set_updated_at
before update on public.regulatory_changes for each row execute function public.set_updated_at();
create trigger impact_assessments_set_updated_at
before update on public.impact_assessments for each row execute function public.set_updated_at();
create trigger regulatory_obligations_set_updated_at
before update on public.regulatory_obligations for each row execute function public.set_updated_at();
create trigger policies_set_updated_at
before update on public.policies for each row execute function public.set_updated_at();
create trigger risks_set_updated_at
before update on public.risks for each row execute function public.set_updated_at();
create trigger controls_set_updated_at
before update on public.controls for each row execute function public.set_updated_at();
create trigger actions_set_updated_at
before update on public.actions for each row execute function public.set_updated_at();
create trigger evidence_items_set_updated_at
before update on public.evidence_items for each row execute function public.set_updated_at();
create trigger assurance_reviews_set_updated_at
before update on public.assurance_reviews for each row execute function public.set_updated_at();
create trigger findings_set_updated_at
before update on public.findings for each row execute function public.set_updated_at();
