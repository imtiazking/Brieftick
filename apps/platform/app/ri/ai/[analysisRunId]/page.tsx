import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { submitAiReviewAction } from '@/lib/ri/server-actions-ai';
import { getAnalysisRun } from '@/lib/ri/services/ai-analysis';

export default async function AiAnalysisReviewPage({
  params,
}: {
  params: Promise<{ analysisRunId: string }>;
}) {
  const { analysisRunId } = await params;
  const ctx = await tryRiContext();
  if (!ctx) {
    return (
      <ShellLayout title="AI analysis">
        <RiDataGate><p>Sign in required.</p></RiDataGate>
      </ShellLayout>
    );
  }

  let detail;
  try {
    detail = await getAnalysisRun(ctx.supabase, ctx.organisationId, analysisRunId);
  } catch {
    notFound();
  }

  const { run, citations, reviews } = detail;
  const output = (run.structured_output || {}) as Record<string, unknown>;
  const canReview = canRi(ctx.role, 'ai:review');

  return (
    <ShellLayout title="AI analysis review" subtitle={`Run ${run.id}`}>
      <RiDataGate>
        <p className="fg-muted">
          <Link href="/ri/ai">← AI review queue</Link>
        </p>
        <div className="fg-card">
          <dl className="ri-dl">
            <dt>Use case</dt><dd className="ri-mono">{run.use_case_id}</dd>
            <dt>Execution</dt><dd><RiStatusChip label={run.execution_status} /></dd>
            <dt>Review</dt><dd><RiStatusChip label={run.review_status} /></dd>
            <dt>Freshness</dt><dd>{run.freshness}</dd>
            <dt>Provider</dt><dd className="ri-mono">{run.provider} / {run.model ?? '—'}</dd>
            <dt>Prompt version</dt><dd className="ri-mono">{run.prompt_version}</dd>
            <dt>Publication version</dt><dd className="ri-mono">{run.publication_version_id}</dd>
          </dl>
        </div>
        <div className="fg-card">
          <h2>Structured output</h2>
          <pre className="ri-mono fg-muted" style={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
        <div className="fg-card fg-card--flush">
          <h2>Citations / claims</h2>
          <table className="fg-table">
            <thead>
              <tr><th>#</th><th>Claim</th><th>Sections</th><th>Status</th></tr>
            </thead>
            <tbody>
              {citations.map((c) => (
                <tr key={c.id}>
                  <td>{c.claim_index}</td>
                  <td>{c.claim_text}</td>
                  <td className="ri-mono">{(c.source_section_ids || []).join(', ')}</td>
                  <td>{c.citation_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canReview &&
        run.freshness !== 'OUTDATED' &&
        run.review_status !== 'ACCEPTED' &&
        run.review_status !== 'REJECTED' &&
        run.review_status !== 'PARTIALLY_ACCEPTED' &&
        run.review_status !== 'SUPERSEDED' ? (
          <div className="fg-card">
            <h2>Human decision</h2>
            <p className="fg-muted">Accept, partially accept, or reject — no auto-accept on completion.</p>
            <div className="ri-form">
              <label>
                Accepted claim indexes (comma-separated)
                <input id="accepted-claims" name="accepted_claim_indexes" form="ai-review-form" placeholder="0,1" />
              </label>
              <label>
                Rejected claim indexes
                <input id="rejected-claims" name="rejected_claim_indexes" form="ai-review-form" placeholder="2" />
              </label>
              <label>Notes<textarea name="notes" rows={2} form="ai-review-form" /></label>
              <form id="ai-review-form" action={submitAiReviewAction}>
                <input type="hidden" name="run_id" value={run.id} />
              </form>
              <div className="ri-form__actions">
                <button form="ai-review-form" type="submit" name="decision" value="ACCEPTED" className="fg-btn fg-btn--primary">Accept</button>
                <button form="ai-review-form" type="submit" name="decision" value="PARTIALLY_ACCEPTED" className="fg-btn">Partially accept</button>
                <button form="ai-review-form" type="submit" name="decision" value="REJECTED" className="fg-btn fg-btn--ghost">Reject</button>
              </div>
            </div>
          </div>
        ) : null}
        {reviews.length > 0 ? (
          <div className="fg-card">
            <h2>Decision history</h2>
            <ul>
              {reviews.map((r) => (
                <li key={r.id}>
                  {r.decision} by {r.reviewer_user_id} — accepted [{r.accepted_claim_indexes?.join(',')}]
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </RiDataGate>
    </ShellLayout>
  );
}
