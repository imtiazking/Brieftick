import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDashboardMetrics } from '@/components/ri/ri-dashboard-metrics';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { tryRiContext } from '@/lib/ri/context';
import { getManagementReport } from '@/lib/ri/services/reporting';

export default async function ReportingPage() {
  const ctx = await tryRiContext();
  const report = ctx ? await getManagementReport(ctx.supabase, ctx.organisationId) : null;

  return (
    <ShellLayout title="Management reporting" subtitle="Aggregated regulatory posture (no AI narrative)">
      <RiDataGate>
        {!ctx || !report ? (
          <RiEmptyState title="Sign in required." />
        ) : (
          <>
            <RiDashboardMetrics summary={report} />
            <div className="fg-card">
              <h2>Material regulatory changes</h2>
              {report.materialChanges.length === 0 ? (
                <p className="fg-muted">No material changes recorded.</p>
              ) : (
                <ul>
                  {report.materialChanges.map((c) => (
                    <li key={c.id}>
                      <Link href={`/ri/changes/${c.id}`}>{c.title}</Link> ({c.materiality ?? '—'})
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="fg-card">
              <h2>Control / assurance signals</h2>
              <p>Open findings: {report.controlGaps}</p>
              <p className="fg-muted">Assurance in flight: {report.assuranceOpen}</p>
            </div>
          </>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
