import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { RiCatalogueStatusBanner } from '@/components/ri/ri-catalogue-status-banner';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { getGlobalCatalogueView, type RiJurisdictionGroup } from '@/lib/ri/catalogue-display';

const GROUPS: RiJurisdictionGroup[] = [
  'United Kingdom',
  'Saudi Arabia',
  'United Arab Emirates',
  'United States',
  'International',
  'Other',
];

export default async function GlobalCataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ jurisdiction?: string }>;
}) {
  const sp = await searchParams;
  const catalogue = await getGlobalCatalogueView();
  const filter = sp.jurisdiction as RiJurisdictionGroup | undefined;
  const regulators = filter
    ? catalogue.regulators.filter((r) => r.jurisdictionGroup === filter)
    : catalogue.regulators;
  const sources = filter
    ? catalogue.sources.filter((s) => s.jurisdictionGroup === filter)
    : catalogue.sources;

  return (
    <ShellLayout
      title="Global regulator catalogue"
      subtitle={`${catalogue.regulatorCount} regulators · ${catalogue.sourceCount} sources`}
    >
      <RiDataGate>
        <p>
          <Link href="/ri/landscape">Regulatory landscape</Link>
        </p>
        <RiCatalogueStatusBanner />
        <form className="fg-form fg-form--inline fg-card" method="get">
          <label>
            Jurisdiction
            <select name="jurisdiction" defaultValue={filter ?? ''}>
              <option value="">All</option>
              {GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="fg-btn">Filter</button>
        </form>
        <div className="fg-card fg-card--flush">
          <h2>Regulators</h2>
          <table className="fg-table">
            <thead>
              <tr>
                <th>Jurisdiction</th>
                <th>Regulator</th>
                <th>Technical verification</th>
                <th>Semantic coverage</th>
                <th>Production</th>
                <th>Sources</th>
              </tr>
            </thead>
            <tbody>
              {regulators.map((r) => (
                <tr key={r.id}>
                  <td>{r.jurisdictionGroup}</td>
                  <td>
                    <Link href={`/ri/landscape/regulator/${r.id}`}>{r.name}</Link>
                    <span className="fg-muted"> ({r.id})</span>
                  </td>
                  <td>{r.technicalVerification}</td>
                  <td>{r.semanticCoverage}</td>
                  <td>{r.productionLabel}</td>
                  <td>{r.sourceIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fg-card fg-card--flush">
          <h2>Sources</h2>
          <table className="fg-table">
            <thead>
              <tr>
                <th>Jurisdiction</th>
                <th>Source ID</th>
                <th>Name</th>
                <th>Technical verification</th>
                <th>Semantic coverage</th>
                <th>Production</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.jurisdictionGroup}</td>
                  <td className="fg-mono">{s.id}</td>
                  <td>{s.name}</td>
                  <td>{s.technicalVerification}</td>
                  <td>{s.semanticCoverage}</td>
                  <td>{s.productionLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </RiDataGate>
    </ShellLayout>
  );
}
