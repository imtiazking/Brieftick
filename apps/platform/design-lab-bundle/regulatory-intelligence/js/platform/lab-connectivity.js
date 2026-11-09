/**
 * Bootstrap connected mode against /api/ri-lab (Clerk session cookie).
 */
import { createApiPlatformAdapter } from '../adapters/api-platform-adapter.js';
import { applyAskRiSessionRestore, notify } from '../store.js';
import {
  applyConnectedPlatformConfig,
  enterPresentationMode,
  isPresentationModeRequested,
  markConnectedBackendUnavailable,
  setConnectedModePreference,
  shouldAutoConnectToBackend,
} from './connected-mode.js';
import { clearAskRiSession } from './ask-ri-session.mjs';
import {
  ensureSupabaseOrganisationActive,
  formatOrganisationError,
  refreshLabOrganisationContext,
} from './lab-org-context.js';
import { loadConnectedCatalogue } from './connected-catalogue.js';
import { clearConnectedLandscape, loadConnectedLandscape } from './connected-landscape.js';

export async function probeBackendAvailability(apiBaseUrl) {
  const adapter = createApiPlatformAdapter({ apiBaseUrl });
  return adapter.probe();
}

export async function activateConnectedBackend(state) {
  const apiBaseUrl = state.platformConfig?.apiBaseUrl || '/api/ri-lab';
  const adapter = createApiPlatformAdapter({ apiBaseUrl });
  try {
    await refreshLabOrganisationContext(state);
    await ensureSupabaseOrganisationActive();
    const { session, readiness } = await adapter.bootstrap();
    if (!session?.ok || !readiness?.ok) {
      throw new Error(readiness?.error || session?.error || 'backend_not_ready');
    }
    setConnectedModePreference(true);
    applyConnectedPlatformConfig(state, session, readiness);
    const catalogue = await loadConnectedCatalogue(state);
    if (!catalogue.ok) {
      const detail =
        catalogue.error ||
        (catalogue.reason === 'not_connected' ? 'backend_not_ready' : catalogue.reason) ||
        'catalogue_load_failed';
      throw new Error(detail);
    }
    notify();
    return { ok: true, session, readiness };
  } catch (e) {
    if (e?.memberships?.length) {
      state.connectivity = {
        ...(state.connectivity || {}),
        orgMemberships: e.memberships,
        orgSelectionRequired: true,
      };
    }
    markConnectedBackendUnavailable(state, formatOrganisationError(e));
    notify();
    return { ok: false, error: e };
  }
}

export { refreshLabOrganisationContext } from './lab-org-context.js';
export { setActiveOrganisation } from './lab-org-context.js';

const CONNECT_BOOTSTRAP_TIMEOUT_MS = 20_000;

function withTimeout(promise, ms, label = 'timeout') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

async function probeClerkLabSession(apiBaseUrl) {
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/session`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok && body?.ok === true, body };
}

export async function bootstrapLabConnectivity(state) {
  if (isPresentationModeRequested()) {
    state.connectivity = {
      mode: 'presentation',
      lastCheckedAt: new Date().toISOString(),
      error: null,
    };
    notify();
    return { mode: 'presentation' };
  }

  if (!shouldAutoConnectToBackend()) {
    state.connectivity = { mode: 'demo', lastCheckedAt: new Date().toISOString(), error: null };
    return { mode: 'demo' };
  }

  const apiBaseUrl = state.platformConfig?.apiBaseUrl || '/api/ri-lab';
  if (state.platformConfig) {
    state.platformConfig.backendReady = false;
  }
  state.connectivity = {
    ...(state.connectivity || {}),
    mode: 'connecting',
    lastCheckedAt: new Date().toISOString(),
    error: null,
  };
  notify();

  let probe;
  try {
    probe = await withTimeout(
      probeClerkLabSession(apiBaseUrl),
      CONNECT_BOOTSTRAP_TIMEOUT_MS,
      'session_probe_timeout',
    );
  } catch (e) {
    markConnectedBackendUnavailable(state, e?.message || 'session_probe_timeout');
    notify();
    return { mode: 'connected_error', error: e };
  }
  if (probe.status === 401 || probe.body?.error === 'unauthorized') {
    state.connectivity = {
      mode: 'auth_required',
      lastCheckedAt: new Date().toISOString(),
      error: 'authentication_required',
    };
    notify();
    return { mode: 'auth_required' };
  }
  if (!probe.ok) {
    markConnectedBackendUnavailable(state, probe.body?.error || `session_probe_${probe.status}`);
    notify();
    return { mode: 'connected_error', error: probe.body?.error };
  }

  let result;
  try {
    result = await withTimeout(
      activateConnectedBackend(state),
      CONNECT_BOOTSTRAP_TIMEOUT_MS,
      'connect_timeout',
    );
  } catch (e) {
    markConnectedBackendUnavailable(state, e?.message || 'connect_timeout');
    notify();
    return { mode: 'connected_error', error: e };
  }
  if (!result.ok) {
    return { mode: 'connected_error', error: result.error };
  }
  applyAskRiSessionRestore();
  notify();
  const cat = state.connectedCatalogue;
  const catFresh =
    cat?.status === 'ready' &&
    cat.loadedAt &&
    Date.now() - new Date(cat.loadedAt).getTime() < 120_000;
  const landscape = state.connectedLandscape;
  const landscapeFresh =
    landscape?.status === 'ready' &&
    landscape.loadedAt &&
    Date.now() - new Date(landscape.loadedAt).getTime() < 120_000;
  const followUpLoads = [];
  if (!catFresh) followUpLoads.push(loadConnectedCatalogue(state));
  if (!landscapeFresh) followUpLoads.push(loadConnectedLandscape(state));
  if (!followUpLoads.length) {
    notify();
    return { mode: 'connected' };
  }
  try {
    await withTimeout(Promise.all(followUpLoads), CONNECT_BOOTSTRAP_TIMEOUT_MS, 'bootstrap_catalogue_timeout');
  } catch (e) {
    const cat = state.connectedCatalogue || {};
    if (cat.status === 'loading') cat.status = 'error';
    cat.error = e?.message || 'bootstrap_catalogue_timeout';
    state.connectedCatalogue = cat;
    state.connectivity = {
      ...(state.connectivity || {}),
      mode: 'connected',
      catalogueWarning: cat.error,
      lastCheckedAt: new Date().toISOString(),
    };
    notify();
    return { mode: 'connected', catalogueWarning: cat.error };
  }
  notify();
  return { mode: 'connected' };
}

export async function disconnectConnectedBackend(state) {
  clearAskRiSession();
  clearConnectedLandscape(state);
  enterPresentationMode(state);
  notify();
  return { ok: true, mode: 'presentation' };
}
