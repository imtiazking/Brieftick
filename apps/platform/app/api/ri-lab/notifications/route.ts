import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapTenantNotificationToLabView } from '@/lib/ri/lab-api/lab-notification-view';
import {
  listAiNotificationEventsForTenant,
  listTenantNotifications,
  markTenantNotificationRead,
} from '@/lib/ri/services/tenant-notifications';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === '1';
    const rows = await listTenantNotifications(ctx.supabase, ctx.organisationId, ctx.userId, {
      unreadOnly,
      limit: 100,
    });
    const tenantNotes = rows.map((row) =>
      mapTenantNotificationToLabView(row, { read: row.effectiveRead }),
    );
    const aiNotes = await listAiNotificationEventsForTenant(ctx.supabase, ctx.organisationId, 30);
    const notifications = [
      ...tenantNotes,
      ...aiNotes.map((n) => ({
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
        source: 'notification_events' as const,
        _connected: true as const,
      })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

    const unreadCount = tenantNotes.filter((n) => !n.read).length + aiNotes.length;

    return NextResponse.json({
      ok: true,
      tenantScope: true,
      notifications,
      unreadCount,
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
