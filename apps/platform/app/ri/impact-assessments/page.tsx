import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { listImpactAssessments } from '@/lib/ri/services/impact';

export default async function ImpactListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listImpactAssessments(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Impact assessments" subtitle="Manual impact analysis linked to regulatory changes">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : rows.length === 0 ? (
          <div className="fg-card"><p>No impact assessments yet.</p></div>
        ) : (
          <div className="fg-card fg-card--flush">
            <table className="fg-table">
              <thead>
                <tr><th>Change</th><th>Status</th><th>Due</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ch = Array.isArray(r.change) ? r.change[0] : r.change;
                  return (
                    <tr key={r.id}>
                      <td><Link href={`/ri/impact-assessments/${r.id}`}>{ch?.title ?? r.regulatory_change_id}</Link></td>
                      <td><RiStatusChip label={r.status} /></td>
                      <td>{r.due_date ?? '—'}</td>
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
