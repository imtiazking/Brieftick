import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { createActionDownstreamAction } from '@/lib/ri/server-actions-downstream';
import { listRiActions } from '@/lib/ri/services/ri-actions';

export default async function ActionsListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listRiActions(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Actions" subtitle="Remediation and follow-up actions">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : (
          <>
            {canRi(ctx.role, 'action:write') && (
              <form action={createActionDownstreamAction} className="fg-card fg-form">
                <h2>New action</h2>
                <label>Title<input name="title" required /></label>
                <label>Priority<input name="priority" /></label>
                <label>Due date<input type="date" name="due_date" /></label>
                <input type="hidden" name="source_type" value="manual" />
                <button type="submit" className="fg-btn">Create</button>
              </form>
            )}
            {rows.length === 0 ? (
              <div className="fg-card"><p>No actions yet.</p></div>
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr><th>ID</th><th>Title</th><th>Owner</th><th>Status</th><th>Priority</th><th>Due</th><th>Overdue</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td>{a.id.slice(0, 8)}…</td>
                        <td><Link href={`/ri/actions/${a.id}`}>{a.title}</Link></td>
                        <td>{a.owner_user_id ?? '—'}</td>
                        <td><RiStatusChip label={a.status} /></td>
                        <td>{a.priority ?? '—'}</td>
                        <td>{a.due_date ?? '—'}</td>
                        <td>{a.overdue ? 'Yes' : '—'}</td>
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
