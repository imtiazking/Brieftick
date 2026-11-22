/**
 * Connected publication — UC-RI-005 PDF-grounded obligation extraction (existing lab API).
 */
import { esc } from '../components.js';
import { getState, notify } from '../store.js';
import { getConnectedCatalogue } from './connected-catalogue.js';
import { isConnectedAiRequestEnabled } from './connected-mode.js';

const EXTRACTION_ERROR_MESSAGES = {
  uc_ri_005_run_in_progress:
    'Another obligation extraction is already running for this organisation. No new analysis was started.',
  uc_ri_005_run_reference_not_authorised:
    'This run reference is not authorised for a live extraction. No analysis was started.',
  uc_ri_005_run_reference_not_configured:
    'No run reference is authorised for live extraction. No analysis was started.',
  obligation_extraction_requires_parent_change: 'Enter the parent regulatory change ID. No analysis was started.',
  obligation_extraction_parent_change_not_found:
    'The parent regulatory change was not found in this organisation. No analysis was started.',
  obligation_extraction_parent_change_publication_mismatch:
    'The parent regulatory change belongs to a different publication. No analysis was started.',
  obligation_extraction_applicability_not_assessed:
    'This publication has no applicability assessment. No analysis was started.',
  obligation_extraction_applicability_not_approved:
    'The publication applicability assessment must be approved before extraction. No analysis was started.',
  obligation_extraction_publication_not_applicable:
    'The approved applicability assessment does not mark this publication as applicable. No analysis was started.',
};

export function connectedExtractionErrorMessage(code) {
  return (
    EXTRACTION_ERROR_MESSAGES[code] ||
    `Extraction request failed (${code || 'unknown'}). Do not try again — reload this page and check the run list.`
  );
}

function attemptedReferencesForPublication(state, publicationId) {
  return (getConnectedCatalogue(state).aiRunReferences || []).filter(
    (r) => r.publicationId === publicationId && r.idempotencySuffix,
  );
}

const SENT_REFERENCES_KEY = 'forgeniq-ri-uc-ri-005-sent-references';

function readSentReferences() {
  try {
    const list = JSON.parse(sessionStorage.getItem(SENT_REFERENCES_KEY) || '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

const sentReferences = readSentReferences();
let extractionInFlight = false;

export function markConnectedExtractionSent(publicationId, suffix) {
  sentReferences.add(`${publicationId}:${suffix}`);
  try {
    sessionStorage.setItem(SENT_REFERENCES_KEY, JSON.stringify([...sentReferences]));
  } catch {
    /* storage unavailable: the in-memory set still covers this page */
  }
  extractionInFlight = true;
}

export function markConnectedExtractionSettled() {
  extractionInFlight = false;
}

const lastStatusByPublication = new Map();

export function setConnectedExtractionStatus(publicationId, message) {
  lastStatusByPublication.set(publicationId, message);
  const el = document.querySelector('[data-connected-pub-ai-request] [data-connected-pub-ai-status]');
  if (el) el.textContent = message;
}

/** Enables Extract only for a complete request whose run reference has never been attempted. */
export function syncConnectedExtractionButton(wrap) {
  const btn = wrap?.querySelector('[data-connected-pub-ai-submit]');
  if (!btn) return;
  const publicationId = wrap.getAttribute('data-connected-pub-ai-request') || '';
  const changeId = wrap.querySelector('[data-connected-pub-ai-change-id]')?.value?.trim() || '';
  const suffix = wrap.querySelector('[data-connected-pub-ai-idempotency]')?.value?.trim() || '';
  let attempted = [];
  try {
    attempted = JSON.parse(wrap.getAttribute('data-attempted-references') || '[]');
  } catch {
    attempted = [];
  }
  const alreadyAttempted =
    Boolean(suffix) && (attempted.includes(suffix) || sentReferences.has(`${publicationId}:${suffix}`));
  btn.disabled = extractionInFlight || !changeId || !suffix || alreadyAttempted;
  const hint = wrap.querySelector('[data-connected-pub-ai-reference-hint]');
  if (hint) {
    hint.textContent = alreadyAttempted
      ? 'This run reference has already been attempted. Open the existing run below; a new attempt needs a new authorised run reference.'
      : '';
  }
}

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
  if (!res.ok || !body.ok) throw new Error(body.reason || body.error || body.code || 'ai_request_failed');
  notify();
  return body;
}

export function renderConnectedPublicationObligationExtractionPanel(publication) {
  const state = getState();
  if (!publication?.id) return '';
  if (!isConnectedAiRequestEnabled(state)) {
    return '';
  }
  const attempted = attemptedReferencesForPublication(state, publication.id);
  const attemptedSuffixes = attempted.map((r) => r.idempotencySuffix);
  const attemptedList = attempted.length
    ? `<p class="ri-muted" data-connected-pub-ai-attempted>Run references already attempted for this publication: ${attempted
        .map(
          (r) =>
            `<a href="#/ai-analysis/${esc(r.runId)}"><code>${esc(r.idempotencySuffix)}</code></a> (${esc(r.executionStatus || '—')})`,
        )
        .join(', ')}. Reusing a reference returns the existing run and never starts a new analysis.</p>`
    : '';
  return `<section class="ri-panel" data-connected-pub-ai-request="${esc(publication.id)}" data-attempted-references="${esc(JSON.stringify(attemptedSuffixes))}">
    <h3>Extract candidate obligations (UC-RI-005)</h3>
    <p class="ri-muted">Runs PDF-grounded candidate extraction via existing staging APIs. Proposed obligations remain in the analysis run until accepted through the existing maker-checker review workflow — nothing is auto-materialised.</p>
    <label>Parent regulatory change ID (required — the publication's applicability assessment must be approved) <input type="text" data-connected-pub-ai-change-id data-preserve-input="pub-ai-change-id" placeholder="regulatory change UUID" class="ri-input" required /></label>
    <label>Run reference (required — the authorised idempotency suffix for this attempt) <input type="text" data-connected-pub-ai-idempotency data-preserve-input="pub-ai-idempotency" placeholder="authorised run reference" class="ri-input" required /></label>
    ${attemptedList}
    <p class="ri-muted" data-connected-pub-ai-reference-hint></p>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-pub-ai-submit disabled>Extract obligations</button>
    <span class="ri-muted" data-connected-pub-ai-status>${esc(lastStatusByPublication.get(publication.id) || '')}</span>
  </section>`;
}

/** Existing AI Analysis tab — extraction panel + persisted runs table (no layout change). */
export function renderConnectedPublicationExtractionOrchestrationPanel(publication) {
  const state = getState();
  if (!publication?.id || !isConnectedAiRequestEnabled(state)) return '';
  return `<section class="ri-panel" data-connected-pub-extraction-orchestration="${esc(publication.id)}">
    <h3>Full publication extraction plan (RI-CLS-007)</h3>
    <p class="ri-muted">Creates a batch orchestration ledger on the publication. Each batch still needs its own authorised run reference and explicit human approval; coverage stays partial until reconciliation reports complete instrument provision analysis.</p>
    <label>Parent change ID for orchestration <input type="text" data-connected-orchestration-change-id class="ri-input" placeholder="regulatory change UUID" /></label>
    <label>Spend cap (USD, optional) <input type="number" step="0.01" min="0" data-connected-orchestration-spend-cap class="ri-input" placeholder="e.g. 1.50" /></label>
    <button type="button" class="ri-btn" data-connected-orchestration-init>Initialise orchestration plan</button>
    <button type="button" class="ri-btn ri-btn--secondary" data-connected-orchestration-advance>Next batch (authorised run)</button>
    <button type="button" class="ri-btn ri-btn--secondary" data-connected-orchestration-refresh>Refresh status</button>
    <pre class="ri-code" data-connected-orchestration-status>—</pre>
  </section>`;
}

export async function fetchConnectedExtractionOrchestration(state, publicationId, { changeId, spendCapUsd, resume, action, baseIdempotencySuffix } = {}) {
  const base = apiBase(state);
  const res = await fetch(`${base}/publications/${encodeURIComponent(publicationId)}/extraction-orchestration`, {
    method: resume ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: resume ? undefined : JSON.stringify({ changeId, spendCapUsd, resume: false, action, baseIdempotencySuffix }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.reason || body.error || body.code || 'orchestration_failed');
  return body;
}

export function renderConnectedPublicationAiTab(publication, runsSectionHtml) {
  const extract = renderConnectedPublicationObligationExtractionPanel(publication);
  const orch = renderConnectedPublicationExtractionOrchestrationPanel(publication);
  return `${extract}${orch}${runsSectionHtml || ''}`;
}