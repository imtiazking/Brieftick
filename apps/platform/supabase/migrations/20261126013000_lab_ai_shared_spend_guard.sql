-- Shared lab Anthropic spend ledger. One row per pilot scope, locked for each reservation.
-- Service role executes the functions. Tenant roles cannot read or write the ledger.

create extension if not exists pgcrypto;

create table if not exists public.lab_ai_spend_accounts (
  scope_key text primary key,
  budget_usd numeric(12, 6) not null check (budget_usd > 0),
  max_requests integer not null check (max_requests > 0),
  settled_usd numeric(12, 6) not null default 0,
  reserved_usd numeric(12, 6) not null default 0,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_ai_spend_reservations (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null references public.lab_ai_spend_accounts (scope_key),
  organisation_id text,
  use_case_id text not null,
  idempotency_key text not null,
  status text not null check (status in ('RESERVED', 'SETTLED', 'FAILED')),
  reserve_usd numeric(12, 6) not null check (reserve_usd >= 0),
  actual_usd numeric(12, 6),
  input_tokens integer,
  output_tokens integer,
  provider_ok boolean,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (scope_key, idempotency_key)
);

alter table public.lab_ai_spend_accounts enable row level security;
alter table public.lab_ai_spend_reservations enable row level security;
revoke all on public.lab_ai_spend_accounts from public;
revoke all on public.lab_ai_spend_reservations from public;

create or replace function public.reserve_lab_ai_spend(
  p_scope_key text,
  p_budget_usd numeric,
  p_max_requests integer,
  p_reserve_usd numeric,
  p_use_case_id text,
  p_idempotency_key text,
  p_organisation_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.lab_ai_spend_accounts%rowtype;
  v_existing public.lab_ai_spend_reservations%rowtype;
  v_id uuid;
begin
  if p_scope_key is null or length(trim(p_scope_key)) = 0
     or p_budget_usd is null or p_budget_usd <= 0
     or p_max_requests is null or p_max_requests <= 0
     or p_reserve_usd is null or p_reserve_usd < 0
     or p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED',
      'message', 'Shared spend reservation is missing budget, scope, or idempotency key.'
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

  insert into public.lab_ai_spend_reservations (
    scope_key, organisation_id, use_case_id, idempotency_key, status, reserve_usd
  ) values (
    p_scope_key, p_organisation_id, p_use_case_id, p_idempotency_key, 'RESERVED', p_reserve_usd
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
    'settledUsd', v_account.settled_usd,
    'reservedUsd', v_account.reserved_usd,
    'requestCount', v_account.request_count,
    'budgetUsd', v_account.budget_usd
  );
end;
$$;

create or replace function public.settle_lab_ai_spend(
  p_reservation_id uuid,
  p_actual_usd numeric,
  p_input_tokens integer,
  p_output_tokens integer,
  p_provider_ok boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lab_ai_spend_reservations%rowtype;
  v_actual numeric(12, 6);
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

  v_actual := greatest(0, coalesce(p_actual_usd, 0));

  perform pg_advisory_xact_lock(hashtextextended(v_row.scope_key, 0));

  update public.lab_ai_spend_accounts
  set reserved_usd = greatest(0, reserved_usd - v_row.reserve_usd),
      settled_usd = settled_usd + v_actual,
      updated_at = now()
  where scope_key = v_row.scope_key
  returning * into v_account;

  update public.lab_ai_spend_reservations
  set status = case when coalesce(p_provider_ok, false) then 'SETTLED' else 'FAILED' end,
      actual_usd = v_actual,
      input_tokens = coalesce(p_input_tokens, 0),
      output_tokens = coalesce(p_output_tokens, 0),
      provider_ok = coalesce(p_provider_ok, false),
      settled_at = now()
  where id = p_reservation_id;

  return jsonb_build_object(
    'ok', true,
    'reservationId', p_reservation_id,
    'actualUsd', v_actual,
    'reserveUsd', v_row.reserve_usd,
    'settledUsd', v_account.settled_usd,
    'reservedUsd', v_account.reserved_usd,
    'requestCount', v_account.request_count,
    'budgetUsd', v_account.budget_usd,
    'providerOk', coalesce(p_provider_ok, false),
    'overReserve', v_actual > v_row.reserve_usd
  );
end;
$$;

revoke all on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text) from public;
revoke all on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text) to service_role;
    grant execute on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean) to service_role;
  end if;
end $$;

comment on table public.lab_ai_spend_accounts is
  'Shared Anthropic pilot ceiling. Reservations are atomic across serverless instances. Estimated reserve is not an Anthropic invoice.';
