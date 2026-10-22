import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { createPolicyAction } from '@/lib/ri/server-actions-downstream';
import { listPolicies } from '@/lib/ri/services/policies';

export default async function PoliciesListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listPolicies(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Policies" subtitle="Organisation policy records linked to obligations">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : (
          <>
            {canRi(ctx.role, 'policy:write') && (
              <form action={createPolicyAction} className="fg-card fg-form">
                <h2>New policy</h2>
                <label>Name<input name="name" required /></label>
                <label>Description<textarea name="description" rows={2} /></label>
                <label>Version<input name="version" defaultValue="1.0" /></label>
                <label>Status<input name="status" defaultValue="DRAFT" /></label>
                <label>Next review<input type="date" name="next_review_date" /></label>
                <button type="submit" className="fg-btn">Create</button>
              </form>
            )}
            {rows.length === 0 ? (
              <div className="fg-card"><p>No policies yet.</p></div>
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr><th>Name</th><th>Version</th><th>Status</th><th>Next review</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td><Link href={`/ri/policies/${p.id}`}>{p.name}</Link></td>
                        <td>{p.version ?? '—'}</td>
                        <td><RiStatusChip label={p.status ?? '—'} /></td>
                        <td>{p.next_review_date ?? '—'}</td>
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
