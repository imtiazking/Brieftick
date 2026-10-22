import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { createControlAction } from '@/lib/ri/server-actions-downstream';
import { listControls } from '@/lib/ri/services/controls';

export default async function ControlsListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listControls(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Controls" subtitle="Controls mapped to risks and obligations">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : (
          <>
            {canRi(ctx.role, 'control:write') && (
              <form action={createControlAction} className="fg-card fg-form">
                <h2>New control</h2>
                <label>Name<input name="name" required /></label>
                <label>Type<input name="control_type" /></label>
                <label>Effectiveness<input name="effectiveness" /></label>
                <label>Description<textarea name="description" rows={2} /></label>
                <button type="submit" className="fg-btn">Create</button>
              </form>
            )}
            {rows.length === 0 ? (
              <div className="fg-card"><p>No controls yet.</p></div>
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr><th>Name</th><th>Type</th><th>Effectiveness</th><th>Testing</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td><Link href={`/ri/controls/${c.id}`}>{c.name}</Link></td>
                        <td>{c.control_type ?? '—'}</td>
                        <td>{c.effectiveness ?? '—'}</td>
                        <td>{c.testing_status ?? '—'}</td>
                        <td><RiStatusChip label={c.status ?? '—'} /></td>
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
