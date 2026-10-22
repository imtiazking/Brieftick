import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { canRi } from '@/lib/ri/permissions';
import { linkRiskControlAction, updateRiskAction } from '@/lib/ri/server-actions-downstream';
import { getRiskDetail } from '@/lib/ri/services/risks';

export default async function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Risk"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getRiskDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { risk, obligations, controls } = detail;

  return (
    <ShellLayout title="Risk" subtitle={risk.title}>
      <RiDataGate>
        <div className="fg-card">
          <p>{risk.description ?? '—'}</p>
          <p>Category: {risk.category ?? '—'}</p>
          <p>Inherent: {risk.inherent_risk ?? '—'} · Residual: {risk.residual_risk ?? '—'}</p>
          <p>Status: {risk.status ?? '—'} · Review: {risk.review_date ?? '—'}</p>
        </div>
        <div className="fg-card">
          <h2>Linked obligations</h2>
          {obligations.length === 0 ? (
            <p>No obligations are linked to this risk.</p>
          ) : (
            <ul>
              {obligations.map((o) => (
                <li key={o?.id}><Link href={`/ri/obligations/${o?.id}`}>{o?.obligation_statement?.slice(0, 120)}</Link></li>
              ))}
            </ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Linked controls</h2>
          {controls.length === 0 ? (
            <p>No controls have been mapped to this risk.</p>
          ) : (
            <ul>
              {controls.map((c) => (
                <li key={c?.id}><Link href={`/ri/controls/${c?.id}`}>{c?.name}</Link></li>
              ))}
            </ul>
          )}
        </div>
        {canRi(ctx.role, 'risk:write') && (
          <>
            <form action={updateRiskAction} className="fg-card fg-form">
              <input type="hidden" name="risk_id" value={id} />
              <input type="hidden" name="updated_at" value={risk.updated_at} />
              <label>Title<input name="title" defaultValue={risk.title} /></label>
              <label>Status<input name="status" defaultValue={risk.status ?? ''} /></label>
              <button type="submit" className="fg-btn">Save</button>
            </form>
            <form action={linkRiskControlAction} className="fg-card fg-form">
              <h3>Link control</h3>
              <input type="hidden" name="risk_id" value={id} />
              <label>Control ID<input name="control_id" required /></label>
              <button type="submit" className="fg-btn">Link</button>
            </form>
          </>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
