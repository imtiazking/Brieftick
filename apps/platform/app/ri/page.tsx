import { ShellLayout } from '@/components/shell-layout';
import { loadOrganisationShellContext } from '@/lib/auth/require-organisation';
import { clerkConfigStatus, isClerkConfigured, supabaseConfigStatus } from '@/lib/env';

export default async function RegulatoryIntelligencePlaceholderPage() {
  const org = await loadOrganisationShellContext();
  const clerk = clerkConfigStatus();
  const supabase = supabaseConfigStatus();

  return (
    <ShellLayout
      title="RI · Regulatory Intelligence"
      subtitle="Regulatory Intelligence production workspace."
    >
      <div className="fg-card">
        <h2>Production workspace</h2>
        <p>
          Design Lab behaviour and RI lifecycle features have <strong>not</strong> been migrated.
          This route shows tenant security foundation status only.
        </p>
        <ul className="fg-status-list">
          <li>
            <span>Active organisation</span>
            <span>{org.active?.organisationName ?? org.active?.organisationId ?? 'none'}</span>
          </li>
          <li>
            <span>Current role</span>
            <span>{org.active?.role ?? 'n/a'}</span>
          </li>
          <li>
            <span>Clerk (IdP)</span>
            <span>{clerk}</span>
          </li>
          <li>
            <span>Supabase client</span>
            <span>{supabase}</span>
          </li>
          <li>
            <span>RLS / tenant model</span>
            <span>{isClerkConfigured() && supabase !== 'not_configured' ? 'migration ready' : 'not live verified'}</span>
          </li>
        </ul>
        <div className="fg-banner" role="status">
          Future RI tables will include <code>organisation_id</code> and inherit platform RLS. Reference
          catalogue data remains global (regulators, sources).
        </div>
      </div>
    </ShellLayout>
  );
}
