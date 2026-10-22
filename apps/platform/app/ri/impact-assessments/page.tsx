import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { listImpactAssessments } from '@/lib/ri/services/impact';

export default async function ImpactListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listImpactAssessments(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Impact assessments" subtitle="Human-governed impact analysis linked to regulatory changes">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : rows.length === 0 ? (
          <RiEmptyState title="No impact assessments yet." detail="Create from a regulatory change when ready." />
        ) : (
          <div className="fg-card fg-card--flush">
            <table className="fg-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Change</th>
                  <th>Owner</th>
                  <th>Materiality</th>
                  <th>Status</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ch = Array.isArray(r.change) ? r.change[0] : r.change;
                  return (
                    <tr key={r.id}>
                      <td><Link href={`/ri/impact-assessments/${r.id}`}>{r.id.slice(0, 8)}…</Link></td>
                      <td>{ch?.title ?? '—'}</td>
                      <td>{r.owner_user_id ?? '—'}</td>
                      <td>{r.materiality ?? '—'}</td>
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
