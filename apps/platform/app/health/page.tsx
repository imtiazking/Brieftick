import { getCatalogueSummary } from '@/lib/catalogue';
import {
  clerkConfigStatus,
  getAppEnvironment,
  getBuildId,
  supabaseConfigStatus,
} from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  let catalogue: { regulatorCount: number; sourceCount: number } | null = null;
  try {
    catalogue = await getCatalogueSummary();
  } catch {
    catalogue = null;
  }

  return (
    <div className="fg-shell">
      <main className="fg-main" style={{ maxWidth: '640px' }}>
        <h1 style={{ marginTop: 0 }}>FORGENIQ Platform — health</h1>
        <p style={{ color: 'var(--fg-muted)' }}>Non-sensitive operational metadata only.</p>
        <div className="fg-card">
          <ul className="fg-status-list">
            <li>
              <span>Application</span>
              <span>FORGENIQ Platform</span>
            </li>
            <li>
              <span>Environment</span>
              <span>{getAppEnvironment()}</span>
            </li>
            <li>
              <span>Build / version</span>
              <span>{getBuildId()}</span>
            </li>
            <li>
              <span>Auth (Clerk)</span>
              <span>{clerkConfigStatus()}</span>
            </li>
            <li>
              <span>Supabase</span>
              <span>{supabaseConfigStatus()}</span>
            </li>
            {catalogue && (
              <li>
                <span>Reference catalogue (read-only)</span>
                <span>
                  {catalogue.regulatorCount} regulators · {catalogue.sourceCount} sources
                </span>
              </li>
            )}
          </ul>
        </div>
      </main>
    </div>
  );
}
