-- Database-level enforcement for the publication-to-obligation pilot.
-- Mirrors lib/ri/ai/experimental-ai-tenant-guard.mjs and lib/ri/separation-of-duties.ts so that
-- direct PostgREST / SQL writes cannot bypass the server checks.
-- Existing rows (including historical runs in other organisations) are not validated or backfilled.
--
-- Actor identity comes from public.current_clerk_user_id() (the caller's Clerk JWT). An empty actor means a
-- service-role / server session: identity columns cannot be cross-checked, but approval (IN_REVIEW → OPEN)
-- and submission (DRAFT → IN_REVIEW) of AI-assisted obligations always require a user.
-- All functions pin search_path = '' and reference schema-qualified objects only.

alter table public.regulatory_obligations
  add column if not exists ai_submitted_by_user_id text;

comment on column public.regulatory_obligations.ai_submitted_by_user_id is
  'AI-assisted obligations: Clerk user who last moved DRAFT → IN_REVIEW. Set only by ri_guard_ai_obligation_status; not client-writable.';

create or replace function public.ri_ai_pilot_org_id()
returns uuid
language sql
immutable
set search_path = ''
as $$ select 'b8f5e3a1-00ad-4000-8000-000000000001'::uuid $$;

-- ai_analysis_runs: materialising use cases only in the pilot organisation, requested by the caller.
create or replace function public.ri_guard_ai_pilot_run_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
begin
  if new.use_case_id::text in ('UC-RI-002', 'UC-RI-005') then
    if new.organisation_id <> public.ri_ai_pilot_org_id() then
      raise exception 'experimental_ai_wrong_organisation:%', new.organisation_id
        using errcode = '42501';
    end if;
    if v_actor <> '' and new.requested_by::text is distinct from v_actor then
      raise exception 'ai_run_requester_mismatch' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_pilot_run_insert on public.ai_analysis_runs;
create trigger ri_guard_ai_pilot_run_insert
  before insert on public.ai_analysis_runs
  for each row execute function public.ri_guard_ai_pilot_run_insert();

create or replace function public.ri_guard_ai_pilot_run_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.use_case_id::text in ('UC-RI-002', 'UC-RI-005') or new.use_case_id::text in ('UC-RI-002', 'UC-RI-005'))
     and (new.requested_by is distinct from old.requested_by
          or new.organisation_id is distinct from old.organisation_id
          or new.use_case_id is distinct from old.use_case_id) then
    raise exception 'ai_run_provenance_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_pilot_run_update on public.ai_analysis_runs;
create trigger ri_guard_ai_pilot_run_update
  before update on public.ai_analysis_runs
  for each row execute function public.ri_guard_ai_pilot_run_update();

-- ai_analysis_reviews: the reviewer is the caller, cannot accept their own run, and decisions are immutable.
create or replace function public.ri_guard_ai_review_sod()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_requested_by text;
  v_use_case text;
begin
  select r.requested_by::text, r.use_case_id::text into v_requested_by, v_use_case
    from public.ai_analysis_runs r
   where r.id = new.analysis_run_id
     and r.organisation_id = new.organisation_id;
  if new.decision::text in ('ACCEPTED', 'PARTIALLY_ACCEPTED') and v_requested_by is null then
    raise exception 'ai_review_run_not_found' using errcode = '23503';
  end if;
  if v_use_case in ('UC-RI-002', 'UC-RI-005') and v_actor <> ''
     and new.reviewer_user_id::text is distinct from v_actor then
    raise exception 'ai_review_reviewer_mismatch' using errcode = '42501';
  end if;
  if new.decision::text in ('ACCEPTED', 'PARTIALLY_ACCEPTED') and v_requested_by = new.reviewer_user_id::text then
    raise exception 'segregation_of_duties' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_review_sod on public.ai_analysis_reviews;
create trigger ri_guard_ai_review_sod
  before insert on public.ai_analysis_reviews
  for each row execute function public.ri_guard_ai_review_sod();

create or replace function public.ri_guard_ai_review_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organisation_id is distinct from old.organisation_id
     or new.analysis_run_id is distinct from old.analysis_run_id
     or new.decision is distinct from old.decision
     or new.reviewer_user_id is distinct from old.reviewer_user_id then
    raise exception 'ai_review_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_review_immutable on public.ai_analysis_reviews;
create trigger ri_guard_ai_review_immutable
  before update on public.ai_analysis_reviews
  for each row execute function public.ri_guard_ai_review_immutable();

-- AI-assisted changes and obligations: pilot organisation, backed by an accepted review of the same run,
-- created by the caller, and AI obligations start as DRAFT.
create or replace function public.ri_guard_ai_assisted_record_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_review_run uuid;
  v_decision text;
begin
  if new.origin::text is distinct from 'AI_ASSISTED' then
    return new;
  end if;
  if new.organisation_id <> public.ri_ai_pilot_org_id() then
    raise exception 'experimental_ai_wrong_organisation:%', new.organisation_id
      using errcode = '42501';
  end if;
  if new.ai_analysis_review_id is null then
    raise exception 'ai_assisted_record_requires_review'
      using errcode = '23514';
  end if;
  select v.analysis_run_id, v.decision::text into v_review_run, v_decision
    from public.ai_analysis_reviews v
   where v.id = new.ai_analysis_review_id
     and v.organisation_id = new.organisation_id;
  if v_decision is null then
    raise exception 'ai_assisted_record_review_not_found' using errcode = '23503';
  end if;
  if v_decision not in ('ACCEPTED', 'PARTIALLY_ACCEPTED') then
    raise exception 'ai_assisted_record_review_not_accepted' using errcode = '23514';
  end if;
  if new.ai_analysis_run_id is not null and new.ai_analysis_run_id <> v_review_run then
    raise exception 'ai_assisted_record_run_mismatch' using errcode = '23514';
  end if;
  if v_actor <> '' and new.created_by_user_id::text is distinct from v_actor then
    raise exception 'ai_assisted_record_creator_mismatch' using errcode = '42501';
  end if;
  if tg_table_name = 'regulatory_obligations' and new.status::text <> 'DRAFT' then
    raise exception 'ai_obligation_must_start_draft' using errcode = '23514';
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

-- Provenance of AI-assisted rows cannot be rewritten (e.g. relabelled MANUAL to skip the approval workflow).
create or replace function public.ri_guard_ai_assisted_record_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.origin::text is distinct from 'AI_ASSISTED' and new.origin::text is distinct from 'AI_ASSISTED' then
    return new;
  end if;
  if new.origin is distinct from old.origin
     or new.organisation_id is distinct from old.organisation_id
     or new.ai_analysis_run_id is distinct from old.ai_analysis_run_id
     or new.ai_analysis_review_id is distinct from old.ai_analysis_review_id
     or new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'ai_assisted_provenance_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_assisted_obligation_update on public.regulatory_obligations;
create trigger ri_guard_ai_assisted_obligation_update
  before update on public.regulatory_obligations
  for each row execute function public.ri_guard_ai_assisted_record_update();

drop trigger if exists ri_guard_ai_assisted_change_update on public.regulatory_changes;
create trigger ri_guard_ai_assisted_change_update
  before update on public.regulatory_changes
  for each row execute function public.ri_guard_ai_assisted_record_update();

-- AI-assisted obligations: DRAFT → IN_REVIEW → OPEN only. Submission records the submitter on the row;
-- the approver must be an active non-VIEWER member who is not the AI run requester, the acceptor
-- (created_by_user_id) or the submitter. Manual obligations are untouched.
create or replace function public.ri_guard_ai_obligation_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_requested_by text;
begin
  if old.origin::text is distinct from 'AI_ASSISTED' then
    return new;
  end if;
  new.ai_submitted_by_user_id := old.ai_submitted_by_user_id;
  if new.status = old.status then
    return new;
  end if;

  if old.status::text = 'DRAFT' then
    if new.status::text <> 'IN_REVIEW' then
      raise exception 'ai_obligation_invalid_transition' using errcode = '23514';
    end if;
    if v_actor = '' then
      raise exception 'ai_obligation_submission_requires_user' using errcode = '42501';
    end if;
    new.ai_submitted_by_user_id := v_actor;
    return new;
  end if;

  if old.status::text = 'IN_REVIEW' then
    if new.status::text not in ('DRAFT', 'OPEN') then
      raise exception 'ai_obligation_invalid_transition' using errcode = '23514';
    end if;
    if new.status::text = 'OPEN' then
      if v_actor = '' then
        raise exception 'ai_obligation_approval_requires_user' using errcode = '42501';
      end if;
      select r.requested_by::text into v_requested_by
        from public.ai_analysis_runs r
       where r.id = new.ai_analysis_run_id
         and r.organisation_id = new.organisation_id;
      if v_requested_by is null then
        raise exception 'ai_obligation_run_not_found' using errcode = '23503';
      end if;
      if old.ai_submitted_by_user_id is null then
        raise exception 'ai_obligation_submitter_unknown' using errcode = '23514';
      end if;
      if v_actor = any (array[new.created_by_user_id::text, v_requested_by, old.ai_submitted_by_user_id]) then
        raise exception 'segregation_of_duties' using errcode = '42501';
      end if;
      if not exists (
        select 1
          from public.organisation_memberships m
         where m.organisation_id = new.organisation_id
           and m.clerk_user_id = v_actor
           and m.status::text = 'active'
           and m.role::text <> 'VIEWER'
      ) then
        raise exception 'ai_obligation_review_role_required' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ri_guard_ai_obligation_status on public.regulatory_obligations;
create trigger ri_guard_ai_obligation_status
  before update on public.regulatory_obligations
  for each row execute function public.ri_guard_ai_obligation_status();
