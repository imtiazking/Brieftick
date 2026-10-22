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
  const scope = sp.scope === 'team' ? 'team' : 'mine';
  const ctx = await tryRiContext();
  const items =
    ctx ? await buildWorkQueue(ctx.supabase, ctx.organisationId, scope, ctx.userId) : [];

  return (
    <ShellLayout title="Work queue" subtitle="Tenant workflow items requiring attention">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : (
          <>
            <p className="fg-muted">
              <Link href="/ri/work-queue?scope=mine" className={scope === 'mine' ? 'fg-ri-subnav__link--active' : ''}>
                My work
              </Link>
              {' · '}
              <Link href="/ri/work-queue?scope=team" className={scope === 'team' ? 'fg-ri-subnav__link--active' : ''}>
                My team
              </Link>
            </p>
            {items.length === 0 ? (
              <RiEmptyState title="No obligations currently require your attention." />
            ) : (
              <div className="fg-card fg-card--flush">
                <table className="fg-table">
                  <thead>
                    <tr><th>Kind</th><th>Item</th><th>Status</th><th>Due</th></tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.kind}</td>
                        <td><Link href={i.href}>{i.title}</Link></td>
                        <td>{i.status ? <RiStatusChip label={i.status} /> : '—'}</td>
                        <td>{i.dueDate ?? '—'}</td>
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
