import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { listObligations, summarizeObligationListRows } from '@/lib/ri/services/obligations';
import { UI_LABEL_OPEN_OBLIGATIONS } from '@/lib/ri/lab-compat/obligation-portfolio.mjs';

export default async function ObligationsListPage() {
  const ctx = await tryRiContext();
  const rows = ctx ? await listObligations(ctx.supabase, ctx.organisationId) : [];
  const portfolio = summarizeObligationListRows(rows);
  const highCount = rows.filter((o) => o.priority === 'High').length;

  return (
    <ShellLayout title="Obligations" subtitle="Canonical obligation taxonomy — organisation scope">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : rows.length === 0 ? (
          <RiEmptyState
            title="No obligations currently require your attention."
            detail="Create obligations from regulatory changes after impact assessment."
          />
        ) : (
          <>
            <p className="ri-metrics-row fg-card">
              <span>Total<strong>{portfolio.counts.TOTAL}</strong></span>
              <span>{UI_LABEL_OPEN_OBLIGATIONS}<strong>{portfolio.counts.ACTIVE}</strong></span>
              <span>Draft<strong>{portfolio.counts.DRAFT}</strong></span>
              <span>In review<strong>{portfolio.counts.REVIEW}</strong></span>
              <span>Overdue (active)<strong>{portfolio.flags.overdueActive}</strong></span>
              <span>High<strong>{highCount}</strong></span>
            </p>
            <div className="fg-card fg-card--flush">
              <table className="fg-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Statement</th>
                    <th>Source</th>
                    <th>Owner</th>
                    <th>Priority</th>
                    <th>Effective</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const pub = Array.isArray(o.publication) ? o.publication[0] : o.publication;
                    const displayId = o.external_key ?? o.id.slice(0, 8);
                    return (
                      <tr key={o.id}>
                        <td><Link href={`/ri/obligations/${o.id}`}>{displayId}</Link></td>
                        <td>{o.obligation_statement.slice(0, 72)}{o.obligation_statement.length > 72 ? '…' : ''}</td>
                        <td>
                          {pub?.id ? <Link href={`/ri/publications/${pub.id}`}>{pub.title}</Link> : '—'}
                        </td>
                        <td>{o.owner_user_id ?? '—'}</td>
                        <td>{o.priority ?? '—'}</td>
                        <td>{o.effective_date ?? '—'}</td>
                        <td>{o.due_date ?? '—'}</td>
                        <td><RiStatusChip label={o.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
