import { getState } from './store.js';
import { esc, pageHeader, badge } from './components.js';
import { getPlatform, platform, APPLICATION_ROLES } from './services/platform-service.js';
import { isConnectedBackendActive, isConnectedModeIntent, isPresentationModeRequested } from './platform/connected-mode.js';

export function viewAdminPlatform() {
  const s = getState();
  const platformRuntime = getPlatform();
  const config = platformRuntime.getConfig();
  const tenant = platformRuntime.getTenantContext();
  const connected = isConnectedBackendActive(s);
  const connectedIntent = isConnectedModeIntent(s);
  const apiStatus = connected
    ? 'Connected — read-only API (/api/ri-lab)'
    : connectedIntent
      ? 'Connected mode — backend session not active (reconnect below)'
      : platform.isApiConfigured
        ? 'Available — enable connected mode below'
        : 'Not configured';

  const presentation = isPresentationModeRequested();
  const connectivityPanel = connected
    ? `<p class="ri-muted">Catalogue publications (global): <strong>${esc(String(s.platformConfig?.cataloguePublicationCount ?? '—'))}</strong>
        · Staging project match: <strong>${s.platformConfig?.stagingProjectMatch ? 'yes' : 'no'}</strong></p>
       <button type="button" class="ri-btn ri-btn--ghost" data-ri-enter-presentation>Enter presentation mode (fictional scenarios)</button>`
    : connectedIntent
      ? `<button type="button" class="ri-btn ri-btn--primary" data-ri-reconnect-backend>Retry FORGENIQ connection</button>
         <p class="ri-muted">Live tenant data is the default. Presentation fixtures stay hidden until you explicitly enter presentation mode.</p>`
      : presentation
        ? `<button type="button" class="ri-btn ri-btn--primary" data-ri-exit-presentation>Exit presentation mode (load live data)</button>
           <p class="ri-muted">You are viewing fictional demonstration data only — not PostgreSQL tenant records.</p>`
        : `<p class="ri-muted">Authenticated users connect automatically on load. Use presentation mode only for sales demonstrations.</p>
           <button type="button" class="ri-btn ri-btn--ghost" data-ri-enter-presentation>Enter presentation mode</button>`;

  const connectivityError = s.connectivity?.error
    ? `<p class="ri-alert">${esc(s.connectivity.error)}</p>`
    : '';

  const orgMemberships = s.connectivity?.orgMemberships || [];
  const orgSelect =
    orgMemberships.length > 1
      ? `<div class="ri-form-group">
      <label for="ri-active-org-select">Active FORGENIQ organisation (Supabase tenant)</label>
      <select id="ri-active-org-select" data-ri-select-org>
        <option value="">— Select —</option>
        ${orgMemberships
          .map(
            (m) =>
              `<option value="${esc(m.organisationId)}"${m.organisationId === s.connectivity?.activeOrganisationId ? ' selected' : ''}>${esc(m.organisationName || m.organisationId)} · ${esc(m.role)}</option>`,
          )
          .join('')}
      </select>
      <button type="button" class="ri-btn ri-btn--ghost" data-ri-apply-org>Use selected organisation</button>
      <p class="ri-muted">Clerk organisation membership is separate from this Supabase tenant id.</p>
    </div>`
      : orgMemberships.length === 1
        ? `<p class="ri-muted">Supabase tenant: <strong>${esc(orgMemberships[0].organisationName || orgMemberships[0].organisationId)}</strong> · ${esc(orgMemberships[0].role)}</p>`
        : '';

  const activeOrgLine = s.connectivity?.activeOrganisationId
    ? `<p class="ri-muted">Active tenant cookie: <span class="ri-mono">${esc(s.connectivity.activeOrganisationId)}</span></p>`
    : '';

  return `${pageHeader('Platform architecture', 'Design Lab — local adapter & production seams')}
    <p><a href="#/admin">← Administration</a></p>
    <section class="ri-panel">
      <h3>Runtime</h3>
      <dl class="ri-dl">
        <dt>Environment</dt><dd>${esc(config.environment)}</dd>
        <dt>Adapter</dt><dd>${badge(platformRuntime.mode === 'local' ? 'Local' : 'API')} ${connected ? '' : '<span class="ri-muted">Demo mock data</span>'}</dd>
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
      <h3>FORGENIQ backend connectivity</h3>
      ${connectivityError}
      ${orgSelect}
      ${activeOrgLine}
      ${connectivityPanel}
      <p class="ri-muted">Clerk sign-in loads live tenant data automatically. Presentation mode is opt-in for fictional scenarios only.</p>
    </section>`;
}
