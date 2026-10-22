import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCalendarEventsFromRecords } from '@/lib/ri/lab-compat/calendar-parity.mjs';
import { forwardWindowEnd } from '@/lib/ri/lab-compat/date-window.mjs';

export type CalendarEvent = {
  id: string;
  date: string;
  kind: string;
  title: string;
  href: string;
  recordId?: string;
  recordType?: string;
};

function hrefForEvent(ev: { kind: string; recordId?: string }) {
  if (!ev.recordId) return '/ri/calendar';
  if (ev.kind === 'obligation_due' || ev.kind === 'implementation') return `/ri/obligations/${ev.recordId}`;
  if (ev.kind === 'impact_due' || ev.kind === 'assessment') return `/ri/impact-assessments/${ev.recordId}`;
  if (ev.kind === 'action_due' || ev.kind === 'action') return `/ri/actions/${ev.recordId}`;
  return `/ri/publications/${ev.recordId}`;
}

export async function listCalendarEvents(
  supabase: SupabaseClient,
  organisationId: string,
  range: { from: string; to: string },
): Promise<CalendarEvent[]> {
  const { from, to } = range;

  const { data: pubs } = await supabase
    .from('regulatory_publications')
    .select('id, title, publication_date, effective_date, consultation_deadline')
    .limit(400);

  const { data: obligations } = await supabase
    .from('regulatory_obligations')
    .select('id, obligation_statement, due_date, effective_date')
    .eq('organisation_id', organisationId);

  const { data: impacts } = await supabase
    .from('impact_assessments')
    .select('id, status, due_date')
    .eq('organisation_id', organisationId);

  const { data: actions } = await supabase
    .from('actions')
    .select('id, title, due_date')
    .eq('organisation_id', organisationId);

  const raw = buildCalendarEventsFromRecords(
    {
      publications: (pubs ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        publication_date: p.publication_date,
        effective_date: p.effective_date,
        consultation_deadline: p.consultation_deadline,
      })),
      obligations: (obligations ?? []).map((o) => ({
        id: o.id,
        organisation_id: organisationId,
        due_date: o.due_date,
        effective_date: o.effective_date,
        obligation_statement: o.obligation_statement,
      })),
      impacts: (impacts ?? []).map((i) => ({
        id: i.id,
        organisation_id: organisationId,
        due_date: i.due_date,
        status: i.status,
      })),
      actions: (actions ?? []).map((a) => ({
        id: a.id,
        organisation_id: organisationId,
        due_date: a.due_date,
        title: a.title,
      })),
      policies: [],
    },
    { from, to, organisationId },
  );

  return raw.map((e) => ({
    id: e.id,
    date: e.date,
    kind: e.kind,
    title: e.title,
    href: hrefForEvent(e),
    recordId: e.recordId,
    recordType: e.recordType,
  }));
}

export function defaultCalendarRange(windowDays = 90) {
  const from = new Date().toISOString().slice(0, 10);
  const to = forwardWindowEnd(from, windowDays);
  return { from, to };
}
