import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { canRi } from '@/lib/ri/permissions';
import { updateActionDownstreamAction } from '@/lib/ri/server-actions-downstream';
import { getRiActionDetail } from '@/lib/ri/services/ri-actions';

export default async function ActionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Action"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getRiActionDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { action, evidence, findings } = detail;

  return (
    <ShellLayout title="Action" subtitle={action.title}>
      <RiDataGate>
        <div className="fg-card">
          <p>{action.description ?? '—'}</p>
          <p>Status: {action.status} · Priority: {action.priority ?? '—'}</p>
          <p>Due: {action.due_date ?? '—'} {action.overdue ? '(overdue)' : ''}</p>
          <p>Escalation: {action.escalation_status ?? '—'}</p>
        </div>
        <div className="fg-card">
          <h2>Linked evidence</h2>
          {evidence.length === 0 ? <p>No evidence has been linked.</p> : (
            <ul>{evidence.map((e) => <li key={e?.id}><Link href={`/ri/evidence/${e?.id}`}>{e?.title}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Linked findings</h2>
          {findings.length === 0 ? <p>No findings are linked.</p> : (
            <ul>{findings.map((f) => <li key={f?.id}><Link href={`/ri/findings/${f?.id}`}>{f?.title}</Link></li>)}</ul>
          )}
        </div>
        {canRi(ctx.role, 'action:write') && (
          <form action={updateActionDownstreamAction} className="fg-card fg-form">
            <input type="hidden" name="action_id" value={id} />
            <input type="hidden" name="updated_at" value={action.updated_at} />
            <label>Title<input name="title" defaultValue={action.title} /></label>
            <label>Status<input name="status" defaultValue={action.status} /></label>
            <label>Priority<input name="priority" defaultValue={action.priority ?? ''} /></label>
            <label>Due<input type="date" name="due_date" defaultValue={action.due_date ?? ''} /></label>
            <label>Escalation<input name="escalation_status" defaultValue={action.escalation_status ?? ''} /></label>
            <button type="submit" name="assign_self" value="1" className="fg-btn fg-btn--secondary">Assign to me</button>
            <button type="submit" className="fg-btn">Save</button>
          </form>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
