import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapTenantNotificationToLabView } from '@/lib/ri/lab-api/lab-notification-view';
import type { LabNotificationView } from '@/lib/ri/lab-api/lab-notification-view';
import { applyLabNotificationQueryFilters, parseLabNotificationQuery } from '@/lib/ri/lab-api/lab-notification-query';
import {
  countUnreadTenantNotifications,
  listAiNotificationEventsForTenant,
  listTenantNotificationsForAttentionSearch,
  markTenantNotificationRead,
  type TenantNotificationType,
} from '@/lib/ri/services/tenant-notifications';

export const dynamic = 'force-dynamic';

function hasActiveFilters(query: ReturnType<typeof parseLabNotificationQuery>): boolean {
  return Boolean(
    query.search ||
      query.type ||
      query.status !== 'all' ||
      query.severity ||
      query.dateFrom ||
      query.dateTo ||
      query.sort === 'oldest' ||
      query.offset > 0,
  );
}

function includeAiEvents(query: ReturnType<typeof parseLabNotificationQuery>): boolean {
  if (!query.type) return true;
  return query.type === 'AI_REVIEW';
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const url = new URL(request.url);
    const query = parseLabNotificationQuery(url);
    const filteredMode = hasActiveFilters(query);

    const tenantType: TenantNotificationType | null =
      query.type && query.type !== 'AI_REVIEW' ? query.type : null;

    let rows;
    try {
      rows = await listTenantNotificationsForAttentionSearch(ctx.supabase, ctx.organisationId, ctx.userId, {
        fetchLimit: query.search ? undefined : Math.min(query.limit + query.offset, 500),
        notificationType: tenantType,
        severity: query.severity,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        search: query.search,
        sortAsc: query.sort === 'oldest',
      });
    } catch (loadErr) {
      if (query.search) {
        console.error('[ri-lab] notification_search_failed', loadErr instanceof Error ? loadErr.message.slice(0, 200) : 'unknown');
        throw new Error('notification_search_failed');
      }
      throw loadErr;
    }
    const tenantNotes = rows.map((row) =>
      mapTenantNotificationToLabView(row, { read: row.effectiveRead }),
    );

    let notifications: LabNotificationView[] = [...tenantNotes];
    if (includeAiEvents(query)) {
      const aiNotes = await listAiNotificationEventsForTenant(ctx.supabase, ctx.organisationId, 120);
      const aiMapped: LabNotificationView[] = aiNotes.map((n) => ({
        id: n.id,
        severity: n.severity === 'CRITICAL' ? 'Critical' : n.severity === 'HIGH' ? 'High' : 'Medium',
        type: 'AI review',
        entityType: n.entityType ?? '—',
        entityId: n.entityId ?? '—',
        at: n.createdAt,
        title: n.title,
        message: n.message,
        href: n.linkPath ?? '#/ai-governance',
        read: false,
        recipientUserId: null,
        source: 'notification_events',
        _connected: true,
      }));
      notifications = [...tenantNotes, ...aiMapped];
    }

    let totalMatching = notifications.length;
    let page = notifications;

    if (filteredMode) {
      const applied = applyLabNotificationQueryFilters(notifications, query);
      page = applied.notifications;
      totalMatching = applied.totalMatching;
    } else {
      page = [...notifications]
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
        .slice(0, query.limit);
      totalMatching = notifications.length;
    }

    const unreadCount =
      (await countUnreadTenantNotifications(ctx.supabase, ctx.organisationId, ctx.userId)) +
      (await listAiNotificationEventsForTenant(ctx.supabase, ctx.organisationId, 30)).length;

    return NextResponse.json({
      ok: true,
      tenantScope: true,
      notifications: page,
      filteredCount: page.length,
      totalMatching,
      unreadCount,
      query: {
        q: query.search,
        type: query.type ?? 'all',
        status: query.status,
        severity: query.severity ?? 'all',
        from: query.dateFrom,
        to: query.dateTo,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
      externalDeliveryDisabled: true,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const body = (await request.json()) as { notificationId?: string; action?: string };
    if (body.action !== 'mark_read' || !body.notificationId) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    if (String(body.notificationId).startsWith('ai-event:')) {
      return NextResponse.json({
        ok: true,
        note: 'AI notification_events are read-only history; mark read applies to tenant_notifications only.',
      });
    }
    const row = await markTenantNotificationRead(
      ctx.supabase,
      ctx.organisationId,
      ctx.userId,
      body.notificationId,
    );
    return NextResponse.json({ ok: true, notification: mapTenantNotificationToLabView(row) });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
