import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { canRi } from '@/lib/ri/permissions';
import { updateImpactAction } from '@/lib/ri/server-actions';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { getImpactDetail } from '@/lib/ri/services/impact';

export default async function ImpactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Impact"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getImpactDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const impact = detail.impact;
  const change = Array.isArray(impact.change) ? impact.change[0] : impact.change;
  const canEdit = canRi(ctx.role, 'impact:write');
  const canSubmit = canRi(ctx.role, 'impact:submit');
  const canApprove = canRi(ctx.role, 'impact:approve');

  return (
    <ShellLayout title="Impact assessment" subtitle="Linked to regulatory change">
      <RiDataGate>
        <div className="fg-card">
          <h2>Overview</h2>
          <p>Change: {change?.id ? <Link href={`/ri/changes/${change.id}`}>{change.title}</Link> : '—'}</p>
          <ul className="fg-status-list">
            <li><span>Status</span><span><RiStatusChip label={impact.status} /></span></li>
            <li><span>Materiality</span><span>{impact.materiality ?? '—'}</span></li>
            <li><span>Due date</span><span>{impact.due_date ?? '—'}</span></li>
            <li><span>Owner</span><span>{impact.owner_user_id ?? '—'}</span></li>
            <li><span>Reviewer</span><span>{impact.reviewer_user_id ?? '—'}</span></li>
            <li><span>Approver</span><span>{impact.approver_user_id ?? '—'}</span></li>
          </ul>
          <p className="fg-muted">Approver identity is set by the server on approve/reject — not from the client.</p>
        </div>
        <div className="fg-card">
          <h2>Impact dimensions</h2>
          <p className="fg-muted">No production AI suggestions — complete human impact analysis below.</p>
        </div>
        {canEdit && (
          <form action={updateImpactAction} className="fg-card fg-form">
            <input type="hidden" name="impact_id" value={id} />
            <input type="hidden" name="updated_at" value={impact.updated_at} />
            <label>Business impact<textarea name="business_impact" rows={2} defaultValue={impact.business_impact ?? ''} /></label>
            <label>Operational<textarea name="operational_impact" rows={2} defaultValue={impact.operational_impact ?? ''} /></label>
            <label>Technology<textarea name="technology_impact" rows={2} defaultValue={impact.technology_impact ?? ''} /></label>
            <label>Compliance<textarea name="compliance_impact" rows={2} defaultValue={impact.compliance_impact ?? ''} /></label>
            <label>Financial<textarea name="financial_impact" rows={2} defaultValue={impact.financial_impact ?? ''} /></label>
            <label>Complexity<textarea name="implementation_complexity" rows={2} defaultValue={impact.implementation_complexity ?? ''} /></label>
            <label>Materiality<input name="materiality" defaultValue={impact.materiality ?? ''} /></label>
            <label>Due date<input type="date" name="due_date" defaultValue={impact.due_date ?? ''} /></label>
            <label>Business areas<input name="business_areas" defaultValue={detail.businessAreas.join(', ')} /></label>
            <button type="submit" className="fg-btn">Save draft</button>
            {canSubmit && (
              <button type="submit" name="action" value="submit" className="fg-btn fg-btn--secondary">Submit for review</button>
            )}
            {canApprove && (
              <>
                <button type="submit" name="action" value="approve" className="fg-btn">Approve</button>
                <button type="submit" name="action" value="reject" className="fg-btn fg-btn--secondary">Reject</button>
              </>
            )}
          </form>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
