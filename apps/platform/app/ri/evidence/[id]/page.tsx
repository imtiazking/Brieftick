import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { canRi } from '@/lib/ri/permissions';
import { linkEvidenceAction } from '@/lib/ri/server-actions-downstream';
import { getEvidenceDetail } from '@/lib/ri/services/evidence';

export default async function EvidenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Evidence"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getEvidenceDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { evidence, obligations, controls, actions } = detail;

  return (
    <ShellLayout title="Evidence" subtitle={evidence.title}>
      <RiDataGate>
        <div className="fg-card">
          <p>Type: {evidence.evidence_type}</p>
          <p>{evidence.description ?? '—'}</p>
          {evidence.source_url ? <p>Source: <a href={evidence.source_url}>{evidence.source_url}</a></p> : null}
          <p>Hash: {evidence.source_hash ?? '—'}</p>
          <p>Uploaded by: {evidence.uploaded_by ?? '—'}</p>
        </div>
        <div className="fg-card">
          <h2>Linked obligations (direct ownership)</h2>
          {obligations.length === 0 ? <p>No obligations are linked.</p> : (
            <ul>{obligations.map((o) => <li key={o?.id}><Link href={`/ri/obligations/${o?.id}`}>{o?.obligation_statement?.slice(0, 100)}</Link></li>)}</ul>
          )}
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
        {canRi(ctx.role, 'evidence:write') && (
          <form action={linkEvidenceAction} className="fg-card fg-form">
            <h3>Link to obligation or control</h3>
            <input type="hidden" name="evidence_id" value={id} />
            <label>Link type
              <select name="link_type">
                <option value="obligation">Obligation</option>
                <option value="control">Control</option>
              </select>
            </label>
            <label>Target ID<input name="target_id" required /></label>
            <button type="submit" className="fg-btn">Link</button>
          </form>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
