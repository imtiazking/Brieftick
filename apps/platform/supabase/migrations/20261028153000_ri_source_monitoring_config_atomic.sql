-- Step 83D.1 — Canonical atomic monitoring configuration + audit (RPC-only mutation path).
-- Do not apply to staging without explicit approval.
-- Supersedes 83C.2 direct INSERT/UPDATE policies on regulatory_source_operations.
-- Does NOT grant DELETE on regulatory_source_operations.

-- ---------------------------------------------------------------------------
-- 1. Eliminate direct PostgREST write path (configuration must use RPC)
-- ---------------------------------------------------------------------------
drop policy if exists regulatory_source_operations_insert_platform_operator on public.regulatory_source_operations;
drop policy if exists regulatory_source_operations_update_platform_operator on public.regulatory_source_operations;

revoke insert, update, delete on table public.regulatory_source_operations from public;
revoke insert, update, delete on table public.regulatory_source_operations from anon;
revoke insert, update, delete on table public.regulatory_source_operations from authenticated;

grant select on table public.regulatory_source_operations to authenticated;

-- Configuration audit rows must not be inserted outside the atomic RPC.
drop policy if exists ingestion_operational_events_insert_platform_operator on public.ingestion_operational_events;
create policy ingestion_operational_events_insert_platform_operator
on public.ingestion_operational_events
for insert
with check (
  public.is_platform_operator()
  and event_type::text <> 'SOURCE_MONITORING_CONFIGURATION'
);

-- ---------------------------------------------------------------------------
-- 2. Atomic configuration RPC (SECURITY DEFINER, operator-validated)
-- ---------------------------------------------------------------------------
create or replace function public.apply_source_monitoring_configuration_with_audit(
  p_source_external_key text,
  p_source_id uuid,
  p_operator_user_id text,
  p_correlation_id text,
  p_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev public.regulatory_source_operations%rowtype;
  v_new public.regulatory_source_operations%rowtype;
  v_action text;
  v_prev_json jsonb;
  v_new_json jsonb;
  v_meta jsonb;
  v_now timestamptz := clock_timestamp();
  v_caller text := public.current_clerk_user_id();
begin
  if v_caller is null or char_length(trim(v_caller)) = 0 then
    raise exception 'clerk_identity_required' using errcode = '42501';
  end if;

  if not public.is_platform_operator() then
    raise exception 'platform_operator_required' using errcode = '42501';
  end if;

  if p_operator_user_id is null or char_length(trim(p_operator_user_id)) = 0 then
    raise exception 'operator_user_id_required';
  end if;

  if p_operator_user_id <> v_caller then
    raise exception 'operator_user_id_mismatch' using errcode = '42501';
  end if;

  if p_correlation_id is null or char_length(trim(p_correlation_id)) = 0 then
    raise exception 'correlation_id_required';
  end if;

  if not exists (
    select 1
    from public.regulatory_sources s
    where s.id = p_source_id
      and s.external_key = p_source_external_key
  ) then
    raise exception 'source_not_found';
  end if;

  select o.*
  into v_prev
  from public.regulatory_source_operations o
  where o.source_id = p_source_id;

  if found then
    v_action := 'UPDATE';
    v_prev_json := jsonb_build_object(
      'enabled', v_prev.enabled,
      'ingestion_mode', v_prev.ingestion_mode,
      'schedule_type', v_prev.schedule_type,
      'interval_minutes', v_prev.interval_minutes,
      'cron_expression', v_prev.cron_expression,
      'timezone', v_prev.timezone,
      'max_items_per_run', v_prev.max_items_per_run,
      'timeout_seconds', v_prev.timeout_seconds,
      'max_retries', v_prev.max_retries,
      'retry_backoff_seconds', v_prev.retry_backoff_seconds,
      'consecutive_failure_threshold', v_prev.consecutive_failure_threshold,
      'stale_after_minutes', v_prev.stale_after_minutes,
      'next_run_at', v_prev.next_run_at,
      'health_status', v_prev.health_status
    );
  else
    v_action := 'INSERT';
    v_prev_json := null;
  end if;

  insert into public.regulatory_source_operations as o (
    source_id,
    enabled,
    ingestion_mode,
    schedule_type,
    interval_minutes,
    cron_expression,
    timezone,
    max_items_per_run,
    timeout_seconds,
    max_retries,
    retry_backoff_seconds,
    consecutive_failure_threshold,
    stale_after_minutes,
    next_run_at,
    health_status
  ) values (
    p_source_id,
    coalesce((p_config->>'enabled')::boolean, false),
    coalesce(
      (p_config->>'ingestion_mode')::public.source_ingestion_mode,
      'DISABLED'::public.source_ingestion_mode
    ),
    coalesce(
      (p_config->>'schedule_type')::public.schedule_type,
      'MANUAL_ONLY'::public.schedule_type
    ),
    nullif(p_config->>'interval_minutes', '')::int,
    nullif(p_config->>'cron_expression', ''),
    coalesce(nullif(p_config->>'timezone', ''), 'UTC'),
    coalesce((p_config->>'max_items_per_run')::int, 3),
    coalesce((p_config->>'timeout_seconds')::int, 120),
    coalesce((p_config->>'max_retries')::int, 3),
    coalesce((p_config->>'retry_backoff_seconds')::int, 60),
    coalesce((p_config->>'consecutive_failure_threshold')::int, 3),
    coalesce((p_config->>'stale_after_minutes')::int, 10080),
    nullif(p_config->>'next_run_at', '')::timestamptz,
    coalesce(
      (p_config->>'health_status')::public.source_health_status,
      'UNKNOWN'::public.source_health_status
    )
  )
  on conflict (source_id) do update set
    enabled = excluded.enabled,
    ingestion_mode = excluded.ingestion_mode,
    schedule_type = excluded.schedule_type,
    interval_minutes = excluded.interval_minutes,
    cron_expression = excluded.cron_expression,
    timezone = excluded.timezone,
    max_items_per_run = excluded.max_items_per_run,
    timeout_seconds = excluded.timeout_seconds,
    max_retries = excluded.max_retries,
    retry_backoff_seconds = excluded.retry_backoff_seconds,
    consecutive_failure_threshold = excluded.consecutive_failure_threshold,
    stale_after_minutes = excluded.stale_after_minutes,
    next_run_at = excluded.next_run_at,
    updated_at = v_now
  returning o.* into v_new;

  v_new_json := jsonb_build_object(
    'enabled', v_new.enabled,
    'ingestion_mode', v_new.ingestion_mode,
    'schedule_type', v_new.schedule_type,
    'interval_minutes', v_new.interval_minutes,
    'cron_expression', v_new.cron_expression,
    'timezone', v_new.timezone,
    'max_items_per_run', v_new.max_items_per_run,
    'timeout_seconds', v_new.timeout_seconds,
    'max_retries', v_new.max_retries,
    'retry_backoff_seconds', v_new.retry_backoff_seconds,
    'consecutive_failure_threshold', v_new.consecutive_failure_threshold,
    'stale_after_minutes', v_new.stale_after_minutes,
    'next_run_at', v_new.next_run_at,
    'health_status', v_new.health_status,
    'last_success_at', v_new.last_success_at,
    'last_failure_at', v_new.last_failure_at
  );

  v_meta := jsonb_build_object(
    'sourceExternalKey', p_source_external_key,
    'sourceUuid', p_source_id,
    'action', v_action,
    'previousConfiguration', v_prev_json,
    'newConfiguration', v_new_json,
    'operatorUserId', p_operator_user_id,
    'correlationId', p_correlation_id,
    'outcome', 'SUCCESS',
    'recordedAt', v_now
  );

  insert into public.ingestion_operational_events (
    event_type,
    source_id,
    actor_user_id,
    metadata
  ) values (
    'SOURCE_MONITORING_CONFIGURATION',
    p_source_id,
    p_operator_user_id,
    v_meta
  );

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'source_id', p_source_id,
    'configuration', v_new_json
  );
end;
$$;

revoke all on function public.apply_source_monitoring_configuration_with_audit(
  text, uuid, text, text, jsonb
) from public;

revoke all on function public.apply_source_monitoring_configuration_with_audit(
  text, uuid, text, text, jsonb
) from anon;

grant execute on function public.apply_source_monitoring_configuration_with_audit(
  text, uuid, text, text, jsonb
) to authenticated;

comment on function public.apply_source_monitoring_configuration_with_audit is
  'Atomically upserts regulatory_source_operations and records SOURCE_MONITORING_CONFIGURATION audit. Authenticated platform operators only; direct table writes are revoked.';
