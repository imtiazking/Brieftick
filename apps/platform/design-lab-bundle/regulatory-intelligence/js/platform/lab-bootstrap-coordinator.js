/**
 * Single-flight lab bootstrap + hard cap on indefinite "connecting".
 */
import { getState } from '../store.js';
import { shouldAutoConnectToBackend } from './connected-mode.js';

export const CONNECTING_WATCHDOG_MS = 25_000;
export const PERSISTED_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

/** @type {Promise<unknown> | null} */
let bootstrapInflight = null;

/** @type {ReturnType<typeof setInterval> | null} */
let connectingWatchdog = null;

export function canRestorePersistedConnectedSession(state) {
  if (!shouldAutoConnectToBackend()) return false;
  const pc = state?.platformConfig;
  const conn = state?.connectivity;
  if (conn?.mode !== 'connected') return false;
  if (!pc?.backendSession?.ok) return false;
  if (pc.adapterMode !== 'api' || pc.featureFlags?.apiAdapter !== true) return false;
  const checked = conn.lastCheckedAt ? Date.parse(conn.lastCheckedAt) : NaN;
  if (!Number.isFinite(checked)) return false;
  return Date.now() - checked <= PERSISTED_SESSION_MAX_AGE_MS;
}

export function applyPersistedConnectedRestore(state) {
  state.platformConfig = {
    ...(state.platformConfig || {}),
    adapterMode: 'api',
    apiBaseUrl: state.platformConfig?.apiBaseUrl || '/api/ri-lab',
    featureFlags: {
      ...(state.platformConfig?.featureFlags || {}),
      apiAdapter: true,
    },
    backendReady: true,
  };
  state.connectivity = {
    ...(state.connectivity || {}),
    mode: 'connected',
    error: null,
    backgroundRefresh: true,
    lastCheckedAt: state.connectivity?.lastCheckedAt || new Date().toISOString(),
  };
}

/**
 * @param {() => Promise<unknown>} runner
 * @returns {Promise<unknown>}
 */
export function runBootstrapSingleton(runner) {
  if (bootstrapInflight) return bootstrapInflight;
  bootstrapInflight = runner().finally(() => {
    bootstrapInflight = null;
  });
  return bootstrapInflight;
}

export function isBootstrapInflight() {
  return Boolean(bootstrapInflight);
}

/**
 * @param {(state: ReturnType<typeof getState>) => void} onStuck
 */
export function startConnectingWatchdog(onStuck) {
  if (connectingWatchdog) clearInterval(connectingWatchdog);
  connectingWatchdog = setInterval(() => {
    const state = getState();
    if (state.connectivity?.mode !== 'connecting') return;
    const started = state.connectivity?.connectingSince || state.connectivity?.lastCheckedAt;
    const since = started ? Date.parse(started) : Date.now();
    if (Date.now() - since > CONNECTING_WATCHDOG_MS) {
      onStuck(state);
    }
  }, 2000);
}

export function connectivityDiagSnapshot(state = getState()) {
  return {
    at: new Date().toISOString(),
    bootstrapInflight: isBootstrapInflight(),
    connectivity: state.connectivity
      ? {
          mode: state.connectivity.mode,
          error: state.connectivity.error,
          lastCheckedAt: state.connectivity.lastCheckedAt,
          connectingSince: state.connectivity.connectingSince,
          backgroundRefresh: state.connectivity.backgroundRefresh,
          catalogueWarning: state.connectivity.catalogueWarning,
        }
      : null,
    backendReady: state.platformConfig?.backendReady === true,
    backendSessionOk: state.platformConfig?.backendSession?.ok === true,
    catalogue: state.connectedCatalogue
      ? {
          status: state.connectedCatalogue.status,
          error: state.connectedCatalogue.error,
          loadedAt: state.connectedCatalogue.loadedAt,
        }
      : null,
    hash: typeof location !== 'undefined' ? location.hash : null,
  };
}
