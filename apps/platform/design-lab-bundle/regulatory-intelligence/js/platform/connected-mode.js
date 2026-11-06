/**
 * Demo vs connected backend mode (Step 81B).
 */
import { getState } from '../store.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';

export const CONNECTED_MODE_STORAGE_KEY = 'forgeniq-ri-connected-mode';
export const PRESENTATION_MODE_STORAGE_KEY = 'forgeniq-ri-presentation-mode';

export const PRESENTATION_ENVIRONMENT_FOOTER =
  'PRESENTATION MODE — fictional demonstration data only. Not tenant operational data. Exit via Admin → Platform to return to live FORGENIQ APIs.';

export const AUTH_REQUIRED_FOOTER =
  'SIGN IN REQUIRED — live FORGENIQ tenant data is not shown. Sign in to load connected Regulatory Intelligence from PostgreSQL.';

/** @deprecated label — use PRESENTATION_ENVIRONMENT_FOOTER in presentation mode */
export const DEMO_ENVIRONMENT_FOOTER = PRESENTATION_ENVIRONMENT_FOOTER;

export const CONNECTED_STAGING_FOOTER =
  'CONNECTED STAGING — Live tenant-scoped data from FORGENIQ RI APIs (Supabase staging). Demo fixtures hidden.';

/** Global page footer (index.html) — demo vs connected staging. */
export function syncEnvironmentFooterBanner(state = getState()) {
  const el = document.getElementById('ri-environment-banner');
  if (!el) return;
  if (isConnectedBackendActive(state)) {
    el.textContent = CONNECTED_STAGING_FOOTER;
    el.classList.remove('ri-environment-banner--demo', 'ri-environment-banner--error');
    el.classList.add('ri-environment-banner--staging');
    return;
  }
  if (state?.connectivity?.mode === 'auth_required') {
    el.textContent = AUTH_REQUIRED_FOOTER;
    el.classList.remove('ri-environment-banner--staging', 'ri-environment-banner--error');
    el.classList.add('ri-environment-banner--demo');
    return;
  }
  if (state?.connectivity?.mode === 'connected_error') {
    const err = state.connectivity?.error ? ` (${state.connectivity.error})` : '';
    el.textContent = `CONNECTED STAGING ERROR${err} — demo data hidden. Use Admin → Platform to retry or select your organisation. Mock data must not be used as operational evidence.`;
    el.classList.remove('ri-environment-banner--demo');
    el.classList.add('ri-environment-banner--staging', 'ri-environment-banner--error');
    return;
  }
  if (state?.connectivity?.mode === 'connecting') {
    el.textContent =
      'CONNECTING — loading tenant-scoped staging APIs. Demonstration data is hidden until connected or an error is shown.';
    el.classList.remove('ri-environment-banner--demo', 'ri-environment-banner--error');
    el.classList.add('ri-environment-banner--staging');
    return;
  }
  if (isPresentationModeRequested() || state?.connectivity?.mode === 'presentation') {
    el.textContent = PRESENTATION_ENVIRONMENT_FOOTER;
    el.classList.remove('ri-environment-banner--staging', 'ri-environment-banner--error');
    el.classList.add('ri-environment-banner--demo');
    return;
  }
  el.textContent = AUTH_REQUIRED_FOOTER;
  el.classList.remove('ri-environment-banner--staging', 'ri-environment-banner--error');
  el.classList.add('ri-environment-banner--demo');
}

export function isPresentationModeRequested() {
  try {
    return localStorage.getItem(PRESENTATION_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPresentationModePreference(enabled) {
  try {
    if (enabled) localStorage.setItem(PRESENTATION_MODE_STORAGE_KEY, '1');
    else localStorage.removeItem(PRESENTATION_MODE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Live tenant APIs are the default unless the user explicitly chose presentation mode. */
export function shouldAutoConnectToBackend() {
  return !isPresentationModeRequested();
}

export function isConnectedModeRequested() {
  if (isPresentationModeRequested()) return false;
  return shouldAutoConnectToBackend();
}

export function isConnectedBackendActive(state = getState()) {
  const cfg = state?.platformConfig || {};
  return cfg.adapterMode === 'api' && cfg.featureFlags?.apiAdapter === true && cfg.backendReady === true;
}

/** User expects live backend (auto-connect) or an in-flight/error connected session. */
export function isConnectedModeIntent(state = getState()) {
  if (isPresentationModeRequested()) return false;
  const mode = state?.connectivity?.mode;
  return (
    shouldAutoConnectToBackend() ||
    mode === 'connected' ||
    mode === 'connecting' ||
    mode === 'connected_error' ||
    mode === 'auth_required'
  );
}

export function isConnectedBackendReconnecting(state = getState()) {
  return isConnectedModeIntent(state) && !isConnectedBackendActive(state);
}

/** Hide demo fixtures unless explicit presentation mode, or while live backend is loading/unavailable. */
export function shouldHideDemoRegulatoryData(state = getState()) {
  if (isConnectedBackendActive(state)) return true;
  if (isPresentationModeRequested() || state?.connectivity?.mode === 'presentation') return false;
  const mode = state?.connectivity?.mode;
  if (mode === 'connecting' || mode === 'connected_error' || mode === 'auth_required') return true;
  if (shouldAutoConnectToBackend()) return true;
  return false;
}

/** Demo seed publications/changes (original Design Lab) stay visible unless connected data replaces them. */
export function shouldShowDemoRegulatoryData(state = getState()) {
  return !shouldHideDemoRegulatoryData(state);
}

export function blockConnectedModeMutation() {
  if (!isConnectedBackendActive()) return null;
  if (isConnectedLabWritesEnabled()) return null;
  return {
    ok: false,
    code: 'CONNECTED_READ_ONLY',
    message:
      'Connected mode is read-only in this release. Use presentation mode for simulated writes, or wait for the next integration step.',
  };
}

export function isConnectedLabWritesEnabled(state = getState()) {
  return Boolean(isConnectedBackendActive(state) && state.platformConfig?.writesEnabled === true);
}

export function isConnectedChangeWritesEnabled(state = getState()) {
  const caps = state.platformConfig?.backendSession?.writeCapabilities;
  if (caps && typeof caps.changeManagement === 'boolean') {
    return Boolean(isConnectedBackendActive(state) && caps.changeManagement);
  }
  return isConnectedLabWritesEnabled(state);
}

export function isConnectedImpactWritesEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.impactAssessments === true,
  );
}

export function isConnectedRiskWritesEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.risks === true,
  );
}

export function isConnectedControlWritesEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.controls === true,
  );
}

export function isConnectedEvidenceWritesEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.evidence === true,
  );
}

export function isConnectedFindingWritesEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.findings === true,
  );
}

export function isConnectedAssuranceWritesEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.assurance === true,
  );
}

export function isConnectedApplicabilityWritesEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.applicabilityWorkflow === true,
  );
}

export function isConnectedImpactApproveEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.impactAssessments === true,
  );
}

export function isConnectedObligationWritesEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.obligations === true,
  );
}

export function isConnectedPolicyWritesEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.policies === true,
  );
}

export function isConnectedAiReviewEnabled(state = getState()) {
  return Boolean(
    isConnectedBackendActive(state) &&
      state.platformConfig?.backendSession?.writeCapabilities?.aiReview === true,
  );
}

export function setConnectedModePreference(enabled) {
  try {
    if (enabled) localStorage.setItem(CONNECTED_MODE_STORAGE_KEY, '1');
    else localStorage.removeItem(CONNECTED_MODE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function applyConnectedPlatformConfig(state, sessionPayload, readinessPayload) {
  state.platformConfig = {
    ...state.platformConfig,
    adapterMode: 'api',
    apiBaseUrl: state.platformConfig?.apiBaseUrl || '/api/ri-lab',
    environment: readinessPayload?.environment || 'connected',
    featureFlags: {
      ...(state.platformConfig?.featureFlags || {}),
      apiAdapter: true,
    },
    backendReady: readinessPayload?.ok === true,
    backendSession: sessionPayload,
    cataloguePublicationCount: readinessPayload?.cataloguePublicationCount,
    stagingProjectMatch: readinessPayload?.stagingProjectMatch,
    operationalReadiness: readinessPayload?.operationalReadiness ?? null,
    writesEnabled:
      sessionPayload?.writesEnabled === true && readinessPayload?.writesEnabled === true,
  };
  state.connectivity = {
    mode: 'connected',
    lastCheckedAt: new Date().toISOString(),
    error: null,
  };
  savePersistedJson(STORAGE_KEY_V2, state);
}

export function markConnectedBackendUnavailable(state, errorMessage = null) {
  setConnectedModePreference(true);
  if (state.connectedCatalogue?.status === 'loading') {
    state.connectedCatalogue.status = 'error';
    state.connectedCatalogue.error = errorMessage || 'connected_backend_unavailable';
  }
  if (state.connectedLandscape?.status === 'loading') {
    state.connectedLandscape.status = 'error';
    state.connectedLandscape.error = errorMessage || 'connected_backend_unavailable';
  }
  state.platformConfig = {
    ...state.platformConfig,
    adapterMode: 'api',
    apiBaseUrl: state.platformConfig?.apiBaseUrl || '/api/ri-lab',
    environment: state.platformConfig?.environment || 'connected',
    featureFlags: {
      ...(state.platformConfig?.featureFlags || {}),
      apiAdapter: true,
    },
    backendReady: false,
    backendSession: null,
    writesEnabled: false,
  };
  const prior = state.connectivity || {};
  state.connectivity = {
    ...prior,
    mode: 'connected_error',
    lastCheckedAt: new Date().toISOString(),
    error: errorMessage,
  };
  savePersistedJson(STORAGE_KEY_V2, state);
}

export function enterPresentationMode(state) {
  setPresentationModePreference(true);
  setConnectedModePreference(false);
  if (state.connectedCatalogue) {
    state.connectedCatalogue = {
      status: 'idle',
      error: null,
      publications: [],
      changes: [],
      detailsById: {},
      loadedAt: null,
    };
  }
  state.platformConfig = {
    ...state.platformConfig,
    adapterMode: 'local',
    featureFlags: {
      ...(state.platformConfig?.featureFlags || {}),
      apiAdapter: false,
    },
    backendReady: false,
    backendSession: null,
    writesEnabled: false,
  };
  state.connectivity = {
    mode: 'presentation',
    lastCheckedAt: new Date().toISOString(),
    error: null,
    orgMemberships: state.connectivity?.orgMemberships,
    orgSelectionRequired: state.connectivity?.orgSelectionRequired,
    activeOrganisationId: state.connectivity?.activeOrganisationId,
    clerkUserId: state.connectivity?.clerkUserId,
  };
  savePersistedJson(STORAGE_KEY_V2, state);
}

export function exitPresentationMode() {
  setPresentationModePreference(false);
  setConnectedModePreference(false);
  try {
    location.reload();
  } catch {
    /* ignore */
  }
}

export function revertToDemoPlatformConfig(state, errorMessage = null) {
  enterPresentationMode(state);
  if (errorMessage) {
    state.connectivity = { ...state.connectivity, error: errorMessage };
    savePersistedJson(STORAGE_KEY_V2, state);
  }
}
