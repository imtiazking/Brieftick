import Link from 'next/link';
import type { AnalysisRunRow } from '@/lib/ri/services/ai-analysis';
import { AI_USE_CASE_CATALOG } from '@/lib/ri/ai/use-case-catalog';
import { getProviderStatusForUi } from '@/lib/ri/services/ai-analysis';
import { requestPublicationAiAnalysisAction } from '@/lib/ri/server-actions-ai';
import { RiStatusChip } from '@/components/ri/ri-status-chip';

type Props = {
  publicationId: string;
  publicationVersionId: string | null;
  runs: AnalysisRunRow[];
  canRequest: boolean;
};

export function RiPublicationAiPanel({
  publicationId,
  publicationVersionId,
  runs,
  canRequest,
}: Props) {
  const provider = getProviderStatusForUi();

  return (
    <section className="fg-card ri-subsection">
      <h2>AI analysis</h2>
      <p className="fg-muted">
        Advisory analysis only — human review required before any regulatory decision.{' '}
        {provider.label}
      </p>
      {!publicationVersionId ? (
        <p className="fg-muted">No publication version available for grounded analysis.</p>
      ) : canRequest ? (
        <div className="ri-toolbar ri-toolbar--wrap">
          {AI_USE_CASE_CATALOG.filter((u) => u.status === 'Active').map((uc) => (
            <form key={uc.id} action={requestPublicationAiAnalysisAction}>
              <input type="hidden" name="publication_id" value={publicationId} />
              <input type="hidden" name="publication_version_id" value={publicationVersionId} />
              <input type="hidden" name="use_case_id" value={uc.id} />
              <button type="submit" className="fg-btn fg-btn--ghost fg-btn--sm">
                Run {uc.name}
              </button>
            </form>
          ))}
        </div>
      ) : (
        <p className="fg-muted">You do not have permission to request AI analysis.</p>
      )}
      {runs.length === 0 ? (
        <p className="fg-muted">No AI analyses for this publication yet.</p>
      ) : (
        <table className="fg-table">
          <thead>
            <tr>
              <th>Use case</th>
              <th>Status</th>
              <th>Review</th>
              <th>Freshness</th>
              <th>Provider</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="ri-mono">{r.use_case_id}</td>
                <td><RiStatusChip label={r.execution_status} /></td>
                <td><RiStatusChip label={r.review_status} /></td>
                <td>{r.freshness}</td>
                <td className="ri-mono">{r.provider}</td>
                <td><Link href={`/ri/ai/${r.id}`}>Review</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
