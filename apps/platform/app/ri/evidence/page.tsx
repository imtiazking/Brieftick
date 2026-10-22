import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { createEvidenceAction } from '@/lib/ri/server-actions-downstream';
import { listEvidence } from '@/lib/ri/services/evidence';

export default async function EvidenceListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listEvidence(ctx.supabase, ctx.organisationId) : [];

  return (
    <ShellLayout title="Evidence" subtitle="Metadata-only evidence records (no file upload)">
      <RiDataGate>
        {!ctx ? (
          <div className="fg-card"><p>Sign in required.</p></div>
        ) : (
          <>
            {canRi(ctx.role, 'evidence:write') && (
              <form action={createEvidenceAction} className="fg-card fg-form">
                <h2>New evidence</h2>
                <label>Title<input name="title" required /></label>
                <label>Type<input name="evidence_type" required defaultValue="document" /></label>
                <label>Source URL<input name="source_url" /></label>
                <label>Content hash<input name="source_hash" /></label>
                <label>Description<textarea name="description" rows={2} /></label>
                <button type="submit" className="fg-btn">Create</button>
              </form>
            )}
            {rows.length === 0 ? (
              <div className="fg-card"><p>No evidence yet.</p></div>
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr><th>Title</th><th>Type</th><th>Hash</th><th>Created</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td><Link href={`/ri/evidence/${e.id}`}>{e.title}</Link></td>
                        <td>{e.evidence_type}</td>
                        <td>{e.source_hash ?? '—'}</td>
                        <td>{e.created_at?.slice(0, 10) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
