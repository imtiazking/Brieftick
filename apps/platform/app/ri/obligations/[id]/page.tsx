import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { OBLIGATION_STATUSES } from '@/lib/ri/enums';
import { canRi } from '@/lib/ri/permissions';
import { updateObligationAction } from '@/lib/ri/server-actions';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { getObligationDetail } from '@/lib/ri/services/obligations';

export default async function ObligationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Obligation"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getObligationDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { obligation, impacts } = detail;
  const change = Array.isArray(obligation.change) ? obligation.change[0] : obligation.change;
  const publication = change?.publication;
  const pub = Array.isArray(publication) ? publication[0] : publication;

  return (
    <ShellLayout title="Obligation" subtitle="Publication → change → obligation">
      <RiDataGate>
        <div className="fg-card">
          <h2>Traceability</h2>
          <ol className="fg-trace">
            <li>Publication: {pub?.id ? <Link href={`/ri/publications/${pub.id}`}>{pub.title}</Link> : '—'}</li>
            <li>Change: {change?.id ? <Link href={`/ri/changes/${change.id}`}>{change.title}</Link> : '—'}</li>
            <li>Impact assessments: {impacts.length ? impacts.map((i) => <Link key={i.id} href={`/ri/impact-assessments/${i.id}`}>{i.status}</Link>) : 'none'}</li>
            <li>Obligation: {obligation.obligation_statement}</li>
          </ol>
        </div>
        {canRi(ctx.role, 'obligation:write') && (
          <form action={updateObligationAction} className="fg-card fg-form">
            <input type="hidden" name="obligation_id" value={id} />
            <input type="hidden" name="updated_at" value={obligation.updated_at} />
            <label>Statement<textarea name="obligation_statement" rows={4} defaultValue={obligation.obligation_statement} /></label>
            <label>Citation<input name="citation" defaultValue={obligation.citation ?? ''} /></label>
            <label>Source section<input name="source_section" defaultValue={obligation.source_section ?? ''} /></label>
            <label>Priority<input name="priority" defaultValue={obligation.priority ?? ''} /></label>
            <label>Status
              <select name="status" defaultValue={obligation.status}>
                {OBLIGATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>Due date<input type="date" name="due_date" defaultValue={obligation.due_date ?? ''} /></label>
            <button type="submit" className="fg-btn">Save</button>
          </form>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
