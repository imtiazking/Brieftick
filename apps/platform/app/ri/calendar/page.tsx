import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { tryRiContext } from '@/lib/ri/context';
import { listCalendarEvents } from '@/lib/ri/services/calendar';

function defaultRange() {
  const from = new Date();
  const to = new Date();
  to.setMonth(to.getMonth() + 3);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const defaults = defaultRange();
  const from = sp.from ?? defaults.from;
  const to = sp.to ?? defaults.to;
  const ctx = await tryRiContext();
  const events = ctx ? await listCalendarEvents(ctx.supabase, ctx.organisationId, { from, to }) : [];

  return (
    <ShellLayout title="Regulatory calendar" subtitle="Publication, consultation, and workflow dates">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : (
          <>
            <form className="fg-form fg-form--inline fg-card" method="get">
              <label>From<input name="from" type="date" defaultValue={from} /></label>
              <label>To<input name="to" type="date" defaultValue={to} /></label>
              <button type="submit" className="fg-btn">Update range</button>
            </form>
            {events.length === 0 ? (
              <RiEmptyState title="No dates in this range." detail="Adjust the range or ingest publications." />
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr><th>Date</th><th>Type</th><th>Item</th></tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td>{e.kind.replace('_', ' ')}</td>
                        <td><Link href={e.href}>{e.title}</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
