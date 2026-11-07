import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  createTenantNotification,
  type TenantNotificationRow,
  type TenantNotificationSeverity,
  type TenantNotificationType,
} from '@/lib/ri/services/tenant-notifications';

export const TENANT_NOTIFICATION_FANOUT_RETRY_EVENT = 'TENANT_NOTIFICATION_FANOUT_RETRY_PENDING';

export type TenantNotificationFanOutParams = {
  organisationId: string;
  createdByUserId: string;
  recipientUserId?: string | null;
  notificationType: TenantNotificationType;
  severity?: TenantNotificationSeverity;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  linkPath?: string | null;
  payload?: Record<string, unknown>;
  /** Correlates fan-out with workflow entity (e.g. impact_assessment id). */
  workflowEntityType?: string | null;
  workflowEntityId?: string | null;
};

export type TenantNotificationFanOutResult =
  | { ok: true; delivered: true; notification: TenantNotificationRow }
  | { ok: true; delivered: false; retryQueued: true; retryEventId: string }
  | { ok: false; delivered: false; retryQueued: false; reason: string };

function buildRetryDedupeKey(params: TenantNotificationFanOutParams): string {
  return [
    params.organisationId,
    params.notificationType,
    params.entityType ?? '',
    params.entityId ?? '',
    params.workflowEntityId ?? '',
  ].join(':');
}

async function queueFanOutRetry(
  params: TenantNotificationFanOutParams,
  failureReason: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error('[tenant-notifications] retry_queue_unavailable', {
      reason: 'admin_client_unavailable',
      organisationId: params.organisationId,
      entityId: params.entityId ?? null,
    });
    return null;
  }

  const dedupeKey = buildRetryDedupeKey(params);
  const { data, error } = await admin
    .from('ingestion_operational_events')
    .insert({
      event_type: TENANT_NOTIFICATION_FANOUT_RETRY_EVENT,
      actor_user_id: params.createdByUserId,
      metadata: {
        dedupeKey,
        retryEligible: true,
        failureReason,
        queuedAt: new Date().toISOString(),
        fanOut: {
          organisationId: params.organisationId,
          notificationType: params.notificationType,
          severity: params.severity ?? 'MEDIUM',
          title: params.title,
          message: params.message,
          entityType: params.entityType ?? null,
          entityId: params.entityId ?? null,
          linkPath: params.linkPath ?? null,
          createdByUserId: params.createdByUserId,
          recipientUserId: params.recipientUserId ?? null,
          payload: params.payload ?? {},
          workflowEntityType: params.workflowEntityType ?? null,
          workflowEntityId: params.workflowEntityId ?? null,
        },
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('[tenant-notifications] retry_queue_insert_failed', {
      organisationId: params.organisationId,
      dedupeKey,
      reason: error.message,
    });
    return null;
  }

  return data.id as string;
}

/**
 * Deliver tenant notification via service role; on failure queue monitored retry (does not fail workflow HTTP).
 */
export async function fanOutTenantNotification(
  supabase: SupabaseClient,
  params: TenantNotificationFanOutParams,
): Promise<TenantNotificationFanOutResult> {
  try {
    const notification = await createTenantNotification(supabase, params);
    return { ok: true, delivered: true, notification };
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    console.error('[tenant-notifications] fan_out_failed', {
      notificationType: params.notificationType,
      organisationId: params.organisationId,
      entityId: params.entityId ?? null,
      reason: failureReason,
    });
    const retryEventId = await queueFanOutRetry(params, failureReason);
    if (retryEventId) {
      return { ok: true, delivered: false, retryQueued: true, retryEventId };
    }
    return { ok: false, delivered: false, retryQueued: false, reason: failureReason };
  }
}

export async function retryPendingTenantNotificationFanOuts(limit = 25): Promise<{
  attempted: number;
  delivered: number;
  stillPending: number;
}> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { attempted: 0, delivered: 0, stillPending: 0 };
  }

  const { data: pending, error } = await admin
    .from('ingestion_operational_events')
    .select('id, metadata')
    .eq('event_type', TENANT_NOTIFICATION_FANOUT_RETRY_EVENT)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !pending?.length) {
    return { attempted: 0, delivered: 0, stillPending: 0 };
  }

  let attempted = 0;
  let delivered = 0;
  let stillPending = 0;

  for (const row of pending) {
    const meta = row.metadata as {
      fanOut?: TenantNotificationFanOutParams;
      resolvedAt?: string;
    } | null;
    if (meta?.resolvedAt || !meta?.fanOut) continue;

    const fanOut = meta.fanOut;
    attempted++;
    try {
      await createTenantNotification(admin, fanOut);
      delivered++;
      await admin
        .from('ingestion_operational_events')
        .update({
          metadata: {
            ...meta,
            resolvedAt: new Date().toISOString(),
            retryEligible: false,
            lastRetryResult: 'delivered',
          },
        })
        .eq('id', row.id);
    } catch (err) {
      stillPending++;
      const reason = err instanceof Error ? err.message : String(err);
      await admin
        .from('ingestion_operational_events')
        .update({
          metadata: {
            ...meta,
            lastRetryAt: new Date().toISOString(),
            lastRetryResult: 'failed',
            lastRetryReason: reason,
            retryEligible: true,
          },
        })
        .eq('id', row.id);
    }
  }

  return { attempted, delivered, stillPending };
}
