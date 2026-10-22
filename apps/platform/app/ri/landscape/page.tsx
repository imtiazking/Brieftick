import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiCatalogueStatusBanner } from '@/components/ri/ri-catalogue-status-banner';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { getGlobalCatalogueView } from '@/lib/ri/catalogue-display';

export default async function RegulatoryLandscapePage() {
  const catalogue = await getGlobalCatalogueView();

  return (
    <ShellLayout
      title="Regulatory landscape"
      subtitle="Global regulator and source catalogue (shared reference data)"
    >
      <RiDataGate>
        <RiCatalogueStatusBanner />
        <div className="fg-card">
          <h2>Global coverage</h2>
          <p className="fg-muted">
            {catalogue.regulatorCount} regulators · {catalogue.sourceCount} catalogue sources · production
            ingestion enabled: {catalogue.productionEnabledCount}
          </p>
          <p>
            <Link href="/ri/landscape/catalogue" className="fg-btn">
              Open global regulator catalogue
            </Link>
          </p>
        </div>
        <div className="fg-card fg-card--flush">
          <table className="fg-table">
            <thead>
              <tr>
                <th>Jurisdiction group</th>
                <th>Regulators</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  'United Kingdom',
                  'Saudi Arabia',
                  'United Arab Emirates',
                  'United States',
                  'International',
                  'Other',
                ] as const
              ).map((group) => (
                <tr key={group}>
                  <td>{group}</td>
                  <td>{catalogue.jurisdictionCounts[group]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fg-muted">
          Sector framework matrices from the Design Lab are reference-only in this phase; tenant lifecycle data
          remains under Publications, Changes, and Obligations.
        </p>
      </RiDataGate>
    </ShellLayout>
  );
}
