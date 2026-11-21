-- Restores the 20261121180000 activation function and removes draft withdrawal. Policies already withdrawn
-- stay WITHDRAWN with their audit events (history is append-only).

drop function if exists public.ri_withdraw_classification_policy(uuid, text);

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
  update public.regulatory_classification_policies
     set status = 'SUPERSEDED'
   where regulator_key = v_policy.regulator_key and status = 'ACTIVE';
  update public.regulatory_classification_policies
     set status = 'ACTIVE', approved_by_user_id = v_actor, approved_at = now()
   where id = p_policy_id;
end;
$$;
