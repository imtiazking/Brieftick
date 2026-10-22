import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { ASSURANCE_RESULTS } from '@/lib/ri/validation';
import { createAssuranceAction } from '@/lib/ri/server-actions-downstream';
import { listAssuranceReviews } from '@/lib/ri/services/assurance';

export default async function AssuranceListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listAssuranceReviews(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Assurance" subtitle="Control and obligation assurance reviews">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : (
          <>
            {canRi(ctx.role, 'assurance:write') && (
              <form action={createAssuranceAction} className="fg-card fg-form">
                <h2>New assurance review</h2>
                <label>Review type<input name="review_type" defaultValue="control_test" required /></label>
                <label>Result
                  <select name="result" required>
                    {ASSURANCE_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label>Control ID (optional)<input name="control_id" /></label>
                <label>Notes<textarea name="notes" rows={2} /></label>
                <button type="submit" className="fg-btn">Create</button>
              </form>
            )}
            {rows.length === 0 ? (
              <div className="fg-card"><p>No assurance reviews yet.</p></div>
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr><th>Type</th><th>Result</th><th>Date</th><th>Reviewer</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td><Link href={`/ri/assurance/${a.id}`}>{a.review_type}</Link></td>
                        <td>{a.result}</td>
                        <td>{a.review_date ?? '—'}</td>
                        <td>{a.reviewer_user_id ?? '—'}</td>
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
