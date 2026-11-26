-- Operator recovery for a reservation left RESERVED by a terminated process.
-- This does not run on a timer and does not retry the provider call.

create table if not exists public.lab_ai_spend_recoveries (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.lab_ai_spend_reservations (id),
  scope_key text not null,
  actor text not null,
  reason text not null,
  released_reserve_usd numeric(12, 6) not null,
  settled_actual_usd numeric(12, 6) not null,
  usage_observed boolean not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

alter table public.lab_ai_spend_recoveries enable row level security;
alter table public.lab_ai_spend_recoveries force row level security;
revoke all on table public.lab_ai_spend_recoveries from public;

create or replace function public.release_abandoned_lab_ai_reservation(
  p_reservation_id uuid,
  p_actor text,
  p_reason text,
  p_min_age_seconds integer,
  p_actual_usd numeric default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lab_ai_spend_reservations%rowtype;
  v_actual numeric(12, 6);
  v_observed boolean;
  v_account public.lab_ai_spend_accounts%rowtype;
  v_age_seconds integer;
begin
  if p_reservation_id is null
     or p_actor is null or length(trim(p_actor)) < 3
     or p_reason is null or length(trim(p_reason)) < 20
     or p_min_age_seconds is null or p_min_age_seconds < 180 then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_REJECTED',
      'message', 'Recovery requires a reservation, an actor, a reason of at least 20 characters, and a minimum age of 180 seconds.',
      'failClosed', true
    );
  end if;

  if p_actual_usd is not null and p_actual_usd < 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_REJECTED',
      'message', 'Observed provider usage cannot be negative.',
      'failClosed', true
    );
  end if;

  select * into v_row
  from public.lab_ai_spend_reservations
  where id = p_reservation_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_NOT_FOUND',
      'message', 'Spend reservation was not found.',
      'failClosed', true
    );
  end if;

  if v_row.status <> 'RESERVED' then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_NOT_OPEN',
      'message', 'Only a RESERVED row can be recovered.',
      'status', v_row.status,
      'failClosed', true
    );
  end if;

  v_age_seconds := floor(extract(epoch from (now() - v_row.created_at)));
  if v_age_seconds < p_min_age_seconds then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_TOO_RECENT',
      'message', 'The reservation is still inside the in-flight window.',
      'ageSeconds', v_age_seconds,
      'minAgeSeconds', p_min_age_seconds,
      'failClosed', true
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_row.scope_key, 0));

  v_observed := p_actual_usd is not null;
  v_actual := greatest(0, coalesce(p_actual_usd, 0));

  update public.lab_ai_spend_accounts
  set reserved_usd = greatest(0, reserved_usd - v_row.reserve_usd),
      settled_usd = settled_usd + v_actual,
      updated_at = now()
  where scope_key = v_row.scope_key
  returning * into v_account;

  update public.lab_ai_spend_reservations
  set status = 'FAILED',
      actual_usd = v_actual,
      input_tokens = coalesce(p_input_tokens, 0),
      output_tokens = coalesce(p_output_tokens, 0),
      provider_ok = false,
      settled_at = now()
  where id = p_reservation_id;

  insert into public.lab_ai_spend_recoveries (
    reservation_id, scope_key, actor, reason,
    released_reserve_usd, settled_actual_usd, usage_observed,
    input_tokens, output_tokens
  ) values (
    p_reservation_id, v_row.scope_key, trim(p_actor), trim(p_reason),
    v_row.reserve_usd, v_actual, v_observed,
    p_input_tokens, p_output_tokens
  );

  return jsonb_build_object(
    'ok', true,
    'reservationId', p_reservation_id,
    'releasedReserveUsd', v_row.reserve_usd,
    'settledActualUsd', v_actual,
    'usageObserved', v_observed,
    'requestCount', v_account.request_count,
    'reservedUsd', v_account.reserved_usd,
    'settledUsd', v_account.settled_usd,
    'budgetUsd', v_account.budget_usd
  );
end;
$$;

revoke all on function public.release_abandoned_lab_ai_reservation(uuid, text, text, integer, numeric, integer, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.release_abandoned_lab_ai_reservation(uuid, text, text, integer, numeric, integer, integer) from anon;
    revoke all on table public.lab_ai_spend_recoveries from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.release_abandoned_lab_ai_reservation(uuid, text, text, integer, numeric, integer, integer) from authenticated;
    revoke all on table public.lab_ai_spend_recoveries from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.release_abandoned_lab_ai_reservation(uuid, text, text, integer, numeric, integer, integer) to service_role;
  end if;
end $$;

comment on table public.lab_ai_spend_recoveries is
  'Auditable release of a RESERVED Anthropic reservation after the calling process died. Request count is left unchanged.';
