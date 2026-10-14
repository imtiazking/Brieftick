import { getState } from './store.js';
import { esc, pageHeader, badge } from './components.js';
import { getPlatform, getApiAdapterContract, APPLICATION_ROLES } from './services/platform-service.js';

export function viewAdminPlatform() {
  const s = getState();
  const platform = getPlatform();
  const config = platform.getConfig();
  const tenant = platform.getTenantContext();
  let apiStatus = 'Not configured';
  try {
    getApiAdapterContract();
    apiStatus = 'Contract defined — inactive in Design Lab';
  } catch {
    apiStatus = 'Unavailable';
  }

  return `${pageHeader('Platform architecture', 'Design Lab — local adapter & production seams (no live infrastructure)')}
    <p><a href="#/admin">← Administration</a></p>
    <section class="ri-panel">
      <h3>Runtime</h3>
      <dl class="ri-dl">
        <dt>Environment</dt><dd>${esc(config.environment)}</dd>
        <dt>Adapter</dt><dd>${badge(platform.mode === 'local' ? 'Local' : 'API')} <span class="ri-muted">MOCK — not production</span></dd>
        <dt>Schema</dt><dd>v${esc(String(s.schemaVersion))}</dd>
        <dt>Tenant context</dt><dd>${esc(tenant.tenantId)}</dd>
        <dt>API adapter</dt><dd>${esc(apiStatus)}</dd>
        <dt>AI execution mode</dt><dd>${esc(config.aiExecutionMode || 'fixture')}</dd>
        <dt>Live AI verification</dt><dd>${config.allowLiveAiVerification ? 'Enabled (local)' : 'Disabled'}</dd>
        <dt>AI provider credential</dt><dd>Not configured</dd>
      </dl>
      <p><a href="#/ai-operations">AI Operations monitor</a> · <a href="#/admin/health">Platform health</a> · <a href="#/admin/readiness">Readiness dashboard</a></p>
    </section>
    <section class="ri-panel">
      <h3>Application roles (catalog)</h3>
      <ul>${APPLICATION_ROLES.map((r) => `<li><strong>${esc(r.name)}</strong> <span class="ri-mono">${esc(r.id)}</span></li>`).join('')}</ul>
      <p class="ri-muted">Governance roles (maker/checker, committee) remain separate from application permissions.</p>
    </section>
    <section class="ri-panel">
      <h3>Production connections</h3>
      <p class="ri-muted">Database, OIDC identity, object storage, queues, and live regulators are <strong>not configured</strong>. See <code>architecture/</code> documentation.</p>
    </section>`;
}
