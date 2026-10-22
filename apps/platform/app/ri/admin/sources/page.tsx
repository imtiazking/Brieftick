import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { requireIngestionAdminContext } from '@/lib/ri/ingestion-admin-context';
import { listSourcesForIngestionAdmin } from '@/lib/ri/services/ingestion-admin';

export default async function IngestionSourcesAdminPage() {
  const ctx = await requireIngestionAdminContext();
  const sources = await listSourcesForIngestionAdmin(ctx.supabase);

  return (
    <ShellLayout title="RI ingestion sources" subtitle="Semantic coverage and test eligibility">
      <RiDataGate>
        <p><Link href="/ri/admin/ingestion">← Ingestion runs</Link></p>
        <div className="fg-card fg-card--flush">
          <table className="fg-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Coverage</th>
                <th>Production</th>
                <th>Ingestion mode</th>
                <th>Eligible</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.external_key}</td>
                  <td>{s.coverage_verification_status}</td>
                  <td>{s.production_status}</td>
                  <td>{s.ingestion_mode}</td>
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
