-- Atomic obligation approval (any status -> OPEN, normally IN_REVIEW) together with its Stage 2 impact assessment.
--
-- Root cause being closed: approval used to be "write OPEN, then try to create the impact, then compensate on a
-- thrown error". A crash, timeout or failed compensation between the two writes left an OPEN obligation with no
-- impact assessment (observed in hosted UAT as an HTTP 500 that left the obligation OPEN), and the "skipped"
-- results (AI unavailable, no change) never triggered any compensation at all.
--
-- Now the application computes the Stage 2 draft FIRST (no writes, obligation still IN_REVIEW) and this function
-- commits the status change, the impact, its business areas and every audit event in ONE transaction:
--   * any failure rolls the whole approval back, so a failed request never leaves a partial state;
--   * the obligation row is locked FOR UPDATE, so concurrent approvals serialise and the loser gets stale_record;
--   * the unique index on impact_assessments (organisation, sourceRegulatoryObligationId) makes it idempotent;
--   * it authorises as the CALLER (Clerk JWT) and the existing ri_guard_role_scoped_update trigger still fires,
--     so this function cannot be used to approve something the caller could not already approve.
-- It is SECURITY DEFINER only so a REVIEWER (who may approve but not insert impacts under RLS) can complete the
-- approval; it never trusts a caller-supplied organisation, change, status or actor.

create or replace function public.approve_obligation_with_stage2(
  p_organisation_id uuid,
  p_obligation_id uuid,
  p_expected_status text,
  p_actor_user_id text,
  p_impact jsonb default null,
  p_skip_reason text default null,
  p_impact_event_metadata jsonb default '{}'::jsonb,
  p_ai_provider text default null,
  p_fields jsonb default '{}'::jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt_actor text := public.current_clerk_user_id();
  v_ob record;
  v_f public.regulatory_obligations;
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
  v_rec public.impact_assessments;
  v_impact_id uuid;
  v_reused boolean := false;
  v_changed boolean := false;
  v_meta jsonb;
begin
  if p_expected_status is null
     or not (p_expected_status = any (enum_range(null::public.obligation_status)::text[])) then
    raise exception 'invalid_expected_status';
  end if;

  -- 1. Authenticate the caller. A user JWT must match the stated actor and hold at least REVIEWER in the
  --    organisation. Without a JWT only the service role / database owner may call (server-side recovery).
  if v_jwt_actor <> '' then
    if v_jwt_actor <> p_actor_user_id then
      raise exception 'actor_mismatch' using errcode = '42501';
    end if;
    if not public.ri_has_min_role(p_organisation_id, 'REVIEWER'::public.platform_role) then
      raise exception 'insufficient_role' using errcode = '42501';
    end if;
  elsif not (
          coalesce(current_setting('role', true), '') = 'service_role'
          or (coalesce(nullif(current_setting('role', true), ''), 'none') = 'none'
              and session_user in ('postgres', 'supabase_admin'))
        ) then
    -- The EFFECTIVE role is checked (SET ROLE changes it, session_user does not), so an anon / authenticated /
    -- application session with no verified identity is refused here rather than relying on a later trigger.
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  -- 2. Lock the obligation (tenant-scoped) so concurrent approvals serialise.
  select o.id, o.status::text as status, o.regulatory_change_id, o.owner_user_id, o.updated_at
    into v_ob
    from public.regulatory_obligations o
   where o.id = p_obligation_id
     and o.organisation_id = p_organisation_id
     for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_ob.status <> p_expected_status then
    raise exception 'stale_record';
  end if;
  -- Optimistic concurrency is re-checked UNDER the row lock (the application's earlier read is not enough).
  if p_expected_updated_at is not null and v_ob.updated_at <> p_expected_updated_at then
    raise exception 'stale_record';
  end if;

  -- 3. Status change and any accompanying field edits, in this same transaction. Only whitelisted columns are
  --    applied. The role guard trigger still fires and rejects an unauthorised approval before any other write.
  if p_expected_status <> 'OPEN' or v_fields <> '{}'::jsonb then
    v_f := jsonb_populate_record(null::public.regulatory_obligations, v_fields);
    update public.regulatory_obligations o
       set status = 'OPEN'::public.obligation_status,
           obligation_statement = case when v_fields ? 'obligation_statement' then v_f.obligation_statement else o.obligation_statement end,
           citation = case when v_fields ? 'citation' then v_f.citation else o.citation end,
           source_section = case when v_fields ? 'source_section' then v_f.source_section else o.source_section end,
           priority = case when v_fields ? 'priority' then v_f.priority else o.priority end,
           effective_date = case when v_fields ? 'effective_date' then v_f.effective_date else o.effective_date end,
           due_date = case when v_fields ? 'due_date' then v_f.due_date else o.due_date end,
           owner_user_id = case when v_fields ? 'owner_user_id' then v_f.owner_user_id else o.owner_user_id end
     where o.id = p_obligation_id
       and o.organisation_id = p_organisation_id
       and o.status = p_expected_status::public.obligation_status;
  end if;

  if p_expected_status <> 'OPEN' then
    v_changed := true;
    insert into public.workflow_events
      (organisation_id, entity_type, entity_id, event_type, from_status, to_status, actor_user_id, metadata, occurred_at)
    values
      (p_organisation_id, 'regulatory_obligation', p_obligation_id, 'OBLIGATION_STATUS_CHANGED',
       p_expected_status, 'OPEN', p_actor_user_id, '{}'::jsonb, clock_timestamp());
  end if;

  -- 4. Stage 2 impact (idempotent) or an explicit, durable record of why it does not apply.
  if p_impact is not null then
    if v_ob.regulatory_change_id is null then
      raise exception 'missing_regulatory_change';
    end if;

    select a.id
      into v_impact_id
      from public.impact_assessments a
     where a.organisation_id = p_organisation_id
       and a.metadata ->> 'sourceRegulatoryObligationId' = p_obligation_id::text
     limit 1;

    if v_impact_id is not null then
      v_reused := true;
    elsif p_impact ? 'reuseOnly' then
      -- The caller decided the impact already exists; if it does not, never invent an empty one.
      raise exception 'stage2_impact_missing';
    else
      v_rec := jsonb_populate_record(null::public.impact_assessments, p_impact);
      v_meta := coalesce(v_rec.metadata, '{}'::jsonb)
        || jsonb_build_object('sourceRegulatoryObligationId', p_obligation_id::text);
      begin
        insert into public.impact_assessments (
          organisation_id, regulatory_change_id, status, owner_user_id,
          business_impact, operational_impact, technology_impact, compliance_impact, financial_impact,
          implementation_complexity, materiality, metadata
        ) values (
          p_organisation_id, v_ob.regulatory_change_id, 'DRAFT'::public.impact_assessment_status,
          coalesce(v_rec.owner_user_id, v_ob.owner_user_id, p_actor_user_id),
          v_rec.business_impact, v_rec.operational_impact, v_rec.technology_impact, v_rec.compliance_impact,
          v_rec.financial_impact, v_rec.implementation_complexity, v_rec.materiality, v_meta
        )
        returning id into v_impact_id;
      exception when unique_violation then
        select a.id
          into v_impact_id
          from public.impact_assessments a
         where a.organisation_id = p_organisation_id
           and a.metadata ->> 'sourceRegulatoryObligationId' = p_obligation_id::text
         limit 1;
        v_reused := true;
      end;

      if not v_reused then
        insert into public.impact_assessment_business_areas (organisation_id, impact_assessment_id, business_area)
        select p_organisation_id, v_impact_id, area.value
          from jsonb_array_elements_text(coalesce(p_impact -> 'business_areas', '[]'::jsonb)) as area(value)
         where trim(area.value) <> ''
        on conflict do nothing;

        insert into public.workflow_events
          (organisation_id, entity_type, entity_id, event_type, from_status, to_status, actor_user_id, metadata, occurred_at)
        values
          (p_organisation_id, 'impact_assessment', v_impact_id, 'IMPACT_CREATED', null, 'DRAFT', p_actor_user_id,
           coalesce(p_impact_event_metadata, '{}'::jsonb)
             || jsonb_build_object('sourceRegulatoryObligationId', p_obligation_id::text, 'stage2', true),
           clock_timestamp());

        insert into public.workflow_events
          (organisation_id, entity_type, entity_id, event_type, from_status, to_status, actor_user_id, metadata, occurred_at)
        values
          (p_organisation_id, 'regulatory_obligation', p_obligation_id, 'IMPACT_INITIATED_FROM_OBLIGATION', null, 'OPEN',
           p_actor_user_id,
           jsonb_build_object(
             'impactAssessmentId', v_impact_id,
             'regulatoryChangeId', v_ob.regulatory_change_id,
             'aiProvider', p_ai_provider,
             'aiUseCaseId', 'UC-RI-004'
           ),
           clock_timestamp());
      end if;
    end if;
  else
    insert into public.workflow_events
      (organisation_id, entity_type, entity_id, event_type, from_status, to_status, actor_user_id, metadata, occurred_at)
    values
      (p_organisation_id, 'regulatory_obligation', p_obligation_id, 'OBLIGATION_STAGE2_INITIATION_SKIPPED', null, 'OPEN',
       p_actor_user_id,
       jsonb_build_object('reason', left(coalesce(p_skip_reason, 'unspecified'), 200)),
       clock_timestamp());
  end if;

  return jsonb_build_object(
    'ok', true,
    'statusChanged', v_changed,
    'impactAssessmentId', v_impact_id,
    'reused', v_reused,
    'skipped', p_impact is null,
    'skipReason', case when p_impact is null then left(coalesce(p_skip_reason, 'unspecified'), 200) else null end
  );
end;
$$;

comment on function public.approve_obligation_with_stage2(uuid, uuid, text, text, jsonb, text, jsonb, text, jsonb, timestamptz) is
  'Atomic approval into OPEN with its Stage 2 impact assessment and audit events in one transaction. Authorises as the caller; idempotent; concurrent approvals serialise on the obligation row.';

-- Grants: never PUBLIC or anon. authenticated may call it because the function authorises as the caller.
-- service_role is granted only where that Supabase role exists (it does not in the local embedded harness).
do $$
declare
  f constant text := 'public.approve_obligation_with_stage2(uuid, uuid, text, text, jsonb, text, jsonb, text, jsonb, timestamptz)';
begin
  execute format('revoke all on function %s from public', f);
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute format('revoke all on function %s from anon', f);
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute format('grant execute on function %s to authenticated', f);
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute format('grant execute on function %s to service_role', f);
  end if;
end $$;

-- Integrity view: an OPEN obligation must be LINKED to its impact assessment, or carry an explicit recorded skip.
-- Anything else is DISCONNECTED and must be repaired; the view makes the condition visible instead of silent.
create or replace view public.obligation_stage2_integrity
with (security_invoker = true) as
select
  o.organisation_id,
  o.id as obligation_id,
  o.external_key,
  o.regulatory_change_id,
  case
    when exists (
      select 1 from public.impact_assessments a
       where a.organisation_id = o.organisation_id
         and a.metadata ->> 'sourceRegulatoryObligationId' = o.id::text
    ) then 'LINKED'
    when o.regulatory_change_id is null then 'NO_CHANGE_RECORDED'
    when exists (
      select 1 from public.workflow_events w
       where w.organisation_id = o.organisation_id
         and w.entity_type = 'regulatory_obligation'
         and w.entity_id = o.id
         and w.event_type = 'OBLIGATION_STAGE2_INITIATION_SKIPPED'
    ) then 'RECORDED_SKIP'
    else 'DISCONNECTED'
  end as stage2_state
from public.regulatory_obligations o
where o.status = 'OPEN'::public.obligation_status;

comment on view public.obligation_stage2_integrity is
  'OPEN obligations and their Stage 2 linkage: LINKED, RECORDED_SKIP, NO_CHANGE_RECORDED or DISCONNECTED (defect).';

revoke all on public.obligation_stage2_integrity from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.obligation_stage2_integrity from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.obligation_stage2_integrity to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.obligation_stage2_integrity to service_role;
  end if;
end $$;
