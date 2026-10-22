import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { getObligationDownstreamTrace } from '@/lib/ri/services/trace';

export default async function ObligationTracePage({ params }: { params: Promise<{ obligationId: string }> }) {
  const { obligationId } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Trace"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let trace;
  try {
    trace = await getObligationDownstreamTrace(ctx.supabase, ctx.organisationId, obligationId);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { upstream, policies, risks, controls, actions, directEvidence, supportingEvidence, findings, assurance } =
    trace;
  const { obligation, impacts } = upstream;
  const change = Array.isArray(obligation.change) ? obligation.change[0] : obligation.change;
  const publication = change?.publication;
  const pub = Array.isArray(publication) ? publication[0] : publication;

  return (
    <ShellLayout title="Lifecycle trace" subtitle="Explicit relationships only">
      <RiDataGate>
        <p><Link href={`/ri/obligations/${obligationId}`}>← Obligation detail</Link></p>
        <div className="fg-card">
          <h2>Upstream</h2>
          <ol className="fg-trace">
            <li>Publication: {pub?.id ? <Link href={`/ri/publications/${pub.id}`}>{pub.title}</Link> : '—'}</li>
            <li>Change: {change?.id ? <Link href={`/ri/changes/${change.id}`}>{change.title}</Link> : '—'}</li>
            <li>
              Impact:{' '}
              {impacts.length
                ? impacts.map((i) => <Link key={i.id} href={`/ri/impact-assessments/${i.id}`}>{i.status}</Link>)
                : 'none'}
            </li>
            <li>Obligation: {obligation.obligation_statement}</li>
          </ol>
        </div>
        <div className="fg-card">
          <h2>Downstream</h2>
          <p>Policies: {policies.length ? policies.map((p) => <Link key={p.id} href={`/ri/policies/${p.id}`}>{p.name} </Link>) : 'none'}</p>
          <p>Risks: {risks.length ? risks.map((r) => <Link key={r.id} href={`/ri/risks/${r.id}`}>{r.title} </Link>) : 'none'}</p>
          <p>Controls: {controls.length ? controls.map((c) => <Link key={c.id} href={`/ri/controls/${c.id}`}>{c.name} </Link>) : 'none'}</p>
          <p>Actions: {actions.length ? actions.map((a) => <Link key={a.id} href={`/ri/actions/${a.id}`}>{a.title} </Link>) : 'none'}</p>
          <p>
            Direct evidence:{' '}
            {directEvidence.length
              ? directEvidence.map((e) => <Link key={e.id} href={`/ri/evidence/${e.id}`}>{e.title} </Link>)
              : 'none'}
          </p>
          <p>
            Supporting evidence (via shared control, not owned):{' '}
            {supportingEvidence.length
              ? supportingEvidence.map((e) => (
                  <span key={e.id}>
                    <Link href={`/ri/evidence/${e.id}`}>{e.title}</Link> (control {e.control_id}){' '}
                  </span>
                ))
              : 'none'}
          </p>
          <p>Findings (via linked controls): {findings.length ? findings.map((f) => <Link key={f.id} href={`/ri/findings/${f.id}`}>{f.title} </Link>) : 'none'}</p>
          <p>Assurance: {assurance.length ? assurance.map((a) => <Link key={a.id} href={`/ri/assurance/${a.id}`}>{a.result} </Link>) : 'none'}</p>
        </div>
      </RiDataGate>
    </ShellLayout>
  );
}
