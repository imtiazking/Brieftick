import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShellLayout } from '@/components/shell-layout';
import { RiCatalogueStatusBanner } from '@/components/ri/ri-catalogue-status-banner';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { getGlobalCatalogueView } from '@/lib/ri/catalogue-display';

export default async function RegulatorCatalogueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const catalogue = await getGlobalCatalogueView();
  const regulator = catalogue.regulators.find((r) => r.id === id);
  if (!regulator) notFound();
  const sources = catalogue.sources.filter((s) => s.regulatorId === id);

  return (
    <ShellLayout title={regulator.name} subtitle={regulator.id}>
      <RiDataGate>
        <p>
          <Link href="/ri/landscape/catalogue">Global catalogue</Link> ·{' '}
          <Link href="/ri/landscape">Landscape</Link>
        </p>
        <RiCatalogueStatusBanner />
        <ul className="fg-status-list">
          <li><span>Jurisdiction</span><span>{regulator.jurisdictionGroup}</span></li>
          <li><span>Technical verification</span><span>{regulator.technicalVerification}</span></li>
          <li><span>Semantic coverage</span><span>{regulator.semanticCoverage}</span></li>
          <li><span>Production</span><span>{regulator.productionLabel}</span></li>
        </ul>
        <div className="fg-card fg-card--flush">
          <h2>Catalogue sources</h2>
          <table className="fg-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Technical</th>
                <th>Semantic</th>
                <th>Production</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="fg-mono">{s.id}</td>
                  <td>{s.technicalVerification}</td>
                  <td>{s.semanticCoverage}</td>
                  <td>{s.productionLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fg-muted">
          Tenant publications for this regulator appear in{' '}
          <Link href="/ri/horizon">Horizon</Link> when ingested — no demo publications are fabricated.
        </p>
      </RiDataGate>
    </ShellLayout>
  );
}
