import 'server-only';

import type { TenantNotificationSeverity, TenantNotificationType } from '@/lib/ri/services/tenant-notifications';
import type { LabNotificationView } from '@/lib/ri/lab-api/lab-notification-view';

export type LabNotificationQuery = {
  search: string | null;
  type: TenantNotificationType | 'AI_REVIEW' | null;
  status: 'all' | 'unread' | 'read';
  severity: TenantNotificationSeverity | null;
  dateFrom: string | null;
  dateTo: string | null;
  sort: 'newest' | 'oldest';
  limit: number;
  offset: number;
};

const TYPE_ALIASES: Record<string, TenantNotificationType | 'AI_REVIEW' | null> = {
  all: null,
  assignment: 'ASSIGNMENT',
  approval_request: 'APPROVAL_REQUEST',
  approval: 'APPROVAL_REQUEST',
  deadline: 'DEADLINE',
  triage: 'TRIAGE',
  workflow: 'WORKFLOW',
  operational: 'OPERATIONAL',
  ai_review: 'AI_REVIEW',
};

const SEVERITY_ALIASES: Record<string, TenantNotificationSeverity | null> = {
  all: null,
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

function normalizeSearchParam(raw: string | null): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return t.slice(0, 120);
}

export function parseLabNotificationQuery(url: URL): LabNotificationQuery {
  const typeRaw = url.searchParams.get('type')?.trim().toLowerCase() || 'all';
  const statusRaw = url.searchParams.get('status')?.trim().toLowerCase() || 'all';
  const severityRaw = url.searchParams.get('severity')?.trim().toLowerCase() || 'all';
  const sortRaw = url.searchParams.get('sort')?.trim().toLowerCase() || 'newest';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100), 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);

  const status: LabNotificationQuery['status'] =
    statusRaw === 'unread' ? 'unread' : statusRaw === 'read' ? 'read' : 'all';

  return {
    search: normalizeSearchParam(url.searchParams.get('q')),
    type: TYPE_ALIASES[typeRaw] ?? null,
    status,
    severity: SEVERITY_ALIASES[severityRaw] ?? null,
    dateFrom: parseDateParam(url.searchParams.get('from')),
    dateTo: parseDateParam(url.searchParams.get('to')),
    sort: sortRaw === 'oldest' ? 'oldest' : 'newest',
    limit,
    offset,
  };
}

function parseDateParam(raw: string | null): string | null {
  const t = raw?.trim();
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

export function labNotificationSearchPattern(term: string): string {
  const escaped = term.replace(/[%_\\,]/g, '').trim();
  return `%${escaped}%`;
}

export function notificationMatchesSearch(note: LabNotificationView, search: string | null): boolean {
  const needle = search?.trim().toLowerCase();
  if (!needle) return true;
  const parts = [
    note.message,
    note.title,
    note.type,
    note.entityType,
    note.entityId,
    note.id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return parts.includes(needle);
}

export function humanTypeToFilterKey(typeLabel: string): string {
  return typeLabel.toLowerCase().replace(/\s+/g, '_');
}

export function applyLabNotificationQueryFilters(
  notes: LabNotificationView[],
  query: LabNotificationQuery,
): { notifications: LabNotificationView[]; totalMatching: number } {
  let rows = notes;

  if (query.search) {
    rows = rows.filter((n) => notificationMatchesSearch(n, query.search));
  }

  if (query.type === 'AI_REVIEW') {
    rows = rows.filter((n) => n.source === 'notification_events' || humanTypeToFilterKey(n.type) === 'ai_review');
  } else if (query.type) {
    const human = query.type
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
    rows = rows.filter(
      (n) =>
        n.source === 'tenant_notifications' &&
        (n.type === human || humanTypeToFilterKey(n.type) === query.type?.toLowerCase()),
    );
  }

  if (query.severity) {
    const label =
      query.severity.charAt(0) + query.severity.slice(1).toLowerCase();
    rows = rows.filter((n) => n.severity.toLowerCase() === label.toLowerCase());
  }

  if (query.status === 'unread') {
    rows = rows.filter((n) => !n.read);
  } else if (query.status === 'read') {
    rows = rows.filter((n) => n.read);
  }

  if (query.dateFrom) {
    const from = `${query.dateFrom}T00:00:00.000Z`;
    rows = rows.filter((n) => String(n.at) >= from);
  }
  if (query.dateTo) {
    const to = `${query.dateTo}T23:59:59.999Z`;
    rows = rows.filter((n) => String(n.at) <= to);
  }

  rows = [...rows].sort((a, b) => {
    const cmp = String(a.at).localeCompare(String(b.at));
    return query.sort === 'oldest' ? cmp : -cmp;
  });

  const totalMatching = rows.length;
  const page = rows.slice(query.offset, query.offset + query.limit);
  return { notifications: page, totalMatching };
}
