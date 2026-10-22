import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { listChanges } from '@/lib/ri/services/changes';

export default async function ChangesListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listChanges(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Regulatory changes" subtitle="Organisation-scoped changes linked to publications">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : rows.length === 0 ? (
          <div className="fg-card">
            <h2>No changes</h2>
            <p>Create a change from a publication after triage and applicability review.</p>
            <Link href="/ri/publications">View publications</Link>
          </div>
        ) : (
          <div className="fg-card fg-card--flush">
            <table className="fg-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Publication</th>
                  <th>Status</th>
                  <th>Effective</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const pub = Array.isArray(c.publication) ? c.publication[0] : c.publication;
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/ri/changes/${c.id}`}>{c.title}</Link></td>
                      <td>{pub?.title ?? '—'}</td>
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
