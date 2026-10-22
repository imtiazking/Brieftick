import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiCatalogueStatusBanner } from '@/components/ri/ri-catalogue-status-banner';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { requireIngestionAdminContext } from '@/lib/ri/ingestion-admin-context';
import { listSourcesForIngestionAdmin } from '@/lib/ri/services/ingestion-admin';

export default async function IngestionSourcesAdminPage() {
  const ctx = await requireIngestionAdminContext();
  const sources = await listSourcesForIngestionAdmin(ctx.supabase);

  return (
    <ShellLayout title="RI ingestion sources" subtitle="Tenant source operations on the shared catalogue">
      <RiDataGate>
        <p>
          <Link href="/ri/admin/ingestion">Ingestion runs</Link> · <Link href="/ri/admin/alerts">Alerts</Link> ·{' '}
          <Link href="/ri/landscape/catalogue">Global catalogue</Link>
        </p>
        <RiCatalogueStatusBanner />
        <div className="fg-card fg-card--flush">
          <table className="fg-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Technical verification</th>
                <th>Semantic coverage</th>
                <th>Production enablement</th>
                <th>Ingestion mode</th>
                <th>Ops enabled</th>
                <th>Health</th>
                <th>Last success</th>
                <th>Next run</th>
                <th>Eligible</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.external_key}</td>
                  <td>{(s.verification_status ?? 'NOT_TESTED').replaceAll('_', ' ')}</td>
                  <td>{(s.coverage_verification_status ?? 'NOT_TESTED').replaceAll('_', ' ')}</td>
                  <td>{s.production_status === 'NOT_ENABLED' ? 'NOT ENABLED' : s.production_status}</td>
                  <td>{s.ingestion_mode}</td>
                  <td>{s.operations?.enabled ? 'yes' : 'no'}</td>
                  <td>{s.operations?.health_status ?? '—'}</td>
                  <td>{s.operations?.last_success_at?.slice(0, 10) ?? '—'}</td>
                  <td>{s.operations?.next_run_at?.slice(0, 16) ?? '—'}</td>
                  <td>{s.ingestionEligible ? 'yes' : `no (${s.eligibilityReason})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </RiDataGate>
    </ShellLayout>
  );
}
