import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDashboardMetrics } from '@/components/ri/ri-dashboard-metrics';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { tryRiContext } from '@/lib/ri/context';
import { RiLabPriorityMetrics } from '@/components/ri/ri-lab-priority-metrics';
import { mapProductionDashboardToLabPriority } from '@/lib/ri/lab-compat';
import { getDashboardSummary } from '@/lib/ri/services/dashboard';
import { isSupabaseBrowserConfigured } from '@/lib/env';

export default async function RegulatoryIntelligenceDashboardPage() {
  const ctx = await tryRiContext();
  const dataReady = isSupabaseBrowserConfigured();
  const summary = ctx ? await getDashboardSummary(ctx.supabase, ctx.organisationId) : null;

  return (
    <ShellLayout
      title="RI · Dashboard"
      subtitle="Operational summary from your organisation’s regulatory intelligence data"
    >
      <RiDataGate>
        {!dataReady ? (
          <RiEmptyState title="Connect Supabase to load live dashboard metrics." />
        ) : !ctx ? (
          <RiEmptyState title="Sign in and select an organisation to view your dashboard." />
        ) : (
          <>
            <div className="fg-banner" role="status">
              Live regulator ingestion is not enabled for production sources. Empty counts are expected until
              controlled publications exist in your tenant.
            </div>
            <RiLabPriorityMetrics metrics={mapProductionDashboardToLabPriority(summary!)} />
            <RiDashboardMetrics summary={summary!} />
            <div className="fg-card">
              <h2>Quick links</h2>
              <ul className="fg-link-list">
                <li><Link href="/ri/work-queue">Work queue</Link></li>
                <li><Link href="/ri/horizon">Horizon scanning</Link></li>
                <li><Link href="/ri/calendar">Regulatory calendar</Link></li>
                <li><Link href="/ri/reporting">Management reporting</Link></li>
                <li><Link href="/ri/landscape/catalogue">Global regulator catalogue</Link></li>
              </ul>
            </div>
          </>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
