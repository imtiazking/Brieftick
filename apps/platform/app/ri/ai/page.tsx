import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { listAnalysisRuns } from '@/lib/ri/services/ai-analysis';

export default async function AiReviewQueuePage() {
  const ctx = await tryRiContext();
  const runs = ctx ? await listAnalysisRuns(ctx.supabase, ctx.organisationId, 80) : [];
  const queue = runs.filter((r) =>
    ['HUMAN_REVIEW_REQUIRED', 'AI_DRAFT', 'PARTIALLY_ACCEPTED'].includes(r.review_status),
  );

  return (
    <ShellLayout title="AI review" subtitle="Human review of advisory AI outputs">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : !canRi(ctx.role, 'ai:read') ? (
          <RiEmptyState title="You do not have access to AI review." />
        ) : queue.length === 0 ? (
          <RiEmptyState title="No AI outputs are awaiting human review." />
        ) : (
          <div className="fg-card fg-card--flush">
            <table className="fg-table">
              <thead>
                <tr>
                  <th>Use case</th>
                  <th>Execution</th>
                  <th>Review</th>
                  <th>Freshness</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queue.map((r) => (
                  <tr key={r.id}>
                    <td className="ri-mono">{r.use_case_id}</td>
                    <td><RiStatusChip label={r.execution_status} /></td>
                    <td><RiStatusChip label={r.review_status} /></td>
                    <td>{r.freshness}</td>
                    <td><Link href={`/ri/ai/${r.id}`}>Open review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
