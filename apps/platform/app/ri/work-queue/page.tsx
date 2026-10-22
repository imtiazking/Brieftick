import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { RiStatusChip } from '@/components/ri/ri-status-chip';
import { tryRiContext } from '@/lib/ri/context';
import { buildWorkQueue } from '@/lib/ri/services/work-queue';

export default async function WorkQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const sp = await searchParams;
  const scope =
    sp.scope === 'team' ? 'team' : sp.scope === 'all' ? 'all' : 'mine';
  const ctx = await tryRiContext();
  const items =
    ctx ? await buildWorkQueue(ctx.supabase, ctx.organisationId, scope, ctx.userId) : [];

  const emptyTitle =
    scope === 'mine'
      ? 'No work items require your attention.'
      : scope === 'team'
        ? 'No team work items in this scope.'
        : 'No work items in the queue.';

  return (
    <ShellLayout
      title="Work queue"
      subtitle="Operational tasks assigned to people and teams — distinct from dashboard alerts"
    >
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : (
          <>
            <p className="fg-muted ri-toolbar">
              <Link
                href="/ri/work-queue?scope=all"
                className={scope === 'all' ? 'fg-ri-subnav__link--active' : ''}
              >
                All
              </Link>
              {' · '}
              <Link
                href="/ri/work-queue?scope=mine"
                className={scope === 'mine' ? 'fg-ri-subnav__link--active' : ''}
              >
                My work
              </Link>
              {' · '}
              <Link
                href="/ri/work-queue?scope=team"
                className={scope === 'team' ? 'fg-ri-subnav__link--active' : ''}
              >
                My team
              </Link>
            </p>
            {items.length === 0 ? (
              <RiEmptyState title={emptyTitle} />
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Type</th>
                      <th>Owner</th>
                      <th>Priority</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th>SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className={i.overdue ? 'ri-row--danger' : undefined}>
                        <td>
                          <Link href={i.href}>{i.title}</Link>
                          <span className="ri-mono fg-muted"> {i.recordId}</span>
                        </td>
                        <td>{i.entityType}</td>
                        <td className="ri-mono">{i.owner ?? '—'}</td>
                        <td>{i.priority ?? '—'}</td>
                        <td>{i.dueDate ?? '—'}</td>
                        <td>{i.status ? <RiStatusChip label={i.status} /> : '—'}</td>
                        <td>{i.slaState}</td>
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
