import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { createRiskAction } from '@/lib/ri/server-actions-downstream';
import { listRisks } from '@/lib/ri/services/risks';

export default async function RisksListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listRisks(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Risks" subtitle="Risks linked to obligations and controls">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : (
          <>
            {canRi(ctx.role, 'risk:write') && (
              <form action={createRiskAction} className="fg-card fg-form">
                <h2>New risk</h2>
                <label>Title<input name="title" required /></label>
                <label>Category<input name="category" /></label>
                <label>Inherent<input name="inherent_risk" /></label>
                <label>Residual<input name="residual_risk" /></label>
                <label>Description<textarea name="description" rows={2} /></label>
                <button type="submit" className="fg-btn">Create</button>
              </form>
            )}
            {rows.length === 0 ? (
              <div className="fg-card"><p>No risks yet.</p></div>
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr><th>Title</th><th>Category</th><th>Inherent</th><th>Residual</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td><Link href={`/ri/risks/${r.id}`}>{r.title}</Link></td>
                        <td>{r.category ?? '—'}</td>
                        <td>{r.inherent_risk ?? '—'}</td>
                        <td>{r.residual_risk ?? '—'}</td>
                        <td><RiStatusChip label={r.status ?? '—'} /></td>
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
