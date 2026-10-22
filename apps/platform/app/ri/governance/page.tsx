import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { tryRiContext } from '@/lib/ri/context';

export default async function GovernancePage() {
  const ctx = await tryRiContext();

  return (
    <ShellLayout title="Governance" subtitle="Workflow events and human decisions (production foundation)">
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : (
          <div className="fg-card">
            <p>
              Production RI records governance through workflow events, role-separated approvals on impact
              assessments, and explicit human applicability decisions. Advanced committee registers from the
              Design Lab are classified <strong>FUTURE</strong> until modelled in schema.
            </p>
            <ul className="fg-link-list">
              <li>Impact approvals: COMPLIANCE_MANAGER role (see impact assessment detail)</li>
              <li>Findings closure: COMPLIANCE_MANAGER</li>
              <li>Ingestion operations: COMPLIANCE_MANAGER+ admin routes</li>
            </ul>
            <p className="fg-muted">Committee / attestation packs — FUTURE parity item.</p>
          </div>
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
