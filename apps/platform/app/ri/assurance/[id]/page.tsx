import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { RiNotFoundError } from '@/lib/ri/errors';
import { getAssuranceDetail } from '@/lib/ri/services/assurance';

export default async function AssuranceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return <ShellLayout title="Assurance"><RiDataGate><p>Sign in required.</p></RiDataGate></ShellLayout>;
  }

  let detail;
  try {
    detail = await getAssuranceDetail(ctx.supabase, ctx.organisationId, id);
  } catch (e) {
    if (e instanceof RiNotFoundError) notFound();
    throw e;
  }

  const { review, controls, obligations, findings } = detail;

  return (
    <ShellLayout title="Assurance review" subtitle={review.review_type}>
      <RiDataGate>
        <div className="fg-card">
          <p>Result: {review.result}</p>
          <p>Review date: {review.review_date ?? '—'} · Next: {review.next_review_date ?? '—'}</p>
          <p>Reviewer: {review.reviewer_user_id ?? '—'}</p>
          <p>{review.notes ?? '—'}</p>
        </div>
        <div className="fg-card">
          <h2>Linked controls</h2>
          {controls.length === 0 ? <p>No controls linked.</p> : (
            <ul>{controls.map((c) => <li key={c?.id}><Link href={`/ri/controls/${c?.id}`}>{c?.name}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Linked obligations</h2>
          {obligations.length === 0 ? <p>No obligations linked.</p> : (
            <ul>{obligations.map((o) => <li key={o?.id}><Link href={`/ri/obligations/${o?.id}`}>{o?.obligation_statement?.slice(0, 100)}</Link></li>)}</ul>
          )}
        </div>
        <div className="fg-card">
          <h2>Related findings</h2>
          {findings.length === 0 ? <p>No findings linked.</p> : (
            <ul>{findings.map((f) => <li key={f?.id}><Link href={`/ri/findings/${f?.id}`}>{f?.title}</Link></li>)}</ul>
          )}
        </div>
      </RiDataGate>
    </ShellLayout>
  );
}
