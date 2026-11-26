-- Run ledger hardening: an in-flight reservation can no longer be re-issued to a second caller.
-- Supersedes the 'reused' branch of reserve_ai_execution_run (20261126180000) which allowed two concurrent callers
-- (double click, parallel retries) to both call the provider against one reservation.
-- Replaces the function in place; grants are preserved and restated below.

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
      -- A second caller must never receive permission to call the provider against a reservation that already
      -- authorised a call: that would be unmetered spend. The first call settles, or the provider window ends and
      -- the interrupted-execution reconciliation charges it at the full reserve.
      perform public.ai_exec_event(v_run.run_reference, v_existing.id, v_run.organisation_id, 'DUPLICATE_BLOCKED_IN_FLIGHT', null,
        jsonb_build_object('idempotencyKey', p_idempotency_key, 'providerDeadlineAt', v_existing.provider_deadline_at));
      return jsonb_build_object('ok', false, 'code', 'AI_RESERVATION_IN_FLIGHT',
        'message', 'A provider call with this idempotency key is already in flight for this run.', 'failClosed', true,
        'providerDeadlineAt', v_existing.provider_deadline_at);
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

revoke all on function public.reserve_ai_execution_run(text, text, numeric, text, text, text, text, jsonb, integer, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.reserve_ai_execution_run(text, text, numeric, text, text, text, text, jsonb, integer, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.reserve_ai_execution_run(text, text, numeric, text, text, text, text, jsonb, integer, text) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reserve_ai_execution_run(text, text, numeric, text, text, text, text, jsonb, integer, text) to service_role;
  end if;
end;
$$;
