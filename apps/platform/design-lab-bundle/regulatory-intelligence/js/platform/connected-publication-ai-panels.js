/**
 * Connected publication — UC-RI-005 obligation extraction request (AI Dev tenant only).
 */
import { esc, badge } from '../components.js';
import { getState } from '../store.js';
import { isConnectedAiRequestEnabled } from './connected-mode.js';
import { notify } from '../store.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export async function requestConnectedObligationExtraction(state, { publicationId, targetChangeId, idempotencySuffix }) {
  if (!isConnectedAiRequestEnabled(state)) throw new Error('connected_ai_request_disabled');
  const base = apiBase(state);
  const res = await fetch(`${base}/ai-analysis-runs`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicationId,
      useCaseId: 'UC-RI-005',
      targetEntityId: targetChangeId || undefined,
      idempotencyKeySuffix: idempotencySuffix,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || body.code || 'ai_request_failed');
  notify();
  return body;
}

export function renderConnectedPublicationObligationExtractionPanel(publication) {
  const state = getState();
  if (!publication?.id) return '';
  if (!isConnectedAiRequestEnabled(state)) {
    return `<section class="ri-panel"><h3>Extract candidate obligations (UC-RI-005)</h3>
      <p class="ri-muted">Live AI execution is disabled. Enable RI_AI_EXECUTION_ENABLED, RI_LAB_CONNECTED_WRITES_ENABLED, and ai:request on the technical AI Development organisation session.</p></section>`;
  }
  return `<section class="ri-panel" data-connected-pub-ai-request="${esc(publication.id)}">
    <h3>Extract candidate obligations (UC-RI-005)</h3>
    <p class="ri-muted">Runs PDF-grounded candidate obligation extraction with mandatory human review. Guidance publications (e.g. FG22/5) may return candidates but obligation-grade materialisation remains gated.</p>
    <label>Optional parent change ID <input type="text" data-connected-pub-ai-change-id placeholder="regulatory change UUID" class="ri-input" /></label>
    <label>Idempotency suffix <input type="text" data-connected-pub-ai-idempotency value="UAT-AI-FG22-PDF-v1" class="ri-input" /></label>
    <p class="ri-muted">Tenant: FORGENIQ AI Development only — Partner UAT is not used for experimental AI.</p>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-pub-ai-submit>Extract obligations</button>
    <span class="ri-muted" data-connected-pub-ai-status></span>
  </section>`;
}

export function renderConnectedPublicationAiTab(publication, runsSectionHtml) {
  const extract = renderConnectedPublicationObligationExtractionPanel(publication);
  return `${extract}${runsSectionHtml || ''}`;
}