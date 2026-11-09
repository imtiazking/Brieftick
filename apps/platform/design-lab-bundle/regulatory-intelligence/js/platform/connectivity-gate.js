/**
 * Blocks demo fixtures when auto-connect is active but backend session is not ready.
 */
import { esc, pageHeader } from '../components.js';
import {
  isConnectedBackendActive,
  isPresentationModeRequested,
  shouldAutoConnectToBackend,
} from './connected-mode.js';

export function labConnectivityMode(state) {
  return state?.connectivity?.mode || (isPresentationModeRequested() ? 'presentation' : 'connecting');
}

/** When true, regulatory views must not render demo seed data. */
export function shouldBlockLabViewsForConnectivity(state) {
  if (isPresentationModeRequested()) return false;
  if (isConnectedBackendActive(state)) return false;
  if (!shouldAutoConnectToBackend()) return false;
  const mode = labConnectivityMode(state);
  return mode === 'auth_required' || mode === 'connecting' || mode === 'connected_error';
}

/** Admin platform remains reachable for org selection and retry while reconnecting. */
export function connectivityGateAllowsRoute(state, route) {
  if (!shouldBlockLabViewsForConnectivity(state)) return true;
  const mode = labConnectivityMode(state);
  const normalized = route.startsWith('/') ? route : `/${route}`;
  if (mode === 'connected_error' && (normalized === '/admin/platform' || normalized.startsWith('/admin/platform/'))) {
    return true;
  }
  return false;
}

export function renderConnectivityAccessGate(state) {
  const mode = labConnectivityMode(state);
  const err = state.connectivity?.error;
  if (mode === 'auth_required') {
    const returnUrl = encodeURIComponent(`${location.pathname}${location.hash || '#/dashboard'}`);
    return `${pageHeader({
      eyebrow: 'FORGENIQ REGULATORY INTELLIGENCE',
      title: 'Sign in required',
      subtitle: 'This Design Lab loads live tenant data for authenticated FORGENIQ users. Presentation fixtures are not shown by default.',
    })}
    <section class="ri-panel ri-alert ri-alert--readonly" role="alert">
      <p>Sign in with your FORGENIQ account to connect to staging PostgreSQL via <code>/api/ri-lab</code>.</p>
      <p class="ri-muted">Demo scenarios and fictional personas are available only in explicit <strong>Presentation mode</strong> (Admin → Platform).</p>
      <div class="ri-not-found__actions">
        <a class="ri-btn ri-btn--primary" href="/sign-in?redirect_url=${returnUrl}">Sign in</a>
        <button type="button" class="ri-btn ri-btn--ghost" data-ri-retry-bootstrap>Retry connection</button>
        <a class="ri-btn ri-btn--ghost" href="#/admin/platform">Platform settings</a>
      </div>
    </section>`;
  }
  if (mode === 'connecting') {
    return `${pageHeader({
      eyebrow: 'CONNECTED STAGING',
      title: 'Connecting…',
      subtitle: 'Loading Clerk session, active organisation, and tenant catalogue.',
    })}
    <section class="ri-panel">
      <p class="ri-muted">Demonstration data stays hidden until connected services respond or an error is shown.</p>
      <p class="ri-muted">If this persists beyond 25 seconds, use <strong>Retry connection</strong> or run <code>__FORGENIQ_RI_CONNECTIVITY_DIAG__()</code> in the browser console and share the output.</p>
    </section>`;
  }
  return `${pageHeader({
    eyebrow: 'CONNECTED STAGING',
    title: 'Connected staging unavailable',
    subtitle: 'Operational data cannot be loaded. Demo fixtures remain hidden.',
  })}
  <section class="ri-panel ri-alert ri-alert--readonly" role="alert">
    <p><strong>Status:</strong> ${esc(String(mode))}${err ? ` — ${esc(String(err))}` : ''}</p>
    <div class="ri-not-found__actions">
      <button type="button" class="ri-btn ri-btn--primary" data-ri-retry-bootstrap>Retry connection</button>
      <a class="ri-btn ri-btn--ghost" href="#/admin/platform">Admin → Platform</a>
      <a class="ri-btn ri-btn--ghost" href="/sign-in">Sign in</a>
    </div>
  </section>`;
}

export function formatConnectedSessionChromeLabel(state) {
  const session = state.platformConfig?.backendSession;
  if (!session?.ok) return null;
  const org = session.organisationName || session.organisationId || 'Organisation';
  const role = session.role || 'Member';
  const user = session.userId ? session.userId.slice(0, 12) : 'User';
  return { text: `${org} · ${role}`, title: `Clerk user ${session.userId || user}` };
}
