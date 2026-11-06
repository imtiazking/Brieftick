/**
 * Step 83A — connected-mode route guards (prevent demo fixture leakage).
 */
import { getState } from '../store.js';
import { isConnectedBackendActive } from './connected-mode.js';
import { isConnectedCatalogueReady } from './connected-catalogue.js';
import { connectedCatalogueBanner } from './connected-catalogue.js';
import { pageHeader, esc } from '../components.js';

export const CONNECTED_UNAVAILABLE_COPY =
  'This function is not yet available in Connected mode.';

export function connectedCatalogueLoadingMessage() {
  return 'Connected catalogue is loading. Demonstration records are hidden until authoritative data is ready.';
}

export function connectedCatalogueErrorMessage(error) {
  const msg = error || 'unknown';
  return `Connected catalogue failed to load (${esc(msg)}). Demonstration data is not shown as a fallback.`;
}

export function renderConnectedUnavailableView(title, subtitle, bodyHtml, linksHtml = '') {
  const s = getState();
  const banner = isConnectedBackendActive(s) ? connectedCatalogueBanner(s) : '';
  return `${pageHeader(title, subtitle || 'Connected read-only')}
    ${banner}
    ${bodyHtml}
    ${linksHtml}`;
}

/** Returns HTML when connected backend is active; otherwise null (render demo route). */
export function guardConnectedDemoSubroute(title, options = {}) {
  if (!isConnectedBackendActive(getState())) return null;
  const body =
    options.body ||
    `<p class="ri-alert ri-alert--readonly">${esc(CONNECTED_UNAVAILABLE_COPY)}</p>
     <p class="ri-muted">Switch to Demo mode in platform settings to use the original Design Lab demonstration for this screen.</p>`;
  const links =
    options.links ||
    '<p><a href="#/dashboard">Dashboard</a> · <a href="#/library">Publications Library</a></p>';
  return renderConnectedUnavailableView(title, options.subtitle || 'Design Lab demonstration only', body, links);
}

export function assertConnectedCatalogueReady(state = getState()) {
  if (!isConnectedBackendActive(state)) return { ok: true, mode: 'demo' };
  const cat = state.connectedCatalogue;
  if (cat?.status === 'error') {
    return {
      ok: false,
      mode: 'connected',
      html: renderConnectedUnavailableView(
        'Connected data unavailable',
        'Catalogue load error',
        `<p class="ri-alert">${connectedCatalogueErrorMessage(cat.error)}</p>`,
        '<p><a href="#/dashboard">Dashboard</a></p>',
      ),
    };
  }
  if (!isConnectedCatalogueReady(state)) {
    return {
      ok: false,
      mode: 'connected',
      html: renderConnectedUnavailableView(
        'Loading connected data',
        'Please wait',
        `<p class="ri-muted">${connectedCatalogueLoadingMessage()}</p>`,
      ),
    };
  }
  return { ok: true, mode: 'connected' };
}
