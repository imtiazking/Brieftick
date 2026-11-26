-- Run-reference-scoped AI execution ledger.
--
-- Root cause fixed: the shared ledger kept ONE account (scope_key) for every pilot, so request_count and
-- settled_usd from FCA-EVAL-001 were inherited by FCA-EVAL-002 and stage 4 failed with
-- LAB_ANTHROPIC_BUDGET_EXCEEDED although only 3 of 8 requests belonged to the run.
--
-- Now every authorised execution is a RUN with its own tenant, budget, request cap, validity window and counters.
-- Tenant and platform spending limits are evaluated over the immutable reservation rows.
-- Historical rows (scope_key without a run reference) are never rewritten.
-- Every ledger movement appends to ai_execution_ledger_events (no update, no delete).
-- Functions execute for service_role only. Estimated cost control, not an Anthropic invoice cap.

-- ---------------------------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------------------------
create table if not exists public.ai_execution_runs (
  run_reference text primary key check (length(trim(run_reference)) >= 8),
  organisation_id text not null check (length(trim(organisation_id)) > 0),
  status text not null default 'AUTHORISED'
    check (status in ('AUTHORISED', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CLOSED', 'REVOKED')),
  purpose text,
  budget_usd numeric(12, 6) not null check (budget_usd > 0),
  max_requests integer not null check (max_requests > 0),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  authorised_by text not null check (length(trim(authorised_by)) >= 3),
  authorised_at timestamptz not null default now(),
  reserved_usd numeric(12, 6) not null default 0 check (reserved_usd >= 0),
  settled_usd numeric(12, 6) not null default 0 check (settled_usd >= 0),
  request_count integer not null default 0 check (request_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  standard_input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  terminated_reason text,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create index if not exists ai_execution_runs_org_idx on public.ai_execution_runs (organisation_id);

create table if not exists public.ai_execution_limits (
  id uuid primary key default gen_random_uuid(),
  limit_scope text not null check (limit_scope in ('platform', 'tenant')),
  organisation_id text,
  max_spend_usd numeric(12, 6) not null check (max_spend_usd > 0),
  max_requests integer check (max_requests is null or max_requests > 0),
  window_starts_at timestamptz not null,
  window_ends_at timestamptz not null,
  created_by text not null check (length(trim(created_by)) >= 3),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (window_ends_at > window_starts_at),
  check ((limit_scope = 'platform' and organisation_id is null)
      or (limit_scope = 'tenant' and organisation_id is not null))
);

create table if not exists public.ai_execution_ledger_events (
  id bigint generated always as identity primary key,
  run_reference text,
  reservation_id uuid,
  organisation_id text,
  event_type text not null,
  actor text,
  detail jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists ai_execution_ledger_events_run_idx on public.ai_execution_ledger_events (run_reference, id);

-- Run rows carry a run reference and the retry origin; the legacy FK to the shared account is not applicable.
alter table public.lab_ai_spend_reservations
  add column if not exists run_reference text,
  add column if not exists retry_of text;

alter table public.lab_ai_spend_reservations
  drop constraint if exists lab_ai_spend_reservations_scope_key_fkey;

create index if not exists lab_ai_spend_reservations_run_idx
  on public.lab_ai_spend_reservations (run_reference) where run_reference is not null;

alter table public.ai_execution_runs enable row level security;
alter table public.ai_execution_runs force row level security;
alter table public.ai_execution_limits enable row level security;
alter table public.ai_execution_limits force row level security;
alter table public.ai_execution_ledger_events enable row level security;
alter table public.ai_execution_ledger_events force row level security;
revoke all on table public.ai_execution_runs from public;
revoke all on table public.ai_execution_limits from public;
revoke all on table public.ai_execution_ledger_events from public;

-- ---------------------------------------------------------------------------------------------
-- immutability
-- ---------------------------------------------------------------------------------------------
create or replace function public.ai_ledger_block_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'ai ledger records are immutable (% on %)', tg_op, tg_table_name using errcode = 'P0001';
end;
$$;

drop trigger if exists ai_execution_ledger_events_immutable on public.ai_execution_ledger_events;
create trigger ai_execution_ledger_events_immutable
  before update or delete on public.ai_execution_ledger_events
  for each row execute function public.ai_ledger_block_mutation();

create or replace function public.ai_ledger_guard_reservation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ai ledger reservations cannot be deleted' using errcode = 'P0001';
  end if;
  -- Only an open (RESERVED) row can change; a SETTLED or FAILED row is a permanent spending record.
  if old.status <> 'RESERVED' then
    raise exception 'settled ai ledger reservation % is immutable', old.id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists lab_ai_spend_reservations_guard on public.lab_ai_spend_reservations;
create trigger lab_ai_spend_reservations_guard
  before update or delete on public.lab_ai_spend_reservations
  for each row execute function public.ai_ledger_guard_reservation();

-- Counters on the legacy shared account may only grow: no manual reset of consumed requests or spend.
create or replace function public.ai_ledger_guard_legacy_account() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ai ledger accounts cannot be deleted' using errcode = 'P0001';
  end if;
  if new.request_count < old.request_count or new.settled_usd < old.settled_usd then
    raise exception 'ai ledger account counters cannot be reduced' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists lab_ai_spend_accounts_guard on public.lab_ai_spend_accounts;
create trigger lab_ai_spend_accounts_guard
  before update or delete on public.lab_ai_spend_accounts
  for each row execute function public.ai_ledger_guard_legacy_account();

-- Run counters may only grow as well; limits are append-only except revocation.
create or replace function public.ai_ledger_guard_run() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ai execution runs cannot be deleted' using errcode = 'P0001';
  end if;
  if new.run_reference <> old.run_reference
     or new.organisation_id <> old.organisation_id
     or new.budget_usd <> old.budget_usd
     or new.max_requests <> old.max_requests
     or new.starts_at <> old.starts_at
     or new.expires_at <> old.expires_at
     or new.authorised_by <> old.authorised_by
     or new.request_count < old.request_count
     or new.settled_usd < old.settled_usd
     or new.retry_count < old.retry_count then
    raise exception 'ai execution run authorisation and consumption are immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_execution_runs_guard on public.ai_execution_runs;
create trigger ai_execution_runs_guard
  before update or delete on public.ai_execution_runs
  for each row execute function public.ai_ledger_guard_run();

create or replace function public.ai_ledger_guard_limit() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ai execution limits cannot be deleted' using errcode = 'P0001';
  end if;
  if new.limit_scope <> old.limit_scope
     or new.organisation_id is distinct from old.organisation_id
     or new.max_spend_usd <> old.max_spend_usd
     or new.max_requests is distinct from old.max_requests
     or new.window_starts_at <> old.window_starts_at
     or new.window_ends_at <> old.window_ends_at
     or new.created_by <> old.created_by
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'ai execution limits can only be revoked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_execution_limits_guard on public.ai_execution_limits;
create trigger ai_execution_limits_guard
  before update or delete on public.ai_execution_limits
  for each row execute function public.ai_ledger_guard_limit();

-- ---------------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------------
create or replace function public.ai_exec_event(
  p_run text, p_reservation uuid, p_org text, p_type text, p_actor text, p_detail jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.ai_execution_ledger_events (run_reference, reservation_id, organisation_id, event_type, actor, detail)
  values (p_run, p_reservation, p_org, p_type, p_actor, p_detail);
$$;

-- Committed spend and request count from immutable reservation rows (settled spend or open reserve).
create or replace function public.ai_exec_window_usage(p_org text, p_from timestamptz, p_to timestamptz)
returns table (spend numeric, requests bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when r.status = 'RESERVED' then r.reserve_usd else coalesce(r.actual_usd, r.reserve_usd) end), 0),
         count(*)
  from public.lab_ai_spend_reservations r
  where r.run_reference is not null
    and r.created_at >= p_from and r.created_at < p_to
    and (p_org is null or r.organisation_id = p_org);
$$;

-- ---------------------------------------------------------------------------------------------
-- authorise
-- ---------------------------------------------------------------------------------------------
create or replace function public.authorise_ai_execution_run(
  p_run_reference text,
  p_organisation_id text,
  p_budget_usd numeric,
  p_max_requests integer,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_authorised_by text,
  p_purpose text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_run_reference is null or length(trim(p_run_reference)) < 8
     or p_organisation_id is null or length(trim(p_organisation_id)) = 0
     or p_budget_usd is null or p_budget_usd <= 0
     or p_max_requests is null or p_max_requests <= 0
     or p_starts_at is null or p_expires_at is null or p_expires_at <= p_starts_at
     or p_authorised_by is null or length(trim(p_authorised_by)) < 3 then
    return jsonb_build_object('ok', false, 'code', 'AI_RUN_AUTHORISATION_INVALID',
      'message', 'A run needs a reference of 8+ characters, a tenant, a positive budget and request cap, a valid window and an authoriser.',
      'failClosed', true);
  end if;

  begin
    insert into public.ai_execution_runs
      (run_reference, organisation_id, budget_usd, max_requests, starts_at, expires_at, authorised_by, purpose)
    values
      (trim(p_run_reference), trim(p_organisation_id), p_budget_usd, p_max_requests, p_starts_at, p_expires_at,
       trim(p_authorised_by), p_purpose);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'AI_RUN_REFERENCE_EXISTS',
      'message', 'A run reference is unique and cannot be reused or re-authorised.', 'failClosed', true);
  end;

  perform public.ai_exec_event(trim(p_run_reference), null, trim(p_organisation_id), 'RUN_AUTHORISED', trim(p_authorised_by),
    jsonb_build_object('budgetUsd', p_budget_usd, 'maxRequests', p_max_requests,
                       'startsAt', p_starts_at, 'expiresAt', p_expires_at, 'purpose', p_purpose));
  return jsonb_build_object('ok', true, 'runReference', trim(p_run_reference), 'status', 'AUTHORISED');
end;
$$;

create or replace function public.set_ai_execution_limit(
  p_scope text, p_organisation_id text, p_max_spend_usd numeric, p_max_requests integer,
  p_window_starts_at timestamptz, p_window_ends_at timestamptz, p_created_by text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_scope not in ('platform', 'tenant')
     or (p_scope = 'tenant' and (p_organisation_id is null or length(trim(p_organisation_id)) = 0))
     or (p_scope = 'platform' and p_organisation_id is not null)
     or p_max_spend_usd is null or p_max_spend_usd <= 0
     or p_window_starts_at is null or p_window_ends_at is null or p_window_ends_at <= p_window_starts_at
     or p_created_by is null or length(trim(p_created_by)) < 3 then
    return jsonb_build_object('ok', false, 'code', 'AI_LIMIT_INVALID', 'failClosed', true);
  end if;
  insert into public.ai_execution_limits
    (limit_scope, organisation_id, max_spend_usd, max_requests, window_starts_at, window_ends_at, created_by)
  values (p_scope, p_organisation_id, p_max_spend_usd, p_max_requests, p_window_starts_at, p_window_ends_at, trim(p_created_by))
  returning id into v_id;
  perform public.ai_exec_event(null, null, p_organisation_id, 'LIMIT_SET', trim(p_created_by),
    jsonb_build_object('limitId', v_id, 'scope', p_scope, 'maxSpendUsd', p_max_spend_usd, 'maxRequests', p_max_requests));
  return jsonb_build_object('ok', true, 'limitId', v_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- interrupted executions: a RESERVED row whose provider window has ended can no longer be running.
-- It is charged at the full reserve (a bill may exist that cannot be seen) and the run continues.
-- ---------------------------------------------------------------------------------------------
create or replace function public.reconcile_interrupted_ai_executions(p_run_reference text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r public.lab_ai_spend_reservations%rowtype;
  v_n integer := 0;
begin
  for r in
    select * from public.lab_ai_spend_reservations
    where run_reference is not null
      and status = 'RESERVED'
      and provider_deadline_at is not null
      and provider_deadline_at < now()
      and (p_run_reference is null or run_reference = p_run_reference)
    for update skip locked
  loop
    update public.lab_ai_spend_reservations
      set status = 'FAILED', actual_usd = r.reserve_usd, usage_known = false, provider_ok = false, settled_at = now()
      where id = r.id;
    update public.ai_execution_runs
      set reserved_usd = greatest(0, reserved_usd - r.reserve_usd),
          settled_usd = settled_usd + r.reserve_usd,
          failed_count = failed_count + 1,
          updated_at = now()
      where run_reference = r.run_reference;
    perform public.ai_exec_event(r.run_reference, r.id, r.organisation_id, 'AUTO_RECOVERED_ASSUME_MAX', 'system',
      jsonb_build_object('chargedUsd', r.reserve_usd, 'providerDeadlineAt', r.provider_deadline_at));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- reserve
-- ---------------------------------------------------------------------------------------------
create or replace function public.reserve_ai_execution_run(
  p_run_reference text,
  p_organisation_id text,
  p_reserve_usd numeric,
  p_use_case_id text,
  p_idempotency_key text,
  p_model text default null,
  p_pricing_version text default null,
  p_reserve_basis jsonb default null,
  p_provider_window_seconds integer default 420,
  p_retry_of text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_run public.ai_execution_runs%rowtype;
  v_existing public.lab_ai_spend_reservations%rowtype;
  v_origin public.lab_ai_spend_reservations%rowtype;
  v_limit public.ai_execution_limits%rowtype;
  v_spend numeric;
  v_requests bigint;
  v_id uuid;
  v_deadline timestamptz;
begin
  if p_run_reference is null or length(trim(p_run_reference)) < 8
     or p_organisation_id is null or length(trim(p_organisation_id)) = 0
     or p_reserve_usd is null or p_reserve_usd < 0
     or p_idempotency_key is null or length(trim(p_idempotency_key)) = 0
     or p_use_case_id is null or length(trim(p_use_case_id)) = 0
     or p_provider_window_seconds is null or p_provider_window_seconds < 30 then
    return jsonb_build_object('ok', false, 'code', 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED',
      'message', 'Run reservation is missing run reference, tenant, reserve, use case, idempotency key or provider window.',
      'failClosed', true);
  end if;

  -- Fixed lock order (platform, tenant, run) so concurrent reservations cannot deadlock.
  perform pg_advisory_xact_lock(hashtextextended('ai-exec:platform', 0));
  perform pg_advisory_xact_lock(hashtextextended('ai-exec:tenant:' || trim(p_organisation_id), 0));
  perform pg_advisory_xact_lock(hashtextextended('ai-exec:run:' || trim(p_run_reference), 0));

  perform public.reconcile_interrupted_ai_executions(trim(p_run_reference));

  select * into v_run from public.ai_execution_runs where run_reference = trim(p_run_reference) for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'AI_RUN_NOT_AUTHORISED',
      'message', 'No authorised execution run exists for this run reference.', 'failClosed', true);
  end if;
  if v_run.organisation_id <> trim(p_organisation_id) then
    perform public.ai_exec_event(v_run.run_reference, null, p_organisation_id, 'RESERVE_DENIED_TENANT', null,
      jsonb_build_object('runTenant', v_run.organisation_id));
    return jsonb_build_object('ok', false, 'code', 'AI_RUN_TENANT_MISMATCH',
      'message', 'This run is authorised for a different tenant.', 'failClosed', true);
  end if;
  if v_run.status in ('REVOKED', 'CLOSED', 'EXHAUSTED', 'EXPIRED') then
    return jsonb_build_object('ok', false, 'code', 'AI_RUN_' || v_run.status,
      'message', 'The execution run is ' || lower(v_run.status) || ' and accepts no further requests.',
      'failClosed', true, 'status', v_run.status);
  end if;
  if now() < v_run.starts_at then
    return jsonb_build_object('ok', false, 'code', 'AI_RUN_NOT_STARTED',
      'message', 'The execution run authorisation has not started.', 'failClosed', true, 'startsAt', v_run.starts_at);
  end if;
  if now() >= v_run.expires_at then
    update public.ai_execution_runs set status = 'EXPIRED', terminated_reason = 'authorisation_expired',
      closed_at = now(), updated_at = now() where run_reference = v_run.run_reference;
    perform public.ai_exec_event(v_run.run_reference, null, v_run.organisation_id, 'RUN_EXPIRED', 'system',
      jsonb_build_object('expiresAt', v_run.expires_at));
    return jsonb_build_object('ok', false, 'code', 'AI_RUN_EXPIRED',
      'message', 'The execution run authorisation has expired.', 'failClosed', true);
  end if;

  select * into v_existing from public.lab_ai_spend_reservations
    where scope_key = 'run:' || v_run.run_reference and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.status = 'RESERVED' then
      return jsonb_build_object('ok', true, 'reused', true, 'reservationId', v_existing.id,
        'reserveUsd', v_existing.reserve_usd, 'providerDeadlineAt', v_existing.provider_deadline_at,
        'settledUsd', v_run.settled_usd, 'reservedUsd', v_run.reserved_usd, 'requestCount', v_run.request_count);
    end if;
    perform public.ai_exec_event(v_run.run_reference, v_existing.id, v_run.organisation_id, 'DUPLICATE_BLOCKED', null,
      jsonb_build_object('idempotencyKey', p_idempotency_key, 'status', v_existing.status));
    return jsonb_build_object('ok', false, 'code', 'LAB_SPEND_ALREADY_SETTLED',
      'message', 'This idempotency key already consumed a reservation in this run.', 'failClosed', true);
  end if;

  if p_retry_of is not null then
    select * into v_origin from public.lab_ai_spend_reservations
      where scope_key = 'run:' || v_run.run_reference and idempotency_key = p_retry_of;
    if not found or v_origin.status <> 'FAILED' then
      return jsonb_build_object('ok', false, 'code', 'AI_RETRY_ORIGIN_INVALID',
        'message', 'A retry must reference a FAILED request in the same run.', 'failClosed', true);
    end if;
  end if;

  if v_run.request_count >= v_run.max_requests then
    update public.ai_execution_runs set status = 'EXHAUSTED', terminated_reason = 'request_limit',
      closed_at = now(), updated_at = now() where run_reference = v_run.run_reference;
    perform public.ai_exec_event(v_run.run_reference, null, v_run.organisation_id, 'RUN_EXHAUSTED_REQUESTS', 'system', null);
    return jsonb_build_object('ok', false, 'code', 'LAB_ANTHROPIC_BUDGET_EXCEEDED',
      'message', 'The run request limit is exhausted.', 'failClosed', true,
      'requestCount', v_run.request_count, 'maxRequests', v_run.max_requests);
  end if;
  if v_run.settled_usd + v_run.reserved_usd + p_reserve_usd > v_run.budget_usd then
    perform public.ai_exec_event(v_run.run_reference, null, v_run.organisation_id, 'RESERVE_DENIED_BUDGET', null,
      jsonb_build_object('wouldReserveUsd', p_reserve_usd, 'settledUsd', v_run.settled_usd, 'reservedUsd', v_run.reserved_usd));
    return jsonb_build_object('ok', false, 'code', 'LAB_ANTHROPIC_BUDGET_EXCEEDED',
      'message', 'Maximum estimated cost would exceed the remaining run budget.', 'failClosed', true,
      'budgetUsd', v_run.budget_usd, 'settledUsd', v_run.settled_usd, 'reservedUsd', v_run.reserved_usd,
      'wouldReserveUsd', p_reserve_usd);
  end if;

  -- Tenant and platform limits over the immutable reservation rows.
  for v_limit in
    select * from public.ai_execution_limits
    where revoked_at is null and now() >= window_starts_at and now() < window_ends_at
      and (limit_scope = 'platform' or (limit_scope = 'tenant' and organisation_id = v_run.organisation_id))
    order by limit_scope
  loop
    select u.spend, u.requests into v_spend, v_requests
    from public.ai_exec_window_usage(
      case when v_limit.limit_scope = 'tenant' then v_limit.organisation_id else null end,
      v_limit.window_starts_at, v_limit.window_ends_at) u;
    if v_spend + p_reserve_usd > v_limit.max_spend_usd
       or (v_limit.max_requests is not null and v_requests + 1 > v_limit.max_requests) then
      perform public.ai_exec_event(v_run.run_reference, null, v_run.organisation_id,
        'RESERVE_DENIED_' || upper(v_limit.limit_scope) || '_LIMIT', null,
        jsonb_build_object('limitId', v_limit.id, 'spendUsd', v_spend, 'requests', v_requests));
      return jsonb_build_object('ok', false, 'code', 'AI_' || upper(v_limit.limit_scope) || '_LIMIT_EXCEEDED',
        'message', initcap(v_limit.limit_scope) || ' spending limit would be exceeded.', 'failClosed', true);
    end if;
  end loop;

  v_deadline := now() + make_interval(secs => p_provider_window_seconds);
  insert into public.lab_ai_spend_reservations (
    scope_key, organisation_id, use_case_id, idempotency_key, status, reserve_usd,
    model, pricing_version, reserve_basis, provider_deadline_at, run_reference, retry_of
  ) values (
    'run:' || v_run.run_reference, v_run.organisation_id, p_use_case_id, p_idempotency_key, 'RESERVED', p_reserve_usd,
    p_model, p_pricing_version, p_reserve_basis, v_deadline, v_run.run_reference, p_retry_of
  ) returning id into v_id;

  update public.ai_execution_runs
    set reserved_usd = reserved_usd + p_reserve_usd,
        request_count = request_count + 1,
        retry_count = retry_count + case when p_retry_of is null then 0 else 1 end,
        status = 'ACTIVE',
        updated_at = now()
    where run_reference = v_run.run_reference
    returning * into v_run;

  perform public.ai_exec_event(v_run.run_reference, v_id, v_run.organisation_id,
    case when p_retry_of is null then 'RESERVED' else 'RESERVED_RETRY' end, null,
    jsonb_build_object('useCaseId', p_use_case_id, 'reserveUsd', p_reserve_usd, 'idempotencyKey', p_idempotency_key,
                       'retryOf', p_retry_of));

  return jsonb_build_object('ok', true, 'reused', false, 'reservationId', v_id, 'reserveUsd', p_reserve_usd,
    'providerDeadlineAt', v_deadline, 'settledUsd', v_run.settled_usd, 'reservedUsd', v_run.reserved_usd,
    'requestCount', v_run.request_count, 'budgetUsd', v_run.budget_usd, 'maxRequests', v_run.max_requests,
    'runReference', v_run.run_reference);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- settle
-- ---------------------------------------------------------------------------------------------
create or replace function public.settle_ai_execution_run(
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
language plpgsql security definer set search_path = public as $$
declare
  v_row public.lab_ai_spend_reservations%rowtype;
  v_run public.ai_execution_runs%rowtype;
  v_actual numeric(12, 6);
  v_known boolean;
begin
  if p_reservation_id is null then
    return jsonb_build_object('ok', false, 'code', 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED',
      'message', 'Missing reservation id for spend reconciliation.', 'failClosed', true);
  end if;

  select * into v_row from public.lab_ai_spend_reservations where id = p_reservation_id and run_reference is not null for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED',
      'message', 'Run spend reservation was not found.', 'failClosed', true);
  end if;
  if v_row.status <> 'RESERVED' then
    return jsonb_build_object('ok', true, 'reused', true, 'reservationId', v_row.id,
      'actualUsd', v_row.actual_usd, 'status', v_row.status);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai-exec:run:' || v_row.run_reference, 0));

  v_known := coalesce(p_usage_known, true);
  v_actual := case when v_known then greatest(0, coalesce(p_actual_usd, 0)) else v_row.reserve_usd end;

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

  update public.ai_execution_runs
    set reserved_usd = greatest(0, reserved_usd - v_row.reserve_usd),
        settled_usd = settled_usd + v_actual,
        failed_count = failed_count + case when coalesce(p_provider_ok, false) then 0 else 1 end,
        standard_input_tokens = standard_input_tokens + case when v_known then greatest(0, coalesce(p_input_tokens, 0)) else 0 end,
        output_tokens = output_tokens + case when v_known then greatest(0, coalesce(p_output_tokens, 0)) else 0 end,
        cache_write_tokens = cache_write_tokens + case when v_known
          then greatest(0, coalesce(p_cache_write_5m_tokens, 0)) + greatest(0, coalesce(p_cache_write_1h_tokens, 0)) else 0 end,
        cache_read_tokens = cache_read_tokens + case when v_known then greatest(0, coalesce(p_cache_read_tokens, 0)) else 0 end,
        updated_at = now()
    where run_reference = v_row.run_reference
    returning * into v_run;

  -- Automatic termination when a limit is reached.
  if v_run.status in ('ACTIVE', 'AUTHORISED') and v_run.reserved_usd = 0
     and (v_run.request_count >= v_run.max_requests or v_run.settled_usd >= v_run.budget_usd) then
    update public.ai_execution_runs
      set status = 'EXHAUSTED',
          terminated_reason = case when v_run.settled_usd >= v_run.budget_usd then 'budget_limit' else 'request_limit' end,
          closed_at = now(), updated_at = now()
      where run_reference = v_run.run_reference
      returning * into v_run;
    perform public.ai_exec_event(v_run.run_reference, p_reservation_id, v_run.organisation_id, 'RUN_TERMINATED_LIMIT', 'system',
      jsonb_build_object('reason', v_run.terminated_reason));
  end if;

  perform public.ai_exec_event(v_run.run_reference, p_reservation_id, v_run.organisation_id,
    case when coalesce(p_provider_ok, false) then 'SETTLED' else 'SETTLED_FAILED' end, null,
    jsonb_build_object('actualUsd', v_actual, 'usageKnown', v_known, 'providerRequestId', p_provider_request_id));

  return jsonb_build_object('ok', true, 'reservationId', p_reservation_id, 'actualUsd', v_actual,
    'reserveUsd', v_row.reserve_usd, 'releasedUnusedUsd', greatest(0, v_row.reserve_usd - v_actual),
    'settledUsd', v_run.settled_usd, 'reservedUsd', v_run.reserved_usd, 'requestCount', v_run.request_count,
    'budgetUsd', v_run.budget_usd, 'providerOk', coalesce(p_provider_ok, false), 'usageKnown', v_known,
    'overReserve', v_actual > v_row.reserve_usd, 'runStatus', v_run.status);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- operator recovery for a run reservation (registered operator, reason, evidence) - one per reservation
-- ---------------------------------------------------------------------------------------------
create or replace function public.recover_ai_execution_reservation(
  p_reservation_id uuid,
  p_actor text,
  p_reason text,
  p_resolution text default 'ASSUME_MAX',
  p_actual_usd numeric default null,
  p_evidence text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.lab_ai_spend_reservations%rowtype;
  v_actual numeric(12, 6);
  v_verified boolean;
begin
  if p_reservation_id is null or p_actor is null or length(trim(p_actor)) < 3
     or p_reason is null or length(trim(p_reason)) < 20
     or p_resolution not in ('ASSUME_MAX', 'VERIFIED_USAGE') then
    return jsonb_build_object('ok', false, 'code', 'LAB_SPEND_RECOVERY_REJECTED', 'failClosed', true);
  end if;
  if not exists (select 1 from public.lab_ai_spend_operators o where o.actor = trim(p_actor) and o.revoked_at is null) then
    return jsonb_build_object('ok', false, 'code', 'LAB_SPEND_RECOVERY_NOT_AUTHORISED', 'failClosed', true);
  end if;
  v_verified := p_resolution = 'VERIFIED_USAGE';
  if v_verified and (p_actual_usd is null or p_actual_usd < 0 or p_evidence is null or length(trim(p_evidence)) < 20) then
    return jsonb_build_object('ok', false, 'code', 'LAB_SPEND_RECOVERY_REJECTED', 'failClosed', true);
  end if;

  select * into v_row from public.lab_ai_spend_reservations where id = p_reservation_id and run_reference is not null for update;
  if not found or v_row.status <> 'RESERVED' then
    return jsonb_build_object('ok', false, 'code', 'LAB_SPEND_RECOVERY_NOT_OPEN', 'failClosed', true);
  end if;
  if v_row.provider_deadline_at is not null and now() < v_row.provider_deadline_at then
    return jsonb_build_object('ok', false, 'code', 'LAB_SPEND_RECOVERY_PROVIDER_MAY_BE_ACTIVE', 'failClosed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai-exec:run:' || v_row.run_reference, 0));
  v_actual := case when v_verified then greatest(0, p_actual_usd) else v_row.reserve_usd end;

  update public.lab_ai_spend_reservations
    set status = 'FAILED', actual_usd = v_actual, usage_known = v_verified, provider_ok = false, settled_at = now()
    where id = p_reservation_id;
  update public.ai_execution_runs
    set reserved_usd = greatest(0, reserved_usd - v_row.reserve_usd),
        settled_usd = settled_usd + v_actual, failed_count = failed_count + 1, updated_at = now()
    where run_reference = v_row.run_reference;
  insert into public.lab_ai_spend_recoveries (
    reservation_id, scope_key, actor, reason, released_reserve_usd, settled_actual_usd, usage_observed,
    resolution, evidence, provider_deadline_at)
  values (p_reservation_id, v_row.scope_key, trim(p_actor), trim(p_reason), greatest(0, v_row.reserve_usd - v_actual),
    v_actual, v_verified, p_resolution, nullif(trim(coalesce(p_evidence, '')), ''), v_row.provider_deadline_at);
  perform public.ai_exec_event(v_row.run_reference, p_reservation_id, v_row.organisation_id, 'OPERATOR_RECOVERED', trim(p_actor),
    jsonb_build_object('resolution', p_resolution, 'actualUsd', v_actual));
  return jsonb_build_object('ok', true, 'reservationId', p_reservation_id, 'settledActualUsd', v_actual);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- close / revoke a run
-- ---------------------------------------------------------------------------------------------
create or replace function public.terminate_ai_execution_run(
  p_run_reference text, p_actor text, p_reason text, p_status text default 'CLOSED'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_run public.ai_execution_runs%rowtype;
begin
  if p_status not in ('CLOSED', 'REVOKED') or p_actor is null or length(trim(p_actor)) < 3
     or p_reason is null or length(trim(p_reason)) < 10 then
    return jsonb_build_object('ok', false, 'code', 'AI_RUN_TERMINATION_INVALID', 'failClosed', true);
  end if;
  select * into v_run from public.ai_execution_runs where run_reference = p_run_reference for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'AI_RUN_NOT_AUTHORISED', 'failClosed', true); end if;
  if v_run.status in ('CLOSED', 'REVOKED', 'EXPIRED', 'EXHAUSTED') then
    return jsonb_build_object('ok', true, 'reused', true, 'status', v_run.status);
  end if;
  update public.ai_execution_runs
    set status = p_status, terminated_reason = p_reason, closed_at = now(), updated_at = now()
    where run_reference = p_run_reference;
  perform public.ai_exec_event(p_run_reference, null, v_run.organisation_id, 'RUN_' || p_status, trim(p_actor),
    jsonb_build_object('reason', p_reason, 'openReservedUsd', v_run.reserved_usd));
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- grants: service_role only
-- ---------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.ai_exec_event(text, uuid, text, text, text, jsonb)',
    'public.ai_exec_window_usage(text, timestamptz, timestamptz)',
    'public.authorise_ai_execution_run(text, text, numeric, integer, timestamptz, timestamptz, text, text)',
    'public.set_ai_execution_limit(text, text, numeric, integer, timestamptz, timestamptz, text)',
    'public.reconcile_interrupted_ai_executions(text)',
    'public.reserve_ai_execution_run(text, text, numeric, text, text, text, text, jsonb, integer, text)',
    'public.settle_ai_execution_run(uuid, numeric, integer, integer, boolean, integer, integer, integer, text, boolean, jsonb)',
    'public.recover_ai_execution_reservation(uuid, text, text, text, numeric, text)',
    'public.terminate_ai_execution_run(text, text, text, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.ai_execution_runs, public.ai_execution_limits, public.ai_execution_ledger_events from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.ai_execution_runs, public.ai_execution_limits, public.ai_execution_ledger_events from authenticated;
  end if;
end;
$$;
