import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { canRi } from '@/lib/ri/permissions';
import { createImpactAction, createObligationAction, updateChangeStatusAction } from '@/lib/ri/server-actions';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { getChangeDetail } from '@/lib/ri/services/changes';
import { CHANGE_STATUSES } from '@/lib/ri/validation';

export default async function ChangeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Change"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getChangeDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { change, applicability, impacts, obligations } = detail;
  const pub = change.publication;

  return (
    <ShellLayout title={change.title} subtitle="Publication → change traceability">
      <RiDataGate>
        <div className="fg-card">
          <h2>Traceability</h2>
          <p>
            Publication:{' '}
            {pub?.id ? <Link href={`/ri/publications/${pub.id}`}>{pub.title}</Link> : '—'}
          </p>
          <ul className="fg-status-list">
            <li><span>Change type</span><span>{change.change_type}</span></li>
            <li><span>Status</span><span><RiStatusChip label={change.status} /></span></li>
            <li><span>Materiality</span><span>{change.materiality ?? '—'}</span></li>
            <li><span>Owner</span><span>{change.owner_user_id ?? '—'}</span></li>
            <li><span>Effective</span><span>{change.effective_date ?? '—'}</span></li>
            <li><span>Implementation deadline</span><span>{change.implementation_deadline ?? '—'}</span></li>
          </ul>
          {applicability && (
            <p>Applicability: <RiStatusChip label={applicability.recommendation} /> — human assessment</p>
          )}
          {canRi(ctx.role, 'change:write') && (
            <form action={updateChangeStatusAction} className="fg-form fg-form--inline">
              <input type="hidden" name="change_id" value={id} />
              <input type="hidden" name="updated_at" value={change.updated_at} />
              <select name="status" defaultValue={change.status}>
                {CHANGE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="submit" className="fg-btn">Update status</button>
            </form>
          )}
        </div>

        <div className="fg-card">
          <h2>Impact assessments</h2>
          <ul className="fg-link-list">
            {impacts.map((i) => (
              <li key={i.id}><Link href={`/ri/impact-assessments/${i.id}`}>{i.id.slice(0, 8)}…</Link> — <RiStatusChip label={i.status} /></li>
            ))}
          </ul>
          {canRi(ctx.role, 'impact:write') && (
            <form action={createImpactAction}>
              <input type="hidden" name="regulatory_change_id" value={id} />
              <button type="submit" className="fg-btn">Create impact assessment</button>
            </form>
          )}
        </div>

        <div className="fg-card">
          <h2>Obligations</h2>
          <ul className="fg-link-list">
            {obligations.map((o) => (
              <li key={o.id}><Link href={`/ri/obligations/${o.id}`}>{o.obligation_statement.slice(0, 80)}</Link></li>
            ))}
          </ul>
          {canRi(ctx.role, 'obligation:write') && (
            <form action={createObligationAction} className="fg-form">
              <input type="hidden" name="regulatory_change_id" value={id} />
              <label>Statement<textarea name="obligation_statement" required rows={3} /></label>
              <label>Citation<input name="citation" /></label>
              <label>Source section<input name="source_section" /></label>
              <label>Priority<input name="priority" /></label>
              <label>Due date<input name="due_date" type="date" /></label>
              <button type="submit" className="fg-btn">Create obligation</button>
            </form>
          )}
        </div>
      </RiDataGate>
    </ShellLayout>
  );
}
