/**
 * Step 81E — global regulator/source catalogue + sector stats for connected landscape.
 */
import { isConnectedBackendActive } from './connected-mode.js';
import { notify } from '../store.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';
import { persistableLabState } from './ask-ri-session.mjs';

const EMPTY = {
  status: 'idle',
  error: null,
  regulatorCount: 0,
  sourceCount: 0,
  publicationCount: 0,
  changeCount: 0,
  regulators: [],
  sources: [],
  sectorStats: [],
  mappingNote: '',
  loadedAt: null,
};

export function initConnectedLandscapeState(state) {
  if (!state.connectedLandscape) {
    state.connectedLandscape = { ...EMPTY };
  }
  return state.connectedLandscape;
}

export function getConnectedLandscape(state) {
  return state.connectedLandscape || EMPTY;
}

export function isConnectedLandscapeReady(state) {
  return isConnectedBackendActive(state) && state.connectedLandscape?.status === 'ready';
}

export function isConnectedLandscapeLoading(state) {
  return isConnectedBackendActive(state) && state.connectedLandscape?.status === 'loading';
}

export function clearConnectedLandscape(state) {
  state.connectedLandscape = { ...EMPTY };
}

function apiBase(state) {
  return state.platformConfig?.apiBaseUrl || '/api/ri-lab';
}

export async function loadConnectedLandscape(state) {
  if (!isConnectedBackendActive(state)) {
    return { ok: false, reason: 'not_connected' };
  }
  const land = initConnectedLandscapeState(state);
  if (land._loadInflight) {
    return land._loadInflight;
  }
  if (land.status === 'loading') {
    land.status = 'idle';
  }

  land._loadInflight = loadConnectedLandscapeInner(state, land).finally(() => {
    delete land._loadInflight;
  });
  return land._loadInflight;
}

async function loadConnectedLandscapeInner(state, land) {
  land.status = 'loading';
  land.error = null;
  notify();

  const base = apiBase(state).replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/landscape`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      const err = new Error(body.error || body.message || `landscape_http_${res.status}`);
      err.status = res.status;
      throw err;
    }
    land.regulatorCount = body.regulatorCount ?? 0;
    land.sourceCount = body.sourceCount ?? 0;
    land.publicationCount = body.publicationCount ?? 0;
    land.changeCount = body.changeCount ?? 0;
    land.regulators = Array.isArray(body.regulators) ? body.regulators : [];
    land.sources = Array.isArray(body.sources) ? body.sources : [];
    land.sectorStats = Array.isArray(body.sectorStats) ? body.sectorStats : [];
    land.mappingNote = body.mappingNote || '';
    land.status = 'ready';
    land.loadedAt = new Date().toISOString();
    land.error = null;
    savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
    notify();
    return { ok: true };
  } catch (e) {
    land.status = 'error';
    land.error = e instanceof Error ? e.message : String(e);
    savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
    notify();
    return { ok: false, error: land.error };
  }
}

export async function ensureConnectedLandscapeLoaded(state) {
  if (!isConnectedBackendActive(state)) return { ok: true, skipped: true };
  const land = getConnectedLandscape(state);
  if (land.status === 'ready') return { ok: true, cached: true };
  if (land.status === 'error') return { ok: false, error: land.error };
  return loadConnectedLandscape(state);
}

export function connectedLandscapeBanner(state) {
  const land = getConnectedLandscape(state);
  if (!isConnectedBackendActive(state)) return '';
  if (land.status === 'loading') {
    return '<p class="ri-connected-banner ri-connected-banner--loading">Loading global regulator catalogue…</p>';
  }
  if (land.status === 'error') {
    return `<p class="ri-connected-banner ri-connected-banner--error">Regulatory landscape catalogue unavailable: ${land.error}. Demo sector counts are not shown.</p>`;
  }
  if (land.status === 'ready') {
    return `<p class="ri-connected-banner">Connected landscape · ${land.regulatorCount} regulators · ${land.sourceCount} sources · ${land.publicationCount} catalogue publication${land.publicationCount === 1 ? '' : 's'} mapped by regulator taxonomy</p>`;
  }
  return '';
}

export function sectorStatsForConnected(state, sectorId) {
  const land = getConnectedLandscape(state);
  return (land.sectorStats || []).find((s) => s.sectorId === sectorId) || null;
}

export function connectedRegulatorOverlay(state, designLabRegulatorId) {
  const land = getConnectedLandscape(state);
  return (land.regulators || []).find((r) => r.designLabRegulatorId === designLabRegulatorId) || null;
}

export function connectedSourcesForRegulator(state, designLabRegulatorId) {
  const land = getConnectedLandscape(state);
  return (land.sources || []).filter((s) => s.designLabRegulatorId === designLabRegulatorId);
}
