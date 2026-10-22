import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { listChanges } from '@/lib/ri/services/changes';

export default async function ChangesListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listChanges(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Regulatory changes" subtitle="Publication-linked change records (organisation scope)">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : rows.length === 0 ? (
          <RiEmptyState
            title="No regulatory changes yet."
            detail="Create a change from a publication after triage. No Design Lab fixture fallback."
          />
        ) : (
          <div className="fg-card fg-card--flush">
            <table className="fg-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Publication</th>
                  <th>Materiality</th>
                  <th>Status</th>
                  <th>Effective</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const pub = Array.isArray(c.publication) ? c.publication[0] : c.publication;
                  const displayId = c.external_key ?? c.id.slice(0, 8);
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/ri/changes/${c.id}`}>{displayId}</Link></td>
                      <td>{c.title}</td>
                      <td>{pub?.id ? <Link href={`/ri/publications/${pub.id}`}>{pub.title}</Link> : '—'}</td>
                      <td>{c.materiality ?? '—'}</td>
                      <td><RiStatusChip label={c.status} /></td>
                      <td>{c.effective_date ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
