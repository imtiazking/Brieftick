-- Database-level enforcement for the publication-to-obligation pilot.
-- Mirrors lib/ri/ai/experimental-ai-tenant-guard.mjs and lib/ri/separation-of-duties.ts so that
-- direct PostgREST / SQL writes cannot bypass the server checks.
-- Insert-only triggers: existing rows (including historical runs in other organisations) are untouched.

create or replace function public.ri_ai_pilot_org_id()
returns uuid
language sql
immutable
as $$ select 'b8f5e3a1-00ad-4000-8000-000000000001'::uuid $$;

create or replace function public.ri_guard_ai_pilot_run_insert()
returns trigger
language plpgsql
as $$
begin
  if new.use_case_id::text in ('UC-RI-002', 'UC-RI-005')
     and new.organisation_id <> public.ri_ai_pilot_org_id() then
    raise exception 'experimental_ai_wrong_organisation:%', new.organisation_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_pilot_run_insert on public.ai_analysis_runs;
create trigger ri_guard_ai_pilot_run_insert
  before insert on public.ai_analysis_runs
  for each row execute function public.ri_guard_ai_pilot_run_insert();

create or replace function public.ri_guard_ai_assisted_record_insert()
returns trigger
language plpgsql
as $$
begin
  if new.origin::text = 'AI_ASSISTED'
     and new.organisation_id <> public.ri_ai_pilot_org_id() then
    raise exception 'experimental_ai_wrong_organisation:%', new.organisation_id
      using errcode = '42501';
  end if;
  if new.origin::text = 'AI_ASSISTED' and new.ai_analysis_review_id is null then
    raise exception 'ai_assisted_record_requires_review'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_assisted_obligation_insert on public.regulatory_obligations;
create trigger ri_guard_ai_assisted_obligation_insert
  before insert on public.regulatory_obligations
  for each row execute function public.ri_guard_ai_assisted_record_insert();

drop trigger if exists ri_guard_ai_assisted_change_insert on public.regulatory_changes;
create trigger ri_guard_ai_assisted_change_insert
  before insert on public.regulatory_changes
  for each row execute function public.ri_guard_ai_assisted_record_insert();

create or replace function public.ri_guard_ai_review_sod()
returns trigger
language plpgsql
as $$
declare
  v_requested_by text;
begin
  if new.decision::text in ('ACCEPTED', 'PARTIALLY_ACCEPTED') then
    select r.requested_by::text into v_requested_by
      from public.ai_analysis_runs r
     where r.id = new.analysis_run_id
       and r.organisation_id = new.organisation_id;
    if v_requested_by is null then
      raise exception 'ai_review_run_not_found' using errcode = '23503';
    end if;
    if v_requested_by = new.reviewer_user_id::text then
      raise exception 'segregation_of_duties' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_review_sod on public.ai_analysis_reviews;
create trigger ri_guard_ai_review_sod
  before insert on public.ai_analysis_reviews
  for each row execute function public.ri_guard_ai_review_sod();

-- AI-assisted obligations: DRAFT → IN_REVIEW → OPEN only, and the approver is neither the AI run requester
-- nor the reviewer who accepted the AI output (created_by_user_id). Manual obligations are untouched.
create or replace function public.ri_guard_ai_obligation_status()
returns trigger
language plpgsql
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_requested_by text;
begin
  if new.origin::text <> 'AI_ASSISTED' or new.status = old.status then
    return new;
  end if;
  if old.status::text = 'DRAFT' and new.status::text <> 'IN_REVIEW' then
    raise exception 'ai_obligation_invalid_transition' using errcode = '23514';
  end if;
  if old.status::text = 'IN_REVIEW' and new.status::text not in ('DRAFT', 'OPEN') then
    raise exception 'ai_obligation_invalid_transition' using errcode = '23514';
  end if;
  if old.status::text = 'IN_REVIEW' and new.status::text = 'OPEN' then
    if v_actor = '' then
      raise exception 'ai_obligation_approval_requires_user' using errcode = '42501';
    end if;
    select r.requested_by into v_requested_by
      from public.ai_analysis_runs r
     where r.id = new.ai_analysis_run_id;
    if v_actor = new.created_by_user_id::text or v_actor = v_requested_by then
      raise exception 'segregation_of_duties' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_obligation_status on public.regulatory_obligations;
create trigger ri_guard_ai_obligation_status
  before update of status on public.regulatory_obligations
  for each row execute function public.ri_guard_ai_obligation_status();
