import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { canRi } from '@/lib/ri/permissions';
import { updateControlAction } from '@/lib/ri/server-actions-downstream';
import { getControlDetail } from '@/lib/ri/services/controls';

function LinkList({
  title,
  empty,
  items,
  href,
  label,
}: {
  title: string;
  empty: string;
  items: { id?: string }[];
  href: (id: string) => string;
  label: (item: Record<string, unknown>) => string;
}) {
  return (
    <div className="fg-card">
      <h2>{title}</h2>
      {items.length === 0 ? <p>{empty}</p> : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link href={href(item.id!)}>{label(item as Record<string, unknown>)}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function ControlDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Control"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getControlDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { control, risks, obligations, evidence, findings, actions, assurance } = detail;

  return (
    <ShellLayout title="Control" subtitle={control.name}>
      <RiDataGate>
        <div className="fg-card">
          <p>{control.description ?? '—'}</p>
          <p>Owner: {control.owner_user_id}</p>
          <p>Type: {control.control_type ?? '—'} · Frequency: {control.frequency ?? '—'}</p>
          <p>Nature: {control.nature ?? '—'} · Execution: {control.execution_type ?? '—'}</p>
          <p>Effectiveness: {control.effectiveness ?? '—'} · Testing: {control.testing_status ?? '—'}</p>
          <p>Status: {control.status ?? '—'}</p>
        </div>
        <LinkList
          title="Linked risks"
          empty="No risks are linked to this control."
          items={risks.filter(Boolean) as { id: string }[]}
          href={(rid) => `/ri/risks/${rid}`}
          label={(r) => String(r.title ?? r.id)}
        />
        <LinkList
          title="Linked obligations"
          empty="No obligations are linked to this control."
          items={obligations.filter(Boolean) as { id: string }[]}
          href={(oid) => `/ri/obligations/${oid}`}
          label={(o) => String(o.obligation_statement ?? o.id).slice(0, 100)}
        />
        <LinkList
          title="Linked evidence"
          empty="No evidence has been linked."
          items={evidence.filter(Boolean) as { id: string }[]}
          href={(eid) => `/ri/evidence/${eid}`}
          label={(e) => String(e.title ?? e.id)}
        />
        <LinkList
          title="Linked findings"
          empty="No findings are linked."
          items={findings.filter(Boolean) as { id: string }[]}
          href={(fid) => `/ri/findings/${fid}`}
          label={(f) => `${f.title ?? f.id} (${f.severity ?? '—'})`}
        />
        <LinkList
          title="Linked actions"
          empty="No actions are linked."
          items={actions.filter(Boolean) as { id: string }[]}
          href={(aid) => `/ri/actions/${aid}`}
          label={(a) => String(a.title ?? a.id)}
        />
        <LinkList
          title="Assurance reviews"
          empty="No assurance review has been completed."
          items={assurance.filter(Boolean) as { id: string }[]}
          href={(sid) => `/ri/assurance/${sid}`}
          label={(a) => `${a.review_type ?? 'Review'} — ${a.result ?? '—'}`}
        />
        {canRi(ctx.role, 'control:write') && (
          <form action={updateControlAction} className="fg-card fg-form">
            <input type="hidden" name="control_id" value={id} />
            <input type="hidden" name="updated_at" value={control.updated_at} />
            <label>Name<input name="name" defaultValue={control.name} /></label>
            <label>Effectiveness<input name="effectiveness" defaultValue={control.effectiveness ?? ''} /></label>
            <label>Testing status<input name="testing_status" defaultValue={control.testing_status ?? ''} /></label>
            <label>Status<input name="status" defaultValue={control.status ?? ''} /></label>
            <button type="submit" className="fg-btn">Save</button>
          </form>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
