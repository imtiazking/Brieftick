-- Stages 3–5: impact↔risk links and idempotent AI draft keys.

create table if not exists public.impact_assessment_risk_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  impact_assessment_id uuid not null references public.impact_assessments (id) on delete cascade,
  risk_id uuid not null references public.risks (id) on delete cascade,
  link_kind text not null default 'AI_MAPPED',
  created_at timestamptz not null default now(),
  constraint impact_assessment_risk_links_unique unique (impact_assessment_id, risk_id)
);

create index if not exists impact_assessment_risk_links_org_idx
  on public.impact_assessment_risk_links (organisation_id);

create unique index if not exists risks_source_impact_assessment_unique_idx
  on public.risks (organisation_id, (metadata->>'sourceImpactAssessmentId'))
  where (metadata->>'sourceImpactAssessmentId') is not null
    and coalesce(metadata->>'stage3PrimaryDraft', 'false') = 'true';

create unique index if not exists controls_source_risk_mapping_unique_idx
  on public.controls (organisation_id, (metadata->>'sourceApprovedRiskId'))
  where (metadata->>'sourceApprovedRiskId') is not null
    and coalesce(metadata->>'stage4PrimaryDraft', 'false') = 'true';

create unique index if not exists assurance_reviews_source_control_unique_idx
  on public.assurance_reviews (organisation_id, (metadata->>'sourceApprovedControlId'))
  where (metadata->>'sourceApprovedControlId') is not null
    and coalesce(metadata->>'stage5PrimaryPlan', 'false') = 'true';

comment on table public.impact_assessment_risk_links is
  'Links approved impact assessments to AI-mapped or human-validated risks (Stage 3).';