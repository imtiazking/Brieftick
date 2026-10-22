import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { requireIngestionAdminContext } from '@/lib/ri/ingestion-admin-context';
import { listIngestionRuns } from '@/lib/ri/services/ingestion-admin';

export default async function IngestionRunsAdminPage() {
  const ctx = await requireIngestionAdminContext();
  const runs = await listIngestionRuns(ctx.supabase);

  return (
    <ShellLayout title="RI ingestion runs" subtitle="Manual and test ingestion history">
      <RiDataGate>
        <p>
          <Link href="/ri/admin/sources">Sources</Link> · <Link href="/ri/admin/alerts">Alerts</Link>
        </p>
        {runs.length === 0 ? (
          <div className="fg-card"><p>No ingestion runs yet. Use local CLI: npm run ri:ingest</p></div>
        ) : (
          <div className="fg-card fg-card--flush">
            <table className="fg-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Trigger</th>
                  <th>Attempt</th>
                  <th>Discovered</th>
                  <th>New</th>
                  <th>Updated</th>
                  <th>Unchanged</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/ri/admin/ingestion/${r.id}`}>{r.source?.external_key ?? r.id.slice(0, 8)}</Link>
                    </td>
                    <td>{r.status}</td>
                    <td>{r.trigger_type}</td>
                    <td>{r.attempt_number}</td>
                    <td>{r.records_discovered}</td>
                    <td>{r.records_new}</td>
                    <td>{r.records_updated}</td>
                    <td>{r.records_unchanged}</td>
                    <td>{r.records_failed}</td>
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
