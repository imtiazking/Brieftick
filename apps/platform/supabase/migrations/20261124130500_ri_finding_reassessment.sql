-- UC-RI-005 per-finding reassessment (append-only). Original ai_analysis_finding_decisions rows stay immutable.

create table if not exists public.ai_analysis_finding_reassessments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  analysis_run_id uuid not null references public.ai_analysis_runs (id) on delete restrict,
  finding_id uuid not null references public.ai_analysis_citations (id) on delete restrict,
  prior_decision_id uuid not null references public.ai_analysis_finding_decisions (id) on delete restrict,
  sequence_number integer not null check (sequence_number >= 1),
  decision text not null check (decision in ('ACCEPTED', 'REJECTED')),
  disposition text,
  regulatory_classification_code text,
  legal_status text,
  legal_basis text,
  verified_quotation text,
  quotation_page integer,
  quotation_verification_id uuid references public.ai_finding_quotation_verifications (id) on delete restrict,
  provision_reference text,
  provision_function text,
  triage_queue text,
  reviewer_comment text not null check (length(btrim(reviewer_comment)) > 0),
  reassessment_justification text not null check (length(btrim(reassessment_justification)) > 0),
  evidence_pathway text not null check (evidence_pathway in ('production_grounded', 'human_verified_uat')),
  stale_prior_verification boolean not null default true,
  reviewer_user_id text not null,
  created_at timestamptz not null default now(),
  constraint ai_analysis_finding_reassessments_one_sequence unique (analysis_run_id, finding_id, sequence_number)
);

create index if not exists ai_analysis_finding_reassessments_finding_idx
  on public.ai_analysis_finding_reassessments (analysis_run_id, finding_id, sequence_number desc);

comment on table public.ai_analysis_finding_reassessments is
  'Append-only regulatory reassessment for a single finding after the initial immutable review. Does not mutate ai_analysis_finding_decisions.';

alter table public.ai_analysis_finding_reassessments enable row level security;

create policy ai_analysis_finding_reassessments_select_member on public.ai_analysis_finding_reassessments
  for select using (public.is_active_member(organisation_id));

revoke insert, update, delete, truncate on public.ai_analysis_finding_reassessments from anon, authenticated;

create or replace function public.ri_reassess_ai_finding(
  p_organisation_id uuid,
  p_run_id uuid,
  p_finding_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_run public.ai_analysis_runs%rowtype;
  v_prior public.ai_analysis_finding_decisions%rowtype;
  v_obligation public.regulatory_obligations%rowtype;
  v_seq integer;
  v_row public.ai_analysis_finding_reassessments%rowtype;
  v_review_id uuid;
begin
  if v_actor is null or btrim(v_actor) = '' then
    raise exception 'ai_finding_review_requires_user' using errcode = '42501';
  end if;

  select * into v_run
    from public.ai_analysis_runs r
   where r.id = p_run_id and r.organisation_id = p_organisation_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_run.use_case_id::text <> 'UC-RI-005' then
    raise exception 'finding_review_use_case_unsupported' using errcode = '55000';
  end if;
  if v_run.execution_status::text <> 'COMPLETED' then
    raise exception 'analysis_not_completed' using errcode = '55000';
  end if;
  if v_run.freshness::text = 'OUTDATED' then
    raise exception 'analysis_outdated' using errcode = '55000';
  end if;
  if v_run.requested_by::text = v_actor then
    raise exception 'segregation_of_duties' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.ai_analysis_reviews ar
     where ar.analysis_run_id = p_run_id and ar.organisation_id = p_organisation_id
  ) then
    raise exception 'finding_reassessment_requires_prior_review' using errcode = '55000';
  end if;

  select * into v_prior
    from public.ai_analysis_finding_decisions d
   where d.analysis_run_id = p_run_id
     and d.finding_id = p_finding_id
     and d.organisation_id = p_organisation_id;
  if not found then
    raise exception 'finding_reassessment_no_prior_decision' using errcode = 'P0002';
  end if;

  if v_prior.obligation_id is not null then
    select * into v_obligation
      from public.regulatory_obligations o
     where o.id = v_prior.obligation_id and o.organisation_id = p_organisation_id;
    if found and v_obligation.status::text in ('OPEN', 'IN_PROGRESS', 'OVERDUE', 'COMPLETE', 'HISTORIC') then
      raise exception 'obligation_approval_locked' using errcode = '55000';
    end if;
  end if;

  if (p_payload ->> 'decision') is null or (p_payload ->> 'decision') not in ('ACCEPTED', 'REJECTED') then
    raise exception 'finding_decision_invalid' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_payload ->> 'reassessmentJustification', ''))) < 10 then
    raise exception 'finding_reassessment_justification_required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_payload ->> 'comment', ''))) < 1 then
    raise exception 'finding_reviewer_comment_required' using errcode = '22023';
  end if;

  select coalesce(max(r.sequence_number), 0) + 1 into v_seq
    from public.ai_analysis_finding_reassessments r
   where r.analysis_run_id = p_run_id and r.finding_id = p_finding_id;

  insert into public.ai_analysis_finding_reassessments (
    organisation_id, analysis_run_id, finding_id, prior_decision_id, sequence_number,
    decision, disposition, regulatory_classification_code, legal_status, legal_basis,
    verified_quotation, quotation_page, quotation_verification_id,
    provision_reference, provision_function, triage_queue,
    reviewer_comment, reassessment_justification, evidence_pathway,
    stale_prior_verification, reviewer_user_id
  ) values (
    p_organisation_id, p_run_id, p_finding_id, v_prior.id, v_seq,
    p_payload ->> 'decision',
    nullif(btrim(p_payload ->> 'disposition'), ''),
    nullif(btrim(p_payload ->> 'regulatoryClassificationCode'), ''),
    nullif(btrim(p_payload ->> 'legalStatus'), ''),
    nullif(btrim(p_payload ->> 'legalBasis'), ''),
    nullif(btrim(p_payload ->> 'quotation'), ''),
    nullif(p_payload ->> 'quotationPage', '')::integer,
    nullif(p_payload ->> 'quotationVerificationId', '')::uuid,
    nullif(btrim(p_payload ->> 'provisionReference'), ''),
    nullif(btrim(p_payload ->> 'provisionFunction'), ''),
    nullif(btrim(p_payload ->> 'triageQueue'), ''),
    btrim(p_payload ->> 'comment'),
    btrim(p_payload ->> 'reassessmentJustification'),
    coalesce(nullif(p_payload ->> 'evidencePathway', ''), v_prior.evidence_pathway),
    true,
    v_actor
  )
  returning * into v_row;

  select ar.id into v_review_id
    from public.ai_analysis_reviews ar
   where ar.analysis_run_id = p_run_id and ar.organisation_id = p_organisation_id
   order by ar.created_at desc
   limit 1;

  insert into public.workflow_events (
    organisation_id, entity_type, entity_id, event_type, actor_user_id, metadata
  ) values (
    p_organisation_id,
    'ai_analysis_finding',
    p_finding_id,
    'FINDING_REASSESSED',
    v_actor,
    jsonb_build_object(
      'analysisRunId', p_run_id,
      'analysisReviewId', v_review_id,
      'priorDecisionId', v_prior.id,
      'reassessmentId', v_row.id,
      'sequenceNumber', v_seq,
      'decision', v_row.decision,
      'disposition', v_row.disposition
    )
  );

  return jsonb_build_object(
    'ok', true,
    'reassessmentId', v_row.id,
    'sequenceNumber', v_seq,
    'findingId', p_finding_id
  );
end;
$$;

revoke all on function public.ri_reassess_ai_finding(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.ri_reassess_ai_finding(uuid, uuid, uuid, jsonb) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ri_reassess_ai_finding(uuid, uuid, uuid, jsonb) to service_role;
  end if;
end $$;