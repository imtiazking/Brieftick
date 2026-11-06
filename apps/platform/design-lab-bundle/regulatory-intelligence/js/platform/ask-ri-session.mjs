/**
 * Ephemeral Ask RI results — sessionStorage only (not localStorage).
 * Scoped to active Supabase organisation when connected.
 */
import { isConnectedBackendActive } from './connected-mode.js';

export const ASK_RI_SESSION_STORAGE_KEY = 'forgeniq-ri-ask-ri-session';

function hasSessionStorage() {
  return typeof globalThis !== 'undefined' && typeof globalThis.sessionStorage !== 'undefined';
}

function activeOrganisationId(state) {
  return (
    state?.connectivity?.activeOrganisationId?.trim() ||
    state?.platformConfig?.backendSession?.organisationId?.trim() ||
    null
  );
}

export function clearAskRiSession() {
  try {
    if (hasSessionStorage()) sessionStorage.removeItem(ASK_RI_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function saveAskRiSession(state, { question, lastAsk }) {
  if (!isConnectedBackendActive(state) || !hasSessionStorage()) return;
  const organisationId = activeOrganisationId(state);
  if (!organisationId || !question || !lastAsk) return;
  try {
    sessionStorage.setItem(
      ASK_RI_SESSION_STORAGE_KEY,
      JSON.stringify({
        organisationId,
        question: String(question),
        lastAsk: { ...lastAsk, question: String(question), restoredFromSession: false },
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    /* ignore quota */
  }
}

/** Restore prior connected Ask RI for same org in this tab session only. */
export function restoreAskRiSession(state) {
  if (!isConnectedBackendActive(state) || !hasSessionStorage()) {
    return { restored: false };
  }
  const organisationId = activeOrganisationId(state);
  if (!organisationId) return { restored: false };

  try {
    const raw = sessionStorage.getItem(ASK_RI_SESSION_STORAGE_KEY);
    if (!raw) return { restored: false };
    const parsed = JSON.parse(raw);
    if (parsed.organisationId !== organisationId || !parsed.lastAsk) {
      clearAskRiSession();
      return { restored: false };
    }
    return {
      restored: true,
      question: parsed.question,
      lastAsk: { ...parsed.lastAsk, restoredFromSession: true },
      providerCallCount: parsed.lastAsk?.providerCallCount ?? 0,
    };
  } catch {
    clearAskRiSession();
    return { restored: false };
  }
}

/** Drop in-memory Ask RI UI state (never persisted to localStorage). */
export function clearAskRiTransientState(state) {
  if (!state) return;
  delete state._lastAskRi;
  delete state._askRiLastQuestion;
  delete state._askRiDraft;
  delete state._askRiPending;
  delete state._lastAskRiProviderCalls;
}

export function persistableLabState(state) {
  if (!state) return state;
  const {
    _lastAskRi,
    _askRiLastQuestion,
    _askRiDraft,
    _askRiPending,
    _lastAskRiProviderCalls,
    ...rest
  } = state;
  return rest;
}
