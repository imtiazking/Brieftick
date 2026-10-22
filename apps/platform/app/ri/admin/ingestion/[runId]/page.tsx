import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { requireIngestionAdminContext } from '@/lib/ri/ingestion-admin-context';
import { getIngestionRunDetail } from '@/lib/ri/services/ingestion-admin';

export default async function IngestionRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const ctx = await requireIngestionAdminContext();
  let detail;
  try {
    detail = await getIngestionRunDetail(ctx.supabase, runId);
  } catch {
    notFound();
  }

  const { run, items } = detail;

  return (
    <ShellLayout title="Ingestion run" subtitle={run.source?.external_key ?? runId}>
      <RiDataGate>
        <p><Link href="/ri/admin/ingestion">← All runs</Link></p>
        <div className="fg-card">
          <p>Status: {run.status} · Type: {run.run_type}</p>
          <p>Started: {run.started_at ?? '—'} · Completed: {run.completed_at ?? '—'}</p>
          <p>{run.error_summary ?? 'No errors'}</p>
        </div>
        <div className="fg-card fg-card--flush">
          <table className="fg-table">
            <thead>
              <tr><th>Title</th><th>Normalisation</th><th>Publication</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.title ?? '—'}</td>
                  <td>{i.normalisation_status}</td>
                  <td>{i.publication_id ? <Link href={`/ri/publications/${i.publication_id}`}>view</Link> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </RiDataGate>
    </ShellLayout>
  );
}
