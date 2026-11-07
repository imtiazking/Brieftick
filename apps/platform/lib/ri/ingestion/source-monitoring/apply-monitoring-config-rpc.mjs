import { ATOMIC_MONITORING_RPC_NAME } from './monitoring-config-atomic.mjs';

/**
 * Invoke atomic monitoring configuration RPC via Supabase client.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 */
export async function callApplyMonitoringConfigurationRpc(supabase, params) {
  const { data, error } = await supabase.rpc(ATOMIC_MONITORING_RPC_NAME, {
    p_source_external_key: params.sourceExternalKey,
    p_source_id: params.sourceUuid,
    p_operator_user_id: params.operatorUserId,
    p_correlation_id: params.correlationId,
    p_config: params.configRow,
  });

  if (error) {
    const code = error.message || '';
    if (code.includes('platform_operator_required') || code.includes('42501')) {
      return { ok: false, error: 'platform_operator_required', detail: error.message };
    }
    if (code.includes('Could not find the function') || code.includes('schema cache')) {
      return { ok: false, error: 'atomic_rpc_unavailable', detail: error.message };
    }
    return { ok: false, error: 'atomic_persist_failed', detail: error.message };
  }

  const payload = data;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: 'atomic_persist_failed', detail: 'unexpected_rpc_payload' };
  }

  return {
    ok: true,
    action: payload.action,
    row: payload.configuration ?? null,
    sourceId: payload.source_id,
  };
}
