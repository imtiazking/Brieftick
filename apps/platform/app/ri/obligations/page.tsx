import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { listObligations } from '@/lib/ri/services/obligations';

export default async function ObligationsListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listObligations(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Obligations" subtitle="Organisation obligations with production lifecycle taxonomy">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : rows.length === 0 ? (
          <RiEmptyState title="No obligations currently require your attention." detail="Create obligations from impact assessments after regulatory changes are assessed." />
        ) : (
          <div className="fg-card fg-card--flush">
            <table className="fg-table">
              <thead>
                <tr><th>Statement</th><th>Status</th><th>Due</th><th>Change</th></tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const ch = Array.isArray(o.change) ? o.change[0] : o.change;
                  return (
                    <tr key={o.id}>
                      <td><Link href={`/ri/obligations/${o.id}`}>{o.obligation_statement.slice(0, 100)}</Link></td>
                      <td><RiStatusChip label={o.status} /></td>
                      <td>{o.due_date ?? '—'}</td>
                      <td>{ch?.title ?? '—'}</td>
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
