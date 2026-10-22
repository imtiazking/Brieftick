import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { listPublicationsForOrganisation } from '@/lib/ri/services/publications';

export default async function PublicationsListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listPublicationsForOrganisation(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Publications" subtitle="Global regulator publications with organisation workflow state">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in and select an organisation to view publications.</p></div>
        ) : rows.length === 0 ? (
          <div className="fg-card">
            <h2>No publications yet</h2>
            <p>No regulatory publications have been ingested yet. Production ingestion remains disabled.</p>
            <p className="fg-muted">
              For local development, use <code>FORGENIQ_RI_DEV_FIXTURES=1 npm run ri:seed-dev-publication</code>{' '}
              (TEST DATA only).
            </p>
          </div>
        ) : (
          <div className="fg-card fg-card--flush">
            <table className="fg-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Regulator</th>
                  <th>Published</th>
                  <th>Triage</th>
                  <th>Applicability</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/ri/publications/${p.id}`}>{p.title}</Link>
                      {p.data_origin?.includes('test') || p.data_origin === 'dev_fixture' ? (
                        <span className="fg-tag fg-tag--warn">TEST</span>
                      ) : null}
                    </td>
                    <td>{p.regulator?.acronym ?? '—'}</td>
                    <td>{p.publication_date ?? '—'}</td>
                    <td>
                      {p.orgState ? (
                        <RiStatusChip label={p.orgState.triage_status} />
                      ) : (
                        <span className="fg-muted">NEW</span>
                      )}
                    </td>
                    <td>
                      {p.applicability ? (
                        <RiStatusChip label={p.applicability.recommendation} />
                      ) : (
                        'UNASSESSED'
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
