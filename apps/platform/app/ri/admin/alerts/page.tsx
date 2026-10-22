import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { requireIngestionAdminContext } from '@/lib/ri/ingestion-admin-context';
import { acknowledgeAlertAction } from '@/lib/ri/server-actions-ingestion-ops';
import { listOperationalAlerts } from '@/lib/ri/services/ingestion-admin';

export default async function OperationalAlertsPage() {
  const ctx = await requireIngestionAdminContext();
  const alerts = await listOperationalAlerts(ctx.supabase);

  return (
    <ShellLayout title="Operational alerts" subtitle="Ingestion and source health">
      <RiDataGate>
        <p>
          <Link href="/ri/admin/sources">Sources</Link> · <Link href="/ri/admin/ingestion">Runs</Link>
        </p>
        {alerts.length === 0 ? (
          <div className="fg-card"><p>No operational alerts.</p></div>
        ) : (
          <div className="fg-card fg-card--flush">
            <table className="fg-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Source</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>First seen</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.severity}</td>
                    <td>{a.source?.external_key ?? '—'}</td>
                    <td>{a.title}</td>
                    <td>{a.status}</td>
                    <td>{a.first_seen_at?.slice(0, 19) ?? '—'}</td>
                    <td>{a.last_seen_at?.slice(0, 19) ?? '—'}</td>
                    <td>
                      {a.status === 'OPEN' && (
                        <form action={acknowledgeAlertAction}>
                          <input type="hidden" name="alert_id" value={a.id} />
                          <button type="submit" className="fg-btn fg-btn--secondary">Acknowledge</button>
                        </form>
                      )}
                    </td>
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
