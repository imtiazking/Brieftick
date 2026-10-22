import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type CalendarEvent = {
  id: string;
  date: string;
  kind:
    | 'publication'
    | 'consultation'
    | 'effective'
    | 'obligation_due'
    | 'impact_due'
    | 'action_due';
  title: string;
  href: string;
};

export async function listCalendarEvents(
  supabase: SupabaseClient,
  organisationId: string,
  range: { from: string; to: string },
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  const { from, to } = range;

  const { data: pubs } = await supabase
    .from('regulatory_publications')
    .select('id, title, publication_date, effective_date, consultation_deadline')
    .limit(400);

  for (const p of pubs ?? []) {
    if (p.publication_date && p.publication_date >= from && p.publication_date <= to) {
      events.push({
        id: `pub-${p.id}-pd`,
        date: p.publication_date,
        kind: 'publication',
        title: p.title,
        href: `/ri/publications/${p.id}`,
      });
    }
    if (p.effective_date && p.effective_date >= from && p.effective_date <= to) {
      events.push({
        id: `pub-${p.id}-eff`,
        date: p.effective_date,
        kind: 'effective',
        title: `Effective: ${p.title}`,
        href: `/ri/publications/${p.id}`,
      });
    }
    if (p.consultation_deadline && p.consultation_deadline >= from && p.consultation_deadline <= to) {
      events.push({
        id: `pub-${p.id}-con`,
        date: p.consultation_deadline,
        kind: 'consultation',
        title: `Consultation ends: ${p.title}`,
        href: `/ri/publications/${p.id}`,
      });
    }
  }

  const { data: obligations } = await supabase
    .from('regulatory_obligations')
    .select('id, obligation_statement, due_date')
    .eq('organisation_id', organisationId)
    .not('due_date', 'is', null)
    .gte('due_date', from)
    .lte('due_date', to);

  for (const o of obligations ?? []) {
    if (!o.due_date) continue;
    events.push({
      id: `obl-${o.id}`,
      date: o.due_date,
      kind: 'obligation_due',
      title: o.obligation_statement.slice(0, 80),
      href: `/ri/obligations/${o.id}`,
    });
  }

  const { data: impacts } = await supabase
    .from('impact_assessments')
    .select('id, status, due_date, materiality')
    .eq('organisation_id', organisationId)
    .not('due_date', 'is', null)
    .gte('due_date', from)
    .lte('due_date', to);

  for (const i of impacts ?? []) {
    if (!i.due_date) continue;
    events.push({
      id: `imp-${i.id}`,
      date: i.due_date,
      kind: 'impact_due',
      title: `Impact assessment due (${i.status})`,
      href: `/ri/impact-assessments/${i.id}`,
    });
  }

  const { data: actions } = await supabase
    .from('actions')
    .select('id, title, due_date')
    .eq('organisation_id', organisationId)
    .not('due_date', 'is', null)
    .gte('due_date', from)
    .lte('due_date', to);

  for (const a of actions ?? []) {
    if (!a.due_date) continue;
    events.push({
      id: `act-${a.id}`,
      date: a.due_date,
      kind: 'action_due',
      title: a.title,
      href: `/ri/actions/${a.id}`,
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}
