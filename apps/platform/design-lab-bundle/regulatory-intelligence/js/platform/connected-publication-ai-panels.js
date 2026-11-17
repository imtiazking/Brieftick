/**
 * Connected publication — UC-RI-005 PDF-grounded obligation extraction (existing lab API).
 */
import { esc } from '../components.js';
import { getState, notify } from '../store.js';
import { isConnectedAiRequestEnabled } from './connected-mode.js';

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
    return '';
  }
  return `<section class="ri-panel" data-connected-pub-ai-request="${esc(publication.id)}">
    <h3>Extract candidate obligations (UC-RI-005)</h3>
    <p class="ri-muted">Runs PDF-grounded candidate extraction via existing staging APIs. Proposed obligations remain in the analysis run until accepted through the existing maker-checker review workflow — nothing is auto-materialised.</p>
    <label>Optional parent change ID <input type="text" data-connected-pub-ai-change-id placeholder="regulatory change UUID" class="ri-input" /></label>
    <label>Idempotency suffix <input type="text" data-connected-pub-ai-idempotency placeholder="optional run suffix" class="ri-input" /></label>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-pub-ai-submit>Extract obligations</button>
    <span class="ri-muted" data-connected-pub-ai-status></span>
  </section>`;
}

/** Existing AI Analysis tab — extraction panel + persisted runs table (no layout change). */
export function renderConnectedPublicationAiTab(publication, runsSectionHtml) {
  const extract = renderConnectedPublicationObligationExtractionPanel(publication);
  return `${extract}${runsSectionHtml || ''}`;
}