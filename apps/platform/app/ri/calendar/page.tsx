import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { tryRiContext } from '@/lib/ri/context';
import { defaultCalendarRange, listCalendarEvents } from '@/lib/ri/services/calendar';

const WINDOW_DAYS = 90;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const defaults = defaultCalendarRange(WINDOW_DAYS);
  const from = sp.from ?? defaults.from;
  const to = sp.to ?? defaults.to;
  const ctx = await tryRiContext();
  const events = ctx ? await listCalendarEvents(ctx.supabase, ctx.organisationId, { from, to }) : [];

  return (
    <ShellLayout title="Regulatory calendar" subtitle="Publication, consultation, and workflow dates (UTC date-only)">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : (
          <>
            <form className="ri-toolbar fg-card" method="get">
              <label>From<input name="from" type="date" defaultValue={from} /></label>
              <label>To<input name="to" type="date" defaultValue={to} /></label>
              <button type="submit" className="fg-btn">Update range</button>
            </form>
            <p className="fg-muted">
              {events.length} event(s) from {from} to {to}
            </p>
            {events.length === 0 ? (
              <RiEmptyState title="No dates in this range." detail="Adjust the range or ingest publications and workflow records." />
            ) : (
              <ul className="ri-cal-list fg-card">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="ri-cal-date">{e.date}</span>
                    <span className="ri-cal-kind">{e.kind.replaceAll('_', ' ')}</span>
                    <Link href={e.href}>{e.title}</Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
