import { AppShell } from '@/components/app-shell';

export default function RegulatoryIntelligencePlaceholderPage() {
  return (
    <AppShell
      title="RI · Regulatory Intelligence"
      subtitle="Regulatory Intelligence production workspace."
    >
      <div className="fg-card">
        <h2>Production workspace</h2>
        <p>
          This route reserves the Regulatory Intelligence product on the FORGENIQ platform. Design Lab
          behaviour and business features have <strong>not</strong> been migrated yet.
        </p>
        <div className="fg-banner" role="status">
          Migration status: not started. Catalogue and integration lab data remain in{' '}
          <code>packages/reference-data</code> and <code>integrations/regulatory-sources</code> —
          no production ingestion is enabled from this app.
        </div>
      </div>
    </AppShell>
  );
}
