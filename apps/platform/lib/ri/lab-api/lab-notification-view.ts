import type { TenantNotificationRow } from '@/lib/ri/services/tenant-notifications';

export type LabNotificationView = {
  id: string;
  severity: string;
  type: string;
  entityType: string;
  entityId: string;
  at: string;
  message: string;
  title: string;
  href: string;
  read: boolean;
  recipientUserId: string | null;
  source: 'tenant_notifications' | 'notification_events';
  _connected: true;
};

export function mapTenantNotificationToLabView(
  row: TenantNotificationRow,
  opts?: { read?: boolean },
): LabNotificationView {
  const href = row.link_path?.startsWith('#')
    ? row.link_path
    : row.entity_type && row.entity_id
      ? `#/${entityPath(row.entity_type)}/${row.entity_id}`
      : '#/notifications';
  return {
    id: row.id,
    severity: severityLabel(row.severity),
    type: humanType(row.notification_type),
    entityType: row.entity_type ?? '—',
    entityId: row.entity_id ?? '—',
    at: row.created_at,
    title: row.title,
    message: row.message,
    href,
    read: opts?.read ?? Boolean(row.read_at),
    recipientUserId: row.recipient_user_id,
    source: 'tenant_notifications',
    _connected: true,
  };
}

function severityLabel(s: string): string {
  const m: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
  };
  return m[s] ?? s;
}

function humanType(t: string): string {
  return t
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function entityPath(entityType: string): string {
  const m: Record<string, string> = {
    publication: 'publication',
    organisation_publication: 'intake',
    regulatory_change: 'change',
    impact_assessment: 'assessment',
    applicability_assessment: 'applicability',
  };
  return m[entityType] ?? 'dashboard';
}
