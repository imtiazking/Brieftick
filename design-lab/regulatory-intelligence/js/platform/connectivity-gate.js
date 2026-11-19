/**
 * Blocks demo fixtures when auto-connect is active but backend session is not ready.
 */
import { esc, pageHeader } from '../components.js';
import {
  isConnectedBackendActive,
  isPresentationModeRequested,
  shouldAutoConnectToBackend,
} from './connected-mode.js';
import { renderOrganisationMembershipPicker } from './lab-org-selector.js';

export function labConnectivityMode(state) {
  return state?.connectivity?.mode || (isPresentationModeRequested() ? 'presentation' : 'connecting');
}

export function isOrganisationSelectionRequired(state) {
  const mode = labConnectivityMode(state);
  if (mode === 'org_selection_required') return true;
  const err = state.connectivity?.error;
  return Boolean(
    state.connectivity?.orgSelectionRequired &&
      (mode === 'connected_error' || mode === 'org_selection_required') &&
      (!err || err === 'organisation_selection_required'),
  );
}

/** When true, regulatory views must not render demo seed data. */
export function shouldBlockLabViewsForConnectivity(state) {
  if (isPresentationModeRequested()) return false;
  if (isConnectedBackendActive(state)) return false;
  if (!shouldAutoConnectToBackend()) return false;
  const mode = labConnectivityMode(state);
  return (
    mode === 'auth_required' ||
    mode === 'connecting' ||
    mode === 'connected_error' ||
    mode === 'org_selection_required' ||
    mode === 'org_access_denied'
  );
}

/** Admin platform remains reachable for org selection and retry while reconnecting. */
export function connectivityGateAllowsRoute(state, route) {
  if (!shouldBlockLabViewsForConnectivity(state)) return true;
  const mode = labConnectivityMode(state);
  const normalized = route.startsWith('/') ? route : `/${route}`;
  const adminAllowed =
    mode === 'connected_error' ||
    mode === 'org_selection_required' ||
    mode === 'org_access_denied';
  if (adminAllowed && (normalized === '/admin/platform' || normalized.startsWith('/admin/platform/'))) {
    return true;
  }
  return false;
}

function renderOrgSelectionGate(state) {
  const picker = renderOrganisationMembershipPicker(state);
  const clerkHint = state.connectivity?.clerkUserId
    ? `<p class="ri-muted">Signed in as Clerk user <span class="ri-mono">${esc(state.connectivity.clerkUserId)}</span></p>`
    : '';
  return `${pageHeader({
    eyebrow: 'FORGENIQ REGULATORY INTELLIGENCE',
    title: 'Select organisation',
    subtitle: 'Choose which FORGENIQ tenant to load. Operational data stays hidden until an active organisation is set.',
  })}
  <section class="ri-panel" role="region" aria-label="Organisation selection">
    <p>You belong to more than one FORGENIQ organisation. Select the tenant for this session, then connection will continue automatically.</p>
    ${clerkHint}
    ${picker}
    <div class="ri-not-found__actions">
      <button type="button" class="ri-btn ri-btn--ghost" data-ri-retry-bootstrap>Refresh membership list</button>
      <a class="ri-btn ri-btn--ghost" href="#/admin/platform">Advanced platform settings</a>
    </div>
  </section>`;
}

function renderOrgAccessDeniedGate(state, err) {
  return `${pageHeader({
    eyebrow: 'FORGENIQ REGULATORY INTELLIGENCE',
    title: 'Organisation access required',
    subtitle: 'This account cannot load tenant data until FORGENIQ provisions a Supabase membership.',
  })}
  <section class="ri-panel ri-alert ri-alert--readonly" role="alert">
    <p><strong>Status:</strong> ${esc(err || 'no_memberships')}</p>
    <p class="ri-muted">${esc(
      state.connectivity?.error ||
        'No Supabase organisation_memberships row for this Clerk user. Clerk organisation alone does not grant RI tenant access.',
    )}</p>
    <div class="ri-not-found__actions">
      <button type="button" class="ri-btn ri-btn--primary" data-ri-retry-bootstrap>Retry connection</button>
      <a class="ri-btn ri-btn--ghost" href="/sign-in">Sign in with a different account</a>
    </div>
  </section>`;
}

function renderBackendUnavailableGate(state, mode, err) {
  const detail = err ? ` — ${esc(String(err))}` : '';
  return `${pageHeader({
    eyebrow: 'CONNECTED STAGING',
    title: 'Backend unavailable',
    subtitle: 'Operational data cannot be loaded. Demo fixtures remain hidden.',
  })}
  <section class="ri-panel ri-alert ri-alert--readonly" role="alert">
    <p><strong>Status:</strong> ${esc(String(mode))}${detail}</p>
    <p class="ri-muted">This is not a demonstration dataset issue. Check sign-in, organisation selection, and staging API health.</p>
    <div class="ri-not-found__actions">
      <button type="button" class="ri-btn ri-btn--primary" data-ri-retry-bootstrap>Retry connection</button>
      <a class="ri-btn ri-btn--ghost" href="#/admin/platform">Admin → Platform</a>
      <a class="ri-btn ri-btn--ghost" href="/sign-in">Sign in</a>
    </div>
  </section>`;
}

export function renderConnectivityAccessGate(state) {
  const mode = labConnectivityMode(state);
  const err = state.connectivity?.error;

  if (mode === 'auth_required' || err === 'authentication_required' || err === 'unauthorized') {
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

  if (isOrganisationSelectionRequired(state) || mode === 'org_selection_required') {
    return renderOrgSelectionGate(state);
  }

  if (
    mode === 'org_access_denied' ||
    err === 'no_memberships' ||
    err === 'no_supabase_membership' ||
    err === 'organisation_not_member' ||
    err === 'organisation_access_denied'
  ) {
    return renderOrgAccessDeniedGate(state, err);
  }

  if (mode === 'connected' && state.connectivity?.catalogueWarning) {
    return `${pageHeader({
      eyebrow: 'CONNECTED STAGING',
      title: 'Partial connection',
      subtitle: 'Session is active but some catalogues failed to load.',
    })}
    <section class="ri-panel ri-alert">
      <p><strong>Catalogue warning:</strong> ${esc(String(state.connectivity.catalogueWarning))}</p>
      <button type="button" class="ri-btn ri-btn--primary" data-ri-retry-bootstrap>Retry connection</button>
    </section>`;
  }

  return renderBackendUnavailableGate(state, mode, err);
}

export function formatConnectedSessionChromeLabel(state) {
  const session = state.platformConfig?.backendSession;
  if (!session?.ok) return null;
  const org = session.organisationName || session.organisationId || 'Organisation';
  const role = session.role || 'Member';
  const user = session.userId ? session.userId.slice(0, 12) : 'User';
  return { text: `${org} · ${role}`, title: `Clerk user ${session.userId || user}` };
}