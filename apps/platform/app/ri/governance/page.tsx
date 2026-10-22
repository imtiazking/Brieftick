import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { tryRiContext } from '@/lib/ri/context';
import { listWorkflowEvents } from '@/lib/ri/services/governance';

export default async function GovernancePage() {
  const ctx = await tryRiContext();
  const events = ctx ? await listWorkflowEvents(ctx.supabase, ctx.organisationId, 40) : [];

  return (
    <ShellLayout title="Governance" subtitle="Workflow events and human decisions">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : (
          <>
            <div className="fg-card">
              <p>
                Production RI records governance through workflow events, role-separated impact
                approvals, and explicit human applicability decisions. Committee and attestation
                registers from the Design Lab remain a documented future difference until modelled in
                schema.
              </p>
              <ul className="fg-link-list">
                <li>Impact approvals: COMPLIANCE_MANAGER (maker/checker enforced on approve)</li>
                <li>Findings closure: COMPLIANCE_MANAGER</li>
                <li>
                  <Link href="/ri/reporting">Management reporting</Link> — aggregate posture
                </li>
              </ul>
            </div>
            <div className="fg-card fg-card--flush">
              <h2>Decision history</h2>
              {events.length === 0 ? (
                <p className="fg-muted">No governance decisions are awaiting approval.</p>
              ) : (
                <table className="fg-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Event</th>
                      <th>Entity</th>
                      <th>Transition</th>
                      <th>Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td>{new Date(e.created_at).toISOString().slice(0, 16).replace('T', ' ')}</td>
                        <td>{e.event_type}</td>
                        <td className="ri-mono">{e.entity_type} {e.entity_id}</td>
                        <td>
                          {e.from_status ?? '—'} → {e.to_status ?? '—'}
                        </td>
                        <td className="ri-mono">{e.actor_user_id ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
