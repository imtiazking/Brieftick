import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { tryRiContext } from '@/lib/ri/context';
import { listHorizonPublications } from '@/lib/ri/services/horizon';
import { getGlobalCatalogueView } from '@/lib/ri/catalogue-display';

const WINDOW_DAYS = 90;

export default async function HorizonPage({
  searchParams,
}: {
  searchParams: Promise<{ regulator?: string; source?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await tryRiContext();
  const catalogue = await getGlobalCatalogueView();
  const rows =
    ctx
      ? await listHorizonPublications(ctx.supabase, ctx.organisationId, {
          regulatorKey: sp.regulator,
          sourceKey: sp.source,
          fromDate: sp.from,
          toDate: sp.to,
          windowDays: WINDOW_DAYS,
        })
      : [];

  const today = new Date().toISOString().slice(0, 10);
  const usingCustomRange = Boolean(sp.from || sp.to);

  return (
    <ShellLayout title="Horizon scanning" subtitle="Forward-looking regulatory view from production data">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : (
          <>
            <form className="ri-toolbar fg-card" method="get">
              <label>
                Regulator
                <select name="regulator" defaultValue={sp.regulator ?? ''}>
                  <option value="">All catalogue regulators ({catalogue.regulatorCount})</option>
                  {catalogue.regulators.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.shortName} ({r.id})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select name="source" defaultValue={sp.source ?? ''}>
                  <option value="">All catalogue sources ({catalogue.sourceCount})</option>
                  {catalogue.sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.id}</option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input name="from" type="date" defaultValue={sp.from ?? ''} />
              </label>
              <label>
                To
                <input name="to" type="date" defaultValue={sp.to ?? ''} />
              </label>
              <button type="submit" className="fg-btn">Filter</button>
            </form>
            <p className="fg-muted">
              {rows.length} publication(s)
              {usingCustomRange ? ' in selected date range' : ` with consultation or effective dates in the next ${WINDOW_DAYS} days`}
              {' '}(from {today})
            </p>
            {rows.length === 0 ? (
              <RiEmptyState
                title={sp.regulator || sp.source ? 'No matching publications.' : 'No regulatory publications in this horizon window.'}
                detail="Catalogue regulators with zero ingested publications show an empty result — no fixture data is used at runtime."
              />
            ) : (
              <ul className="ri-list-compact fg-card">
                {rows.map((p) => (
                  <li key={p.id}>
                    <Link href={`/ri/publications/${p.id}`}>
                      {p.regulator?.acronym ?? '—'} — {p.title}
                    </Link>
                    {' · '}
                    Consultation {p.consultation_deadline ?? '—'}
                    {' · '}
                    Effective {p.effective_date ?? '—'}
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
