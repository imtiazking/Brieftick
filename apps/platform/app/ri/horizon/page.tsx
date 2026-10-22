import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { listHorizonPublications } from '@/lib/ri/services/horizon';
import { getGlobalCatalogueView } from '@/lib/ri/catalogue-display';

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
        })
      : [];

  return (
    <ShellLayout title="Horizon scanning" subtitle="Regulatory publications and dates from production data">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : (
          <>
            <form className="fg-form fg-form--inline fg-card" method="get">
              <label>
                Regulator
                <select name="regulator" defaultValue={sp.regulator ?? ''}>
                  <option value="">All catalogue regulators</option>
                  {catalogue.regulators.map((r) => (
                    <option key={r.id} value={r.id}>{r.shortName} ({r.id})</option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select name="source" defaultValue={sp.source ?? ''}>
                  <option value="">All catalogue sources</option>
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
            {rows.length === 0 ? (
              <RiEmptyState
                title="No regulatory publications have been ingested."
                detail="Horizon scanning will populate when controlled ingestion creates global publication records."
              />
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Regulator</th>
                      <th>Published</th>
                      <th>Triage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td><Link href={`/ri/publications/${p.id}`}>{p.title}</Link></td>
                        <td>{p.regulator?.acronym ?? '—'}</td>
                        <td>{p.publication_date ?? '—'}</td>
                        <td><RiStatusChip label={p.orgState?.triage_status ?? 'NEW'} /></td>
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
