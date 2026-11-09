import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type TenantNotificationType =
  | 'ASSIGNMENT'
  | 'APPROVAL_REQUEST'
  | 'DEADLINE'
  | 'TRIAGE'
  | 'WORKFLOW'
  | 'OPERATIONAL'
  | 'AI_REVIEW';

export type TenantNotificationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TenantNotificationRow = {
  id: string;
  organisation_id: string;
  recipient_user_id: string | null;
  notification_type: TenantNotificationType;
  severity: TenantNotificationSeverity;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  link_path: string | null;
  read_at: string | null;
  read_by_user_id: string | null;
  created_by_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export async function createTenantNotification(
  _supabase: SupabaseClient,
  params: {
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
  },
): Promise<TenantNotificationRow> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error('notification_service_unavailable');

  const { data, error } = await admin
    .from('tenant_notifications')
    .insert({
      organisation_id: params.organisationId,
      recipient_user_id: params.recipientUserId ?? null,
      notification_type: params.notificationType,
      severity: params.severity ?? 'MEDIUM',
      title: params.title,
      message: params.message,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      link_path: params.linkPath ?? null,
      created_by_user_id: params.createdByUserId,
      payload: params.payload ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenantNotificationRow;
}

/**
 * Best-effort fan-out — prefer fanOutTenantNotification (retry queue + workflow-safe).
 * @deprecated
 */
export async function tryCreateTenantNotification(
  supabase: SupabaseClient,
  params: Parameters<typeof createTenantNotification>[1],
): Promise<TenantNotificationRow | null> {
  try {
    return await createTenantNotification(supabase, params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tenant-notifications] fan_out_skipped', {
      notificationType: params.notificationType,
      organisationId: params.organisationId,
      entityId: params.entityId ?? null,
      reason: message,
    });
    return null;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Max tenant notification rows scanned per Attention Centre search (paginated). */
export const NOTIFICATION_SEARCH_SCAN_CAP = 5000;
export const NOTIFICATION_SEARCH_PAGE_SIZE = 500;

export type ListTenantNotificationOptions = {
  limit?: number;
  unreadOnly?: boolean;
  severity?: TenantNotificationSeverity | null;
  notificationType?: TenantNotificationType | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  sortAsc?: boolean;
  fetchLimit?: number;
  offset?: number;
  entityId?: string | null;
};

export async function listTenantNotifications(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  options: ListTenantNotificationOptions = {},
): Promise<Array<TenantNotificationRow & { effectiveRead: boolean }>> {
  const limit = Math.min(options.fetchLimit ?? options.limit ?? 100, 500);
  const offset = Math.max(options.offset ?? 0, 0);
  let query = supabase
    .from('tenant_notifications')
    .select('*')
    .eq('organisation_id', organisationId)
    .or(`recipient_user_id.is.null,recipient_user_id.eq.${userId}`);

  if (options.notificationType) {
    query = query.eq('notification_type', options.notificationType);
  }
  if (options.severity) {
    query = query.eq('severity', options.severity);
  }
  if (options.dateFrom) {
    query = query.gte('created_at', `${options.dateFrom}T00:00:00.000Z`);
  }
  if (options.dateTo) {
    query = query.lte('created_at', `${options.dateTo}T23:59:59.999Z`);
  }
  if (options.entityId) {
    query = query.eq('entity_id', options.entityId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: options.sortAsc === true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as TenantNotificationRow[];
  const broadcastIds = rows.filter((r) => !r.recipient_user_id).map((r) => r.id);
  let receiptIds = new Set<string>();
  if (broadcastIds.length) {
    const { data: receipts } = await supabase
      .from('tenant_notification_read_receipts')
      .select('notification_id')
      .eq('organisation_id', organisationId)
      .eq('clerk_user_id', userId)
      .in('notification_id', broadcastIds);
    receiptIds = new Set((receipts ?? []).map((r) => r.notification_id as string));
  }
  const enriched = rows.map((row) => {
    const effectiveRead = row.recipient_user_id
      ? Boolean(row.read_at)
      : receiptIds.has(row.id);
    return { ...row, effectiveRead };
  });
  if (options.unreadOnly) {
    return enriched.filter((r) => !r.effectiveRead);
  }
  return enriched;
}

/**
 * Load tenant notifications for Attention Centre search.
 * Search text matching runs in the lab API layer — not via PostgREST ilike on uuid/enum columns.
 */
export async function listTenantNotificationsForAttentionSearch(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  options: ListTenantNotificationOptions & { search?: string | null },
): Promise<Array<TenantNotificationRow & { effectiveRead: boolean }>> {
  const search = options.search?.trim() || null;
  const { search: _drop, ...base } = options;

  if (!search) {
    return listTenantNotifications(supabase, organisationId, userId, base);
  }

  if (UUID_RE.test(search)) {
    return listTenantNotifications(supabase, organisationId, userId, {
      ...base,
      entityId: search,
      fetchLimit: 100,
      offset: 0,
    });
  }

  const all: Array<TenantNotificationRow & { effectiveRead: boolean }> = [];
  for (let off = 0; off < NOTIFICATION_SEARCH_SCAN_CAP; off += NOTIFICATION_SEARCH_PAGE_SIZE) {
    const chunk = await listTenantNotifications(supabase, organisationId, userId, {
      ...base,
      fetchLimit: NOTIFICATION_SEARCH_PAGE_SIZE,
      offset: off,
    });
    all.push(...chunk);
    if (chunk.length < NOTIFICATION_SEARCH_PAGE_SIZE) break;
  }
  return all;
}

export async function markTenantNotificationRead(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  notificationId: string,
): Promise<TenantNotificationRow> {
  const { data: existing, error: fetchErr } = await supabase
    .from('tenant_notifications')
    .select('*')
    .eq('id', notificationId)
    .eq('organisation_id', organisationId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error('not_found');
  const row = existing as TenantNotificationRow;
  if (row.recipient_user_id && row.recipient_user_id !== userId) {
    throw new Error('forbidden');
  }

  if (!row.recipient_user_id) {
    const { error: receiptErr } = await supabase.from('tenant_notification_read_receipts').upsert(
      {
        notification_id: notificationId,
        organisation_id: organisationId,
        clerk_user_id: userId,
        read_at: new Date().toISOString(),
      },
      { onConflict: 'notification_id,clerk_user_id' },
    );
    if (receiptErr) throw new Error(receiptErr.message);
    return row;
  }

  if (row.read_at) return row;

  const { data, error } = await supabase
    .from('tenant_notifications')
    .update({ read_at: new Date().toISOString(), read_by_user_id: userId })
    .eq('id', notificationId)
    .eq('organisation_id', organisationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenantNotificationRow;
}

export async function countUnreadTenantNotifications(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
): Promise<number> {
  const rows = await listTenantNotifications(supabase, organisationId, userId, { limit: 200 });
  return rows.filter((r) => !r.effectiveRead).length;
}

/** Map legacy AI notification_events into Attention Centre rows (read-only merge). */
export async function listAiNotificationEventsForTenant(
  supabase: SupabaseClient,
  organisationId: string,
  limit = 50,
): Promise<
  Array<{
    id: string;
    notificationType: 'AI_REVIEW';
    severity: TenantNotificationSeverity;
    title: string;
    message: string;
    entityType: string | null;
    entityId: string | null;
    linkPath: string | null;
    readAt: string | null;
    createdAt: string;
    source: 'notification_events';
  }>
> {
  const { data, error } = await supabase
    .from('notification_events')
    .select('id, event_type, publication_id, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit * 3, 150));
  if (error) {
    if (error.message.includes('permission') || error.code === '42501') return [];
    throw new Error(error.message);
  }
  const rows = (data ?? []).filter((r) => {
    const eventType = String(r.event_type ?? '');
    if (!eventType.startsWith('AI_')) return false;
    const p = r.payload as Record<string, unknown> | null;
    return p?.organisation_id === organisationId;
  }).slice(0, limit);
  return rows.map((r) => {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    const title = String(p.title ?? r.event_type ?? 'AI notification');
    const message = String(p.message ?? p.summary ?? 'AI workflow event');
    return {
      id: `ai-event:${r.id}`,
      notificationType: 'AI_REVIEW' as const,
      severity: 'MEDIUM' as TenantNotificationSeverity,
      title,
      message,
      entityType: r.publication_id ? 'publication' : null,
      entityId: r.publication_id,
      linkPath: r.publication_id ? `#/publication/${r.publication_id}` : '#/ai-governance',
      readAt: null,
      createdAt: r.created_at,
      source: 'notification_events' as const,
    };
  });
}
