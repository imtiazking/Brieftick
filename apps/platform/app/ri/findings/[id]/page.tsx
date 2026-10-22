import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { canRi } from '@/lib/ri/permissions';
import { updateFindingAction } from '@/lib/ri/server-actions-downstream';
import { getFindingDetail } from '@/lib/ri/services/findings';

export default async function FindingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Finding"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getFindingDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { finding, controls, actions, assurance } = detail;

  return (
    <ShellLayout title="Finding" subtitle={finding.title}>
      <RiDataGate>
        <div className="fg-card">
          <p>{finding.description ?? '—'}</p>
          <p>Severity: {finding.severity} · Status: {finding.status}</p>
          <p>Due: {finding.due_date ?? '—'}</p>
        </div>
        <div className="fg-card">
          <h2>Linked controls</h2>
          {controls.length === 0 ? <p>No controls are linked.</p> : (
            <ul>{controls.map((c) => <li key={c?.id}><Link href={`/ri/controls/${c?.id}`}>{c?.name}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Linked actions</h2>
          {actions.length === 0 ? <p>No actions are linked.</p> : (
            <ul>{actions.map((a) => <li key={a?.id}><Link href={`/ri/actions/${a?.id}`}>{a?.title}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Assurance reviews</h2>
          {assurance.length === 0 ? <p>No assurance reviews linked.</p> : (
            <ul>{assurance.map((a) => <li key={a?.id}><Link href={`/ri/assurance/${a?.id}`}>{a?.result}</Link></li>)}</ul>
          )}
        </div>
        {canRi(ctx.role, 'finding:write') && (
          <form action={updateFindingAction} className="fg-card fg-form">
            <input type="hidden" name="finding_id" value={id} />
            <input type="hidden" name="updated_at" value={finding.updated_at} />
            <label>Title<input name="title" defaultValue={finding.title} /></label>
            <label>Severity<input name="severity" defaultValue={finding.severity} /></label>
            <label>Status<input name="status" defaultValue={finding.status} /></label>
            <button type="submit" className="fg-btn">Save</button>
          </form>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
