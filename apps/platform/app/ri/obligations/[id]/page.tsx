import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { OBLIGATION_STATUSES } from '@/lib/ri/enums';
import { canRi } from '@/lib/ri/permissions';
import { updateObligationAction } from '@/lib/ri/server-actions';
import { linkObligationControlAction, linkObligationPolicyAction, linkObligationRiskAction } from '@/lib/ri/server-actions-downstream';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { getObligationDetail } from '@/lib/ri/services/obligations';
import { getObligationDownstreamTrace } from '@/lib/ri/services/trace';

export default async function ObligationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Obligation"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  let downstream;
  try {
    detail = await getObligationDetail(ctx.supabase, ctx.organisationId, id);
    downstream = await getObligationDownstreamTrace(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { obligation, impacts } = detail;
  const { policies, risks, controls, actions, directEvidence, supportingEvidence, findings, assurance } = downstream;
  const change = Array.isArray(obligation.change) ? obligation.change[0] : obligation.change;
  const publication = change?.publication;
  const pub = Array.isArray(publication) ? publication[0] : publication;

  return (
    <ShellLayout title="Obligation" subtitle="Publication → change → obligation → downstream">
      <RiDataGate>
        <p><Link href={`/ri/trace/${id}`}>Full lifecycle trace</Link></p>
        <div className="fg-card">
          <h2>Traceability</h2>
          <ol className="fg-trace">
            <li>Publication: {pub?.id ? <Link href={`/ri/publications/${pub.id}`}>{pub.title}</Link> : '—'}</li>
            <li>Change: {change?.id ? <Link href={`/ri/changes/${change.id}`}>{change.title}</Link> : '—'}</li>
            <li>Impact assessments: {impacts.length ? impacts.map((i) => <Link key={i.id} href={`/ri/impact-assessments/${i.id}`}>{i.status}</Link>) : 'none'}</li>
            <li>Obligation: {obligation.obligation_statement}</li>
          </ol>
        </div>
        <div className="fg-card">
          <h2>Linked policies</h2>
          {policies.length === 0 ? <p>No policies are linked to this obligation.</p> : (
            <ul>{policies.map((p) => <li key={p.id}><Link href={`/ri/policies/${p.id}`}>{p.name}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Linked risks</h2>
          {risks.length === 0 ? <p>No risks are linked to this obligation.</p> : (
            <ul>{risks.map((r) => <li key={r.id}><Link href={`/ri/risks/${r.id}`}>{r.title}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Linked controls</h2>
          {controls.length === 0 ? <p>No controls are linked to this obligation.</p> : (
            <ul>{controls.map((c) => <li key={c.id}><Link href={`/ri/controls/${c.id}`}>{c.name}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Actions</h2>
          {actions.length === 0 ? <p>No actions linked.</p> : (
            <ul>{actions.map((a) => <li key={a.id}><Link href={`/ri/actions/${a.id}`}>{a.title}</Link> ({a.status})</li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Direct evidence</h2>
          {directEvidence.length === 0 ? <p>No evidence is directly linked to this obligation.</p> : (
            <ul>{directEvidence.map((e) => <li key={e.id}><Link href={`/ri/evidence/${e.id}`}>{e.title}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Supporting evidence (via shared control)</h2>
          {supportingEvidence.length === 0 ? <p>No supporting evidence via shared controls.</p> : (
            <ul>
              {supportingEvidence.map((e) => (
                <li key={`${e.id}-${e.control_id}`}>
                  <Link href={`/ri/evidence/${e.id}`}>{e.title}</Link> — supporting via control{' '}
                  <Link href={`/ri/controls/${e.control_id}`}>{e.control_id.slice(0, 8)}…</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Findings (via linked controls)</h2>
          {findings.length === 0 ? <p>No findings on linked controls.</p> : (
            <ul>{findings.map((f) => <li key={f.id}><Link href={`/ri/findings/${f.id}`}>{f.title}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Assurance</h2>
          {assurance.length === 0 ? <p>No assurance review has been completed for this obligation.</p> : (
            <ul>{assurance.map((a) => <li key={a.id}><Link href={`/ri/assurance/${a.id}`}>{a.result}</Link></li>)}</ul>
          )}
        </div>
        {canRi(ctx.role, 'obligation:write') && (
          <div className="fg-card fg-form">
            <h3>Link downstream (IDs)</h3>
            <form action={linkObligationPolicyAction} className="fg-inline-form">
              <input type="hidden" name="obligation_id" value={id} />
              <label>Policy ID<input name="policy_id" /></label>
              <button type="submit" className="fg-btn">Link policy</button>
            </form>
            <form action={linkObligationRiskAction} className="fg-inline-form">
              <input type="hidden" name="obligation_id" value={id} />
              <label>Risk ID<input name="risk_id" /></label>
              <button type="submit" className="fg-btn">Link risk</button>
            </form>
            <form action={linkObligationControlAction} className="fg-inline-form">
              <input type="hidden" name="obligation_id" value={id} />
              <label>Control ID<input name="control_id" /></label>
              <button type="submit" className="fg-btn">Link control</button>
            </form>
          </div>
        )}
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
