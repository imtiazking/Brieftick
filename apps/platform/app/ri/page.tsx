import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { loadOrganisationShellContext } from '@/lib/auth/require-organisation';
import { getCatalogueSummary } from '@/lib/catalogue';
import { isSupabaseBrowserConfigured } from '@/lib/env';

export default async function RegulatoryIntelligenceHubPage() {
  const org = await loadOrganisationShellContext();
  const catalogue = await getCatalogueSummary();
  const dataReady = isSupabaseBrowserConfigured();

  return (
    <ShellLayout
      title="RI · Regulatory Intelligence"
      subtitle="Publication → obligation → policy → risk → control → action → evidence → assurance"
    >
      <RiDataGate>
        <div className="fg-card">
          <h2>Core workflow</h2>
          <p>
            Schema foundation: global publications plus tenant workflow tables (through assurance) with
            explicit join links. Organisation triage, applicability, changes, impact assessments,
            obligations, and downstream lifecycle records are tenant-scoped with server-side authorisation.
          </p>
          <ul className="fg-status-list">
            <li>
              <span>Active organisation</span>
              <span>{org.active?.organisationName ?? 'none'}</span>
            </li>
            <li>
              <span>Your role</span>
              <span>{org.active?.role ?? 'n/a'}</span>
            </li>
            <li>
              <span>Reference catalogue sources</span>
              <span>{catalogue.sourceCount}</span>
            </li>
            <li>
              <span>Production sources enabled</span>
              <span>{catalogue.productionEnabledSourceCount}</span>
            </li>
          </ul>
          {dataReady && (
            <ul className="fg-link-list">
              <li><Link href="/ri/publications">Browse publications</Link></li>
              <li><Link href="/ri/changes">Regulatory changes</Link></li>
              <li><Link href="/ri/impact-assessments">Impact assessments</Link></li>
              <li><Link href="/ri/obligations">Obligations</Link></li>
              <li><Link href="/ri/policies">Policies</Link></li>
              <li><Link href="/ri/controls">Controls</Link></li>
              <li><Link href="/ri/assurance">Assurance</Link></li>
            </ul>
          )}
          <div className="fg-banner" role="status">
            Live regulator ingestion is not enabled. Empty lists are expected until controlled
            publications exist (development fixtures are marked TEST / DEVELOPMENT DATA only).
          </div>
        </div>
      </RiDataGate>
    </ShellLayout>
  );
}
