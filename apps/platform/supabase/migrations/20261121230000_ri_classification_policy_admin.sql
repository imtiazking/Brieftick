-- Classification policy administration (RI-CLS-003): operators can withdraw a DRAFT with a recorded reason,
-- and a DRAFT can no longer be activated once a later version of the same regulator's policy has been
-- activated (activating it would silently roll the policy back). Propose/activate otherwise unchanged.

create or replace function public.ri_withdraw_classification_policy(p_policy_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_policy public.regulatory_classification_policies%rowtype;
begin
  if v_actor = '' or not public.is_platform_operator() then
    raise exception 'classification_policy_operator_required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'classification_policy_reason_required' using errcode = '22023';
  end if;
  select * into v_policy from public.regulatory_classification_policies p where p.id = p_policy_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_policy.status <> 'DRAFT' then
    raise exception 'classification_policy_transition_invalid' using errcode = '42501';
  end if;
  update public.regulatory_classification_policies set status = 'WITHDRAWN' where id = p_policy_id;
  insert into public.regulatory_classification_policy_events (policy_id, event_type, actor, detail)
  values (p_policy_id, 'POLICY_WITHDRAWAL_REASON', v_actor, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

create or replace function public.ri_activate_classification_policy(p_policy_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.current_clerk_user_id();
  v_policy public.regulatory_classification_policies%rowtype;
begin
  if v_actor = '' or not public.is_platform_operator() then
    raise exception 'classification_policy_operator_required' using errcode = '42501';
  end if;
  select * into v_policy from public.regulatory_classification_policies p where p.id = p_policy_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_policy.status <> 'DRAFT' then
    raise exception 'classification_policy_transition_invalid' using errcode = '42501';
  end if;
  if v_policy.created_by_user_id = v_actor then
    raise exception 'segregation_of_duties' using errcode = '42501';
  end if;
  if v_policy.effective_from > current_date then
    raise exception 'classification_policy_not_yet_effective' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.regulatory_classification_policies p
     where p.regulator_key = v_policy.regulator_key
       and p.status in ('ACTIVE', 'SUPERSEDED')
       and p.policy_version > v_policy.policy_version
  ) then
    raise exception 'classification_policy_draft_outdated' using errcode = '55000';
  end if;
  update public.regulatory_classification_policies
     set status = 'SUPERSEDED'
   where regulator_key = v_policy.regulator_key and status = 'ACTIVE';
  update public.regulatory_classification_policies
     set status = 'ACTIVE', approved_by_user_id = v_actor, approved_at = now()
   where id = p_policy_id;
end;
$$;

revoke all on function public.ri_withdraw_classification_policy(uuid, text) from public, anon;
grant execute on function public.ri_withdraw_classification_policy(uuid, text) to authenticated;
