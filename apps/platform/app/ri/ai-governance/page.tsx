import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { AI_USE_CASE_CATALOG } from '@/lib/ri/ai/use-case-catalog';
import { listProviderHealth } from '@/lib/ri/ai/provider-registry';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { listAnalysisRuns } from '@/lib/ri/services/ai-analysis';

export default async function AiGovernancePage() {
  const ctx = await tryRiContext();
  const runs = ctx ? await listAnalysisRuns(ctx.supabase, ctx.organisationId, 30) : [];
  const providers = listProviderHealth();

  return (
    <ShellLayout
      title="AI Governance"
      subtitle="Governance and oversight of FORGENIQ AI — approved use cases, model versions, analysis quality, grounding and human review."
    >
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : !canRi(ctx.role, 'ai:governance') && !canRi(ctx.role, 'ai:read') ? (
          <RiEmptyState title="Insufficient permissions." />
        ) : (
          <>
            <div className="fg-card">
              <p className="fg-muted">
                AI remains advisory. Human review is required before regulatory decisions.{' '}
                <Link href="/ri/ai-operations">AI Operations</Link> ·{' '}
                <Link href="/ri/ai">Review queue</Link>
              </p>
            </div>
            <div className="fg-card fg-card--flush">
              <h2>Approved use cases</h2>
              <table className="fg-table">
                <thead>
                  <tr><th>ID</th><th>Name</th><th>Risk</th><th>Human review</th><th>Prompt</th></tr>
                </thead>
                <tbody>
                  {AI_USE_CASE_CATALOG.map((u) => (
                    <tr key={u.id}>
                      <td className="ri-mono">{u.id}</td>
                      <td>{u.name}</td>
                      <td>{u.riskClassification}</td>
                      <td>{u.humanOversightRequired ? 'Required' : '—'}</td>
                      <td className="ri-mono">{u.promptVersion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fg-card">
              <h2>Provider / model posture</h2>
              <ul>
                {providers.map((p) => (
                  <li key={p.id}>{p.id} — {p.mode} — {p.status}</li>
                ))}
              </ul>
            </div>
            <div className="fg-card fg-card--flush">
              <h2>Recent analysis health</h2>
              {runs.length === 0 ? (
                <p className="fg-muted">No AI runs recorded for this organisation.</p>
              ) : (
                <table className="fg-table">
                  <thead>
                    <tr><th>Use case</th><th>Status</th><th>Review</th><th>Freshness</th><th>Citation</th></tr>
                  </thead>
                  <tbody>
                    {runs.slice(0, 15).map((r) => (
                      <tr key={r.id}>
                        <td className="ri-mono">{r.use_case_id}</td>
                        <td>{r.execution_status}</td>
                        <td>{r.review_status}</td>
                        <td>{r.freshness}</td>
                        <td>{r.error_code === 'AI_CITATION_INVALID' ? 'Invalid' : 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
