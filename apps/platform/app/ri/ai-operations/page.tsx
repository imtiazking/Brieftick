import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { listProviderHealth } from '@/lib/ri/ai/provider-registry';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { listAnalysisRuns } from '@/lib/ri/services/ai-analysis';

export default async function AiOperationsPage() {
  const ctx = await tryRiContext();
  const runs = ctx ? await listAnalysisRuns(ctx.supabase, ctx.organisationId, 50) : [];
  const providers = await listProviderHealth(
    ctx ? { supabase: ctx.supabase, organisationId: ctx.organisationId } : undefined,
  );

  return (
    <ShellLayout
      title="AI Operations"
      subtitle="Operational monitoring of FORGENIQ AI — executions, provider status, failures, latency and processing health."
    >
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : !canRi(ctx.role, 'ai:read') ? (
          <RiEmptyState title="Insufficient permissions." />
        ) : (
          <>
            <p className="fg-muted">
              <Link href="/ri/ai-governance">AI Governance</Link> — policy and use-case register.
            </p>
            <div className="fg-card">
              <h2>Provider status</h2>
              <ul>
                {providers.map((p) => (
                  <li key={p.id}>
                    {p.label}
                    {p.active ? ' (active runtime)' : ''}: {p.status}
                    {p.mode !== 'fixture' && !p.executionEnabled ? ' · live execution OFF' : ''}
                    <span className="fg-muted"> — {p.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="fg-card fg-card--flush">
              <h2>Executions</h2>
              {runs.length === 0 ? (
                <p className="fg-muted">No executions yet.</p>
              ) : (
                <table className="fg-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Use case</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Provider</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td>{r.created_at?.slice(0, 16).replace('T', ' ')}</td>
                        <td className="ri-mono">{r.use_case_id}</td>
                        <td>{r.execution_status}</td>
                        <td>{r.latency_ms != null ? `${r.latency_ms}ms` : '—'}</td>
                        <td className="ri-mono">{r.provider}</td>
                        <td><Link href={`/ri/ai/${r.id}`}>Detail</Link></td>
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
