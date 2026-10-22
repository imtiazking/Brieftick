import { ShellLayout } from '@/components/shell-layout';
import { loadOrganisationShellContext } from '@/lib/auth/require-organisation';
import { getCatalogueSummary } from '@/lib/catalogue';
import { clerkConfigStatus, isClerkConfigured, supabaseConfigStatus } from '@/lib/env';
import { LIFECYCLE_ENTITY_LABELS } from '@/lib/ri/schema-contracts';

export default async function RegulatoryIntelligencePlaceholderPage() {
  const org = await loadOrganisationShellContext();
  const clerk = clerkConfigStatus();
  const supabase = supabaseConfigStatus();
  const catalogue = await getCatalogueSummary();

  return (
    <ShellLayout
      title="RI · Regulatory Intelligence"
      subtitle="Production schema foundation — workflows not migrated."
    >
      <div className="fg-card">
        <h2>Regulatory Intelligence</h2>
        <p>
          <strong>Production schema foundation</strong> is defined in Supabase migrations. Design Lab
          behaviour, Ask RI, AI analysis, and live ingestion are not enabled on this route.
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
            <span>Catalogue regulators (reference)</span>
            <span>{catalogue.regulatorCount}</span>
          </li>
          <li>
            <span>Catalogue sources (reference)</span>
            <span>{catalogue.sourceCount}</span>
          </li>
          <li>
            <span>Sources enabled for production</span>
            <span>0</span>
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
            <span>
              {isClerkConfigured() && supabase !== 'not_configured'
                ? 'migrations + membership RLS'
                : 'not live verified'}
            </span>
          </li>
        </ul>
        <h3>Lifecycle entities in schema</h3>
        <ul className="fg-status-list">
          {LIFECYCLE_ENTITY_LABELS.map((label) => (
            <li key={label}>
              <span>{label}</span>
              <span>available</span>
            </li>
          ))}
        </ul>
        <div className="fg-banner" role="status">
          Global regulators and sources are shared reference data. Tenant tables require{' '}
          <code>organisation_id</code> and membership-derived RLS. Relationship authority is explicit
          (join tables); evidence and findings do not infer ownership via graph traversal.
        </div>
      </div>
    </ShellLayout>
  );
}
