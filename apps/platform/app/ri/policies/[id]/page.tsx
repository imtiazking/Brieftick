import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { canRi } from '@/lib/ri/permissions';
import { linkObligationPolicyAction, updatePolicyAction } from '@/lib/ri/server-actions-downstream';
import { getPolicyDetail } from '@/lib/ri/services/policies';

export default async function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Policy"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getPolicyDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { policy, obligations } = detail;

  return (
    <ShellLayout title="Policy" subtitle={policy.name}>
      <RiDataGate>
        <div className="fg-card">
          <p>{policy.description ?? '—'}</p>
          <p>Owner: {policy.owner_user_id}</p>
          <p>Version: {policy.version} · Status: {policy.status}</p>
          <p>Last reviewed: {policy.last_reviewed_at ?? '—'} · Next: {policy.next_review_date ?? '—'}</p>
        </div>
        <div className="fg-card">
          <h2>Linked obligations</h2>
          {obligations.length === 0 ? (
            <p>No obligations are linked to this policy.</p>
          ) : (
            <ul>
              {obligations.map((o) => (
                <li key={o?.id}>
                  <Link href={`/ri/obligations/${o?.id}`}>{o?.obligation_statement?.slice(0, 120)}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {canRi(ctx.role, 'policy:write') && (
          <form action={updatePolicyAction} className="fg-card fg-form">
            <input type="hidden" name="policy_id" value={id} />
            <input type="hidden" name="updated_at" value={policy.updated_at} />
            <label>Name<input name="name" defaultValue={policy.name} /></label>
            <label>Description<textarea name="description" rows={3} defaultValue={policy.description ?? ''} /></label>
            <label>Version<input name="version" defaultValue={policy.version ?? ''} /></label>
            <label>Status<input name="status" defaultValue={policy.status ?? ''} /></label>
            <label>Next review<input type="date" name="next_review_date" defaultValue={policy.next_review_date ?? ''} /></label>
            <button type="submit" className="fg-btn">Save</button>
          </form>
        )}
        {canRi(ctx.role, 'policy:write') && (
          <form action={linkObligationPolicyAction} className="fg-card fg-form">
            <h3>Link obligation</h3>
            <label>Obligation ID<input name="obligation_id" required /></label>
            <input type="hidden" name="policy_id" value={id} />
            <button type="submit" className="fg-btn">Link</button>
          </form>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
