import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { createFindingAction } from '@/lib/ri/server-actions-downstream';
import { listFindings } from '@/lib/ri/services/findings';

export default async function FindingsListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listFindings(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Findings" subtitle="Findings with explicit control and action links">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : (
          <>
            {canRi(ctx.role, 'finding:write') && (
              <form action={createFindingAction} className="fg-card fg-form">
                <h2>New finding</h2>
                <label>Title<input name="title" required /></label>
                <label>Severity<input name="severity" defaultValue="MEDIUM" required /></label>
                <label>Due date<input type="date" name="due_date" /></label>
                <label>Description<textarea name="description" rows={2} /></label>
                <button type="submit" className="fg-btn">Create</button>
              </form>
            )}
            {rows.length === 0 ? (
              <div className="fg-card"><p>No findings yet.</p></div>
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr><th>Title</th><th>Severity</th><th>Status</th><th>Due</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => (
                      <tr key={f.id}>
                        <td><Link href={`/ri/findings/${f.id}`}>{f.title}</Link></td>
                        <td>{f.severity}</td>
                        <td><RiStatusChip label={f.status} /></td>
                        <td>{f.due_date ?? '—'}</td>
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
