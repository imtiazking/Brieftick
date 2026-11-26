-- Sonnet 5.5 ledger upgrade.
--  * Records model id, pricing version and the four billed usage categories per call
--    (standard input, output, cache write 5m/1h, cache read) plus the provider request id.
--  * Stores the reserved estimate separately from the reported usage and the settled estimate.
--  * Settlement with unknown usage (timeout, transport error) is charged at the full reserve by the database.
--  * Recovery of an abandoned reservation needs a registered operator, a provider deadline that has passed,
--    a written reason, and either verified provider usage with evidence or an assume-maximum charge.
--    A reservation can be recovered once.
-- Historical rows are never rewritten: rows created before this migration keep NULL model / pricing_version.
-- The ledger remains an estimated-cost control, not an Anthropic invoice cap.

alter table public.lab_ai_spend_reservations
  add column if not exists model text,
  add column if not exists pricing_version text,
  add column if not exists cache_write_5m_tokens integer,
  add column if not exists cache_write_1h_tokens integer,
  add column if not exists cache_read_tokens integer,
  add column if not exists provider_request_id text,
  add column if not exists usage_known boolean,
  add column if not exists cost_breakdown jsonb,
  add column if not exists reserve_basis jsonb,
  add column if not exists provider_deadline_at timestamptz;

comment on column public.lab_ai_spend_reservations.input_tokens is
  'Standard (uncached) input tokens as reported by the provider. Cache writes and reads are in their own columns.';
comment on column public.lab_ai_spend_reservations.reserve_usd is
  'Reserved worst-case estimate (prompt at the highest input-side rate plus the full output cap).';
comment on column public.lab_ai_spend_reservations.actual_usd is
  'Settled estimated cost from reported usage and the stored pricing_version. Equals reserve_usd when usage_known is false.';
comment on column public.lab_ai_spend_reservations.usage_known is
  'false when the provider outcome was unknown (timeout or transport error): settled at the full reserve.';

alter table public.lab_ai_spend_accounts
  add column if not exists standard_input_tokens bigint not null default 0,
  add column if not exists output_tokens bigint not null default 0,
  add column if not exists cache_write_tokens bigint not null default 0,
  add column if not exists cache_read_tokens bigint not null default 0;

-- ---------------------------------------------------------------------------------------------
-- reserve
-- ---------------------------------------------------------------------------------------------
drop function if exists public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text);

create or replace function public.reserve_lab_ai_spend(
  p_scope_key text,
  p_budget_usd numeric,
  p_max_requests integer,
  p_reserve_usd numeric,
  p_use_case_id text,
  p_idempotency_key text,
  p_organisation_id text,
  p_model text default null,
  p_pricing_version text default null,
  p_reserve_basis jsonb default null,
  p_provider_window_seconds integer default 420
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.lab_ai_spend_accounts%rowtype;
  v_existing public.lab_ai_spend_reservations%rowtype;
  v_id uuid;
  v_deadline timestamptz;
begin
  if p_scope_key is null or length(trim(p_scope_key)) = 0
     or p_budget_usd is null or p_budget_usd <= 0
     or p_max_requests is null or p_max_requests <= 0
     or p_reserve_usd is null or p_reserve_usd < 0
     or p_idempotency_key is null or length(trim(p_idempotency_key)) = 0
     or p_provider_window_seconds is null or p_provider_window_seconds < 30 then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED',
      'message', 'Shared spend reservation is missing budget, scope, idempotency key or provider window.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope_key, 0));

  insert into public.lab_ai_spend_accounts (scope_key, budget_usd, max_requests)
  values (p_scope_key, p_budget_usd, p_max_requests)
  on conflict (scope_key) do update
    set budget_usd = excluded.budget_usd,
        max_requests = excluded.max_requests,
        updated_at = now();

  select * into v_account
  from public.lab_ai_spend_accounts
  where scope_key = p_scope_key
  for update;

  select * into v_existing
  from public.lab_ai_spend_reservations
  where scope_key = p_scope_key and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.status = 'RESERVED' then
      return jsonb_build_object(
        'ok', true,
        'reused', true,
        'reservationId', v_existing.id,
        'reserveUsd', v_existing.reserve_usd,
        'providerDeadlineAt', v_existing.provider_deadline_at,
        'settledUsd', v_account.settled_usd,
        'reservedUsd', v_account.reserved_usd,
        'requestCount', v_account.request_count
      );
    end if;
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_ALREADY_SETTLED',
      'message', 'This idempotency key already consumed a shared budget reservation.',
      'failClosed', true
    );
  end if;

  if v_account.request_count >= v_account.max_requests then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_ANTHROPIC_BUDGET_EXCEEDED',
      'message', 'Shared RI_LAB_ANTHROPIC_MAX_REQUESTS is exhausted.',
      'failClosed', true,
      'requestCount', v_account.request_count,
      'maxRequests', v_account.max_requests
    );
  end if;

  if v_account.settled_usd + v_account.reserved_usd + p_reserve_usd > v_account.budget_usd then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_ANTHROPIC_BUDGET_EXCEEDED',
      'message', 'Maximum estimated cost would exceed the remaining shared budget.',
      'failClosed', true,
      'budgetUsd', v_account.budget_usd,
      'settledUsd', v_account.settled_usd,
      'reservedUsd', v_account.reserved_usd,
      'wouldReserveUsd', p_reserve_usd
    );
  end if;

  v_deadline := now() + make_interval(secs => p_provider_window_seconds);

  insert into public.lab_ai_spend_reservations (
    scope_key, organisation_id, use_case_id, idempotency_key, status, reserve_usd,
    model, pricing_version, reserve_basis, provider_deadline_at
  ) values (
    p_scope_key, p_organisation_id, p_use_case_id, p_idempotency_key, 'RESERVED', p_reserve_usd,
    p_model, p_pricing_version, p_reserve_basis, v_deadline
  )
  returning id into v_id;

  update public.lab_ai_spend_accounts
  set reserved_usd = reserved_usd + p_reserve_usd,
      request_count = request_count + 1,
      updated_at = now()
  where scope_key = p_scope_key
  returning * into v_account;

  return jsonb_build_object(
    'ok', true,
    'reused', false,
    'reservationId', v_id,
    'reserveUsd', p_reserve_usd,
    'providerDeadlineAt', v_deadline,
    'settledUsd', v_account.settled_usd,
    'reservedUsd', v_account.reserved_usd,
    'requestCount', v_account.request_count,
    'budgetUsd', v_account.budget_usd
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- settle
-- ---------------------------------------------------------------------------------------------
drop function if exists public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean);

create or replace function public.settle_lab_ai_spend(
  p_reservation_id uuid,
  p_actual_usd numeric,
  p_input_tokens integer,
  p_output_tokens integer,
  p_provider_ok boolean,
  p_cache_write_5m_tokens integer default 0,
  p_cache_write_1h_tokens integer default 0,
  p_cache_read_tokens integer default 0,
  p_provider_request_id text default null,
  p_usage_known boolean default true,
  p_cost_breakdown jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lab_ai_spend_reservations%rowtype;
  v_actual numeric(12, 6);
  v_known boolean;
  v_account public.lab_ai_spend_accounts%rowtype;
begin
  if p_reservation_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED',
      'message', 'Missing reservation id for spend reconciliation.'
    );
  end if;

  select * into v_row
  from public.lab_ai_spend_reservations
  where id = p_reservation_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED',
      'message', 'Spend reservation was not found.'
    );
  end if;

  if v_row.status <> 'RESERVED' then
    return jsonb_build_object(
      'ok', true,
      'reused', true,
      'reservationId', v_row.id,
      'actualUsd', v_row.actual_usd,
      'status', v_row.status
    );
  end if;

  v_known := coalesce(p_usage_known, true);
  -- Unknown provider outcome: the database charges the whole reserve whatever the caller sent.
  v_actual := case when v_known then greatest(0, coalesce(p_actual_usd, 0)) else v_row.reserve_usd end;

  perform pg_advisory_xact_lock(hashtextextended(v_row.scope_key, 0));

  update public.lab_ai_spend_accounts
  set reserved_usd = greatest(0, reserved_usd - v_row.reserve_usd),
      settled_usd = settled_usd + v_actual,
      standard_input_tokens = standard_input_tokens + case when v_known then greatest(0, coalesce(p_input_tokens, 0)) else 0 end,
      output_tokens = output_tokens + case when v_known then greatest(0, coalesce(p_output_tokens, 0)) else 0 end,
      cache_write_tokens = cache_write_tokens + case when v_known
        then greatest(0, coalesce(p_cache_write_5m_tokens, 0)) + greatest(0, coalesce(p_cache_write_1h_tokens, 0)) else 0 end,
      cache_read_tokens = cache_read_tokens + case when v_known then greatest(0, coalesce(p_cache_read_tokens, 0)) else 0 end,
      updated_at = now()
  where scope_key = v_row.scope_key
  returning * into v_account;

  update public.lab_ai_spend_reservations
  set status = case when coalesce(p_provider_ok, false) then 'SETTLED' else 'FAILED' end,
      actual_usd = v_actual,
      input_tokens = case when v_known then greatest(0, coalesce(p_input_tokens, 0)) else null end,
      output_tokens = case when v_known then greatest(0, coalesce(p_output_tokens, 0)) else null end,
      cache_write_5m_tokens = case when v_known then greatest(0, coalesce(p_cache_write_5m_tokens, 0)) else null end,
      cache_write_1h_tokens = case when v_known then greatest(0, coalesce(p_cache_write_1h_tokens, 0)) else null end,
      cache_read_tokens = case when v_known then greatest(0, coalesce(p_cache_read_tokens, 0)) else null end,
      provider_request_id = p_provider_request_id,
      usage_known = v_known,
      cost_breakdown = p_cost_breakdown,
      provider_ok = coalesce(p_provider_ok, false),
      settled_at = now()
  where id = p_reservation_id;

  return jsonb_build_object(
    'ok', true,
    'reservationId', p_reservation_id,
    'actualUsd', v_actual,
    'reserveUsd', v_row.reserve_usd,
    'releasedUnusedUsd', greatest(0, v_row.reserve_usd - v_actual),
    'settledUsd', v_account.settled_usd,
    'reservedUsd', v_account.reserved_usd,
    'requestCount', v_account.request_count,
    'budgetUsd', v_account.budget_usd,
    'providerOk', coalesce(p_provider_ok, false),
    'usageKnown', v_known,
    'overReserve', v_actual > v_row.reserve_usd
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- operator recovery
-- ---------------------------------------------------------------------------------------------
create table if not exists public.lab_ai_spend_operators (
  actor text primary key check (length(trim(actor)) >= 3),
  authorised_by text not null check (length(trim(authorised_by)) >= 3),
  authorised_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.lab_ai_spend_operators enable row level security;
alter table public.lab_ai_spend_operators force row level security;
revoke all on table public.lab_ai_spend_operators from public;

comment on table public.lab_ai_spend_operators is
  'Actors allowed to recover abandoned spend reservations. Empty by default; registering an operator is an explicit, audited admin act.';

alter table public.lab_ai_spend_recoveries
  add column if not exists resolution text,
  add column if not exists evidence text,
  add column if not exists provider_deadline_at timestamptz,
  add column if not exists cache_write_tokens integer,
  add column if not exists cache_read_tokens integer;

create unique index if not exists lab_ai_spend_recoveries_reservation_uniq
  on public.lab_ai_spend_recoveries (reservation_id);

drop function if exists public.release_abandoned_lab_ai_reservation(uuid, text, text, integer, numeric, integer, integer);

create or replace function public.release_abandoned_lab_ai_reservation(
  p_reservation_id uuid,
  p_actor text,
  p_reason text,
  p_min_age_seconds integer,
  p_resolution text default 'ASSUME_MAX',
  p_actual_usd numeric default null,
  p_evidence text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_cache_write_tokens integer default null,
  p_cache_read_tokens integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lab_ai_spend_reservations%rowtype;
  v_actual numeric(12, 6);
  v_account public.lab_ai_spend_accounts%rowtype;
  v_age_seconds integer;
  v_min_age integer;
  v_verified boolean;
begin
  if p_reservation_id is null
     or p_actor is null or length(trim(p_actor)) < 3
     or p_reason is null or length(trim(p_reason)) < 20
     or p_min_age_seconds is null or p_min_age_seconds < 180
     or p_resolution is null or p_resolution not in ('ASSUME_MAX', 'VERIFIED_USAGE') then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_REJECTED',
      'message', 'Recovery requires a reservation, an actor, a reason of at least 20 characters, a minimum age of 180 seconds and a resolution of ASSUME_MAX or VERIFIED_USAGE.',
      'failClosed', true
    );
  end if;

  if not exists (
    select 1 from public.lab_ai_spend_operators o
    where o.actor = trim(p_actor) and o.revoked_at is null
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_NOT_AUTHORISED',
      'message', 'The actor is not a registered, active spend-recovery operator.',
      'failClosed', true
    );
  end if;

  v_verified := p_resolution = 'VERIFIED_USAGE';
  if v_verified and (p_actual_usd is null or p_actual_usd < 0
                     or p_evidence is null or length(trim(p_evidence)) < 20) then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_REJECTED',
      'message', 'VERIFIED_USAGE needs a non-negative observed cost and written evidence of at least 20 characters (for example the Anthropic Console usage record).',
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

  if v_row.status <> 'RESERVED' or exists (
    select 1 from public.lab_ai_spend_recoveries r where r.reservation_id = p_reservation_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_NOT_OPEN',
      'message', 'Only a RESERVED row that has not been recovered can be recovered.',
      'status', v_row.status,
      'failClosed', true
    );
  end if;

  v_age_seconds := floor(extract(epoch from (now() - v_row.created_at)));
  -- Rows written before provider deadlines existed need a longer quiet period.
  v_min_age := case when v_row.provider_deadline_at is null then greatest(p_min_age_seconds, 900) else p_min_age_seconds end;
  if v_age_seconds < v_min_age then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_TOO_RECENT',
      'message', 'The reservation is still inside the in-flight window.',
      'ageSeconds', v_age_seconds,
      'minAgeSeconds', v_min_age,
      'failClosed', true
    );
  end if;

  if v_row.provider_deadline_at is not null and now() < v_row.provider_deadline_at then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_SPEND_RECOVERY_PROVIDER_MAY_BE_ACTIVE',
      'message', 'The provider execution window has not ended; the call could still complete and be billed.',
      'providerDeadlineAt', v_row.provider_deadline_at,
      'failClosed', true
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_row.scope_key, 0));

  -- ASSUME_MAX keeps the full reserve as spent: nothing is returned that the provider might still have billed.
  v_actual := case when v_verified then greatest(0, p_actual_usd) else v_row.reserve_usd end;

  update public.lab_ai_spend_accounts
  set reserved_usd = greatest(0, reserved_usd - v_row.reserve_usd),
      settled_usd = settled_usd + v_actual,
      standard_input_tokens = standard_input_tokens + case when v_verified then greatest(0, coalesce(p_input_tokens, 0)) else 0 end,
      output_tokens = output_tokens + case when v_verified then greatest(0, coalesce(p_output_tokens, 0)) else 0 end,
      cache_write_tokens = cache_write_tokens + case when v_verified then greatest(0, coalesce(p_cache_write_tokens, 0)) else 0 end,
      cache_read_tokens = cache_read_tokens + case when v_verified then greatest(0, coalesce(p_cache_read_tokens, 0)) else 0 end,
      updated_at = now()
  where scope_key = v_row.scope_key
  returning * into v_account;

  update public.lab_ai_spend_reservations
  set status = 'FAILED',
      actual_usd = v_actual,
      input_tokens = case when v_verified then coalesce(p_input_tokens, 0) else null end,
      output_tokens = case when v_verified then coalesce(p_output_tokens, 0) else null end,
      cache_read_tokens = case when v_verified then coalesce(p_cache_read_tokens, 0) else null end,
      usage_known = v_verified,
      provider_ok = false,
      settled_at = now()
  where id = p_reservation_id;

  insert into public.lab_ai_spend_recoveries (
    reservation_id, scope_key, actor, reason,
    released_reserve_usd, settled_actual_usd, usage_observed,
    input_tokens, output_tokens, resolution, evidence, provider_deadline_at,
    cache_write_tokens, cache_read_tokens
  ) values (
    p_reservation_id, v_row.scope_key, trim(p_actor), trim(p_reason),
    greatest(0, v_row.reserve_usd - v_actual), v_actual, v_verified,
    p_input_tokens, p_output_tokens, p_resolution, nullif(trim(coalesce(p_evidence, '')), ''), v_row.provider_deadline_at,
    p_cache_write_tokens, p_cache_read_tokens
  );

  return jsonb_build_object(
    'ok', true,
    'reservationId', p_reservation_id,
    'resolution', p_resolution,
    'releasedReserveUsd', greatest(0, v_row.reserve_usd - v_actual),
    'settledActualUsd', v_actual,
    'usageObserved', v_verified,
    'requestCount', v_account.request_count,
    'reservedUsd', v_account.reserved_usd,
    'settledUsd', v_account.settled_usd,
    'budgetUsd', v_account.budget_usd
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- grants: service_role only
-- ---------------------------------------------------------------------------------------------
revoke all on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text, text, text, jsonb, integer) from public;
revoke all on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean, integer, integer, integer, text, boolean, jsonb) from public;
revoke all on function public.release_abandoned_lab_ai_reservation(uuid, text, text, integer, text, numeric, text, integer, integer, integer, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text, text, text, jsonb, integer) from anon;
    revoke all on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean, integer, integer, integer, text, boolean, jsonb) from anon;
    revoke all on function public.release_abandoned_lab_ai_reservation(uuid, text, text, integer, text, numeric, text, integer, integer, integer, integer) from anon;
    revoke all on table public.lab_ai_spend_operators from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text, text, text, jsonb, integer) from authenticated;
    revoke all on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean, integer, integer, integer, text, boolean, jsonb) from authenticated;
    revoke all on function public.release_abandoned_lab_ai_reservation(uuid, text, text, integer, text, numeric, text, integer, integer, integer, integer) from authenticated;
    revoke all on table public.lab_ai_spend_operators from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text, text, text, jsonb, integer) to service_role;
    grant execute on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean, integer, integer, integer, text, boolean, jsonb) to service_role;
    grant execute on function public.release_abandoned_lab_ai_reservation(uuid, text, text, integer, text, numeric, text, integer, integer, integer, integer) to service_role;
  end if;
end $$;
