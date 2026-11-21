/**
 * Regulatory Classification Policy administration (connected mode). Reads every version; platform operators
 * propose a DRAFT version, and a different operator activates or withdraws it. The server and database
 * re-validate every rule shown here (legal status, conversion eligibility, queues, maker-checker).
 */
import { esc, badge } from '../components.js';

const QUEUE_LABELS = {
  OBLIGATION_TRIAGE: 'Obligation Triage',
  NON_OBLIGATION_TRIAGE: 'Non-Obligation Triage',
  EXCEPTION_TRIAGE: 'Exception Triage',
};

/** Screen selection and unsubmitted draft, kept across store-driven re-renders. */
const ui = { regulatorKey: 'REG-FCA', policyId: null, editing: false, draft: null };

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export function renderClassificationPolicyAdminPlaceholder() {
  return '<div data-connected-classification-policy-admin-load class="ri-muted">Loading classification policies…</div>';
}

export async function fetchClassificationPolicyAdmin(state) {
  const res = await fetch(`${apiBase(state)}/classification-policy/admin`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'classification_policy_admin_unavailable');
  return body;
}

async function postAdmin(state, payload) {
  const res = await fetch(`${apiBase(state)}/classification-policy/admin`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.reason || body.detail || body.error || 'classification_policy_admin_failed');
  return body;
}

const statusBadge = (s) => badge(s === 'ACTIVE' ? 'Active' : s === 'DRAFT' ? 'Draft' : s === 'SUPERSEDED' ? 'Superseded' : 'Withdrawn');

function policiesFor(body, key) {
  return (body.policies || []).filter((p) => p.regulatorKey === key);
}

function templateEntries(body, key) {
  const active = policiesFor(body, key).find((p) => p.status === 'ACTIVE');
  if (active) return active.entries.map((e) => ({ ...e, include: true }));
  return body.vocabulary.codes.map(({ code, legalStatus }) => ({
    code,
    legalStatus,
    description: '',
    conversionEnabled: false,
    destinationQueue: code === 'UNKNOWN' ? 'EXCEPTION_TRIAGE' : 'NON_OBLIGATION_TRIAGE',
    supportingObligationLinkRequired: legalStatus === 'evidential',
    include: true,
  }));
}

function renderRegulatorList(body) {
  const rows = (body.regulators || []).map((r) => {
    const versions = policiesFor(body, r.key);
    const active = versions.find((p) => p.status === 'ACTIVE');
    const drafts = versions.filter((p) => p.status === 'DRAFT').length;
    const state = active
      ? `${badge('Active')} v${esc(String(active.policyVersion))}`
      : `${badge('Unavailable')} <span class="ri-muted">no policy — fails closed</span>`;
    return `<tr${r.key === ui.regulatorKey ? ' aria-current="true"' : ''}>
      <td><button type="button" class="ri-btn ri-btn--ghost" data-cp-select-regulator="${esc(r.key)}">${esc(r.acronym || r.key)}</button></td>
      <td>${esc(r.name || '')}</td><td>${state}</td><td>${drafts ? `${drafts} draft${drafts > 1 ? 's' : ''}` : '—'}</td></tr>`;
  });
  return `<table class="ri-table" data-cp-regulators><thead><tr><th>Regulator</th><th>Name</th><th>Active policy</th><th>Drafts</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function renderEntries(entries) {
  const rows = entries.map(
    (e) => `<tr data-cp-entry="${esc(e.code)}"><td class="ri-mono">${esc(e.code)}</td><td>${esc(e.description)}</td><td>${esc(e.legalStatus)}</td>
      <td>${e.conversionEnabled ? '<strong>Yes</strong>' : 'No'}</td><td>${esc(QUEUE_LABELS[e.destinationQueue] || e.destinationQueue)}</td>
      <td>${e.supportingObligationLinkRequired ? 'Required' : '—'}</td></tr>`,
  );
  return `<table class="ri-table"><thead><tr><th>Code</th><th>Description</th><th>Legal status</th><th>Converts to DRAFT obligation</th><th>Destination queue</th><th>Binding link</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function renderVersionActions(body, p) {
  if (p.status !== 'DRAFT' || !body.operator) return '';
  if (!body.writesEnabled) return '<p class="ri-muted">Policy changes are disabled on this environment.</p>';
  const own = p.createdBy === body.viewerUserId;
  return `<div class="ri-panel" data-cp-draft-actions="${esc(p.id)}">
    ${
      own
        ? '<p class="ri-callout" data-cp-own-draft>You proposed this draft. A different platform operator must review and activate it.</p>'
        : `<button type="button" class="ri-btn" data-cp-activate="${esc(p.id)}">Activate v${esc(String(p.policyVersion))}</button>`
    }
    <label>Withdrawal reason (at least 10 characters) <textarea rows="2" data-cp-withdraw-reason></textarea></label>
    <button type="button" class="ri-btn ri-btn--ghost" data-cp-withdraw="${esc(p.id)}">Withdraw draft</button>
  </div>`;
}

function renderVersionDetail(body, p) {
  if (!p) return '<p class="ri-muted" data-cp-no-policy>No classification policy exists for this regulator. Obligations and AI findings for its publications are refused until a policy is activated.</p>';
  const events = (body.events || []).filter((e) => e.policy_id === p.id);
  return `<section class="ri-panel" data-cp-version="${esc(p.id)}" data-cp-version-status="${esc(p.status)}">
    <h3>${esc(p.regulatorKey)} v${esc(String(p.policyVersion))} ${statusBadge(p.status)}</h3>
    <dl class="ri-dl ri-dl--compact">
      <dt>Effective from</dt><dd>${esc(p.effectiveFrom)}</dd>
      <dt>Change reason</dt><dd>${esc(p.changeReason)}</dd>
      <dt>Proposed by</dt><dd class="ri-mono">${esc(p.createdBy)}</dd>
      <dt>Approved by</dt><dd class="ri-mono">${esc(p.approvedBy || '—')}${p.approvedAt ? ` · ${esc(p.approvedAt)}` : ''}</dd>
      <dt>Non-binding publication types</dt><dd>${esc((p.nonBindingPublicationTypes || []).join(', '))}</dd>
    </dl>
    ${renderEntries(p.entries)}
    ${renderVersionActions(body, p)}
    ${
      body.operator
        ? `<h4>Audit history</h4><ul class="ri-list" data-cp-events>${
            events.length
              ? events.map((e) => `<li><span class="ri-mono">${esc(e.created_at)}</span> ${esc(e.event_type)} · ${esc(e.actor)}</li>`).join('')
              : '<li class="ri-muted">No events</li>'
          }</ul>`
        : '<p class="ri-muted">Audit history is visible to platform operators.</p>'
    }
  </section>`;
}

function renderEditor(body) {
  const d = ui.draft;
  const vocab = body.vocabulary;
  const rows = d.entries.map((e, i) => {
    const convertible = vocab.convertibleLegalStatuses.includes(e.legalStatus);
    const unknown = e.code === 'UNKNOWN';
    const queues = e.conversionEnabled ? ['OBLIGATION_TRIAGE'] : unknown ? ['EXCEPTION_TRIAGE'] : ['NON_OBLIGATION_TRIAGE', 'EXCEPTION_TRIAGE'];
    return `<tr data-cp-edit-entry="${i}">
      <td><input type="checkbox" data-cp-f="include" ${e.include ? 'checked' : ''} ${unknown ? 'disabled' : ''} aria-label="Include ${esc(e.code)}" /></td>
      <td class="ri-mono">${esc(e.code)}</td><td>${esc(e.legalStatus)}</td>
      <td><input type="text" class="ri-input" data-cp-f="description" value="${esc(e.description)}" aria-label="Description for ${esc(e.code)}" /></td>
      <td><input type="checkbox" data-cp-f="conversionEnabled" ${e.conversionEnabled ? 'checked' : ''} ${convertible ? '' : 'disabled'} aria-label="Conversion for ${esc(e.code)}" /></td>
      <td><select data-cp-f="destinationQueue" aria-label="Queue for ${esc(e.code)}">${queues
        .map((q) => `<option value="${q}" ${q === e.destinationQueue ? 'selected' : ''}>${esc(QUEUE_LABELS[q])}</option>`)
        .join('')}</select></td>
      <td>${e.legalStatus === 'evidential' ? 'Required' : '—'}</td></tr>`;
  });
  const extraTypes = (d.nonBindingPublicationTypes || []).filter((t) => !vocab.mandatoryNonBindingPublicationTypes.includes(t));
  return `<section class="ri-panel" data-cp-editor>
    <h3>Propose a new ${esc(d.regulatorKey)} version</h3>
    <p class="ri-muted">The proposal is saved as a DRAFT. It takes effect only when a different platform operator activates it. Legal status is fixed per code; only binding and evidential codes can convert, always to DRAFT obligations with human review; evidential codes always require a link to a binding obligation; Unknown always goes to Exception Triage.</p>
    <table class="ri-table"><thead><tr><th>Include</th><th>Code</th><th>Legal status</th><th>Description</th><th>Converts</th><th>Destination queue</th><th>Binding link</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <p>Always non-binding: <span class="ri-mono">${esc(vocab.mandatoryNonBindingPublicationTypes.join(', '))}</span></p>
    <label>Additional non-binding publication types (comma-separated) <input type="text" class="ri-input" data-cp-types value="${esc(extraTypes.join(', '))}" /></label>
    <label>Effective from <input type="date" class="ri-input" data-cp-effective value="${esc(d.effectiveFrom)}" /></label>
    <label>Change reason (at least 10 characters) <textarea rows="3" data-cp-reason>${esc(d.changeReason)}</textarea></label>
    <button type="button" class="ri-btn" data-cp-propose>Propose DRAFT version</button>
    <button type="button" class="ri-btn ri-btn--ghost" data-cp-cancel>Cancel</button>
  </section>`;
}

export function renderClassificationPolicyAdminPanel(body) {
  const versions = policiesFor(body, ui.regulatorKey);
  const selected =
    versions.find((p) => p.id === ui.policyId) || versions.find((p) => p.status === 'ACTIVE') || versions[0] || null;
  const versionRows = versions.map(
    (p) => `<tr><td><button type="button" class="ri-btn ri-btn--ghost" data-cp-select-version="${esc(p.id)}">v${esc(String(p.policyVersion))}</button></td>
      <td>${statusBadge(p.status)}</td><td>${esc(p.effectiveFrom)}</td><td class="ri-mono">${esc(p.createdBy)}</td><td class="ri-mono">${esc(p.approvedBy || '—')}</td></tr>`,
  );
  const canPropose = body.operator && body.writesEnabled;
  return `<div data-connected-classification-policy-admin data-cp-operator="${body.operator ? 'true' : 'false'}">
    ${
      body.operator
        ? body.writesEnabled
          ? ''
          : '<p class="ri-callout" data-cp-writes-disabled>Policy changes are disabled on this environment. Policies are shown read-only.</p>'
        : '<p class="ri-callout" data-cp-read-only>Read-only. Only FORGENIQ platform operators can propose or activate classification policies.</p>'
    }
    <section class="ri-panel"><h2>Regulators</h2>${renderRegulatorList(body)}</section>
    <section class="ri-panel"><h2>${esc(ui.regulatorKey)} versions</h2>
      ${versionRows.length ? `<table class="ri-table"><thead><tr><th>Version</th><th>Status</th><th>Effective</th><th>Proposed by</th><th>Approved by</th></tr></thead><tbody>${versionRows.join('')}</tbody></table>` : ''}
      ${canPropose && !ui.editing ? '<button type="button" class="ri-btn" data-cp-new-draft>Draft a new version</button>' : ''}
    </section>
    ${ui.editing && canPropose ? renderEditor(body) : ''}
    ${renderVersionDetail(body, selected)}
  </div>`;
}

function readEditor(panel) {
  const d = ui.draft;
  panel.querySelectorAll('[data-cp-edit-entry]').forEach((row) => {
    const e = d.entries[Number(row.getAttribute('data-cp-edit-entry'))];
    e.include = e.code === 'UNKNOWN' || row.querySelector('[data-cp-f="include"]').checked;
    e.description = row.querySelector('[data-cp-f="description"]').value;
    const conv = row.querySelector('[data-cp-f="conversionEnabled"]');
    e.conversionEnabled = !conv.disabled && conv.checked;
    e.destinationQueue = row.querySelector('[data-cp-f="destinationQueue"]').value;
    if (e.conversionEnabled) e.destinationQueue = 'OBLIGATION_TRIAGE';
    else if (e.destinationQueue === 'OBLIGATION_TRIAGE') e.destinationQueue = 'NON_OBLIGATION_TRIAGE';
    e.supportingObligationLinkRequired = e.legalStatus === 'evidential';
  });
  d.nonBindingPublicationTypes = String(panel.querySelector('[data-cp-types]')?.value || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  d.effectiveFrom = panel.querySelector('[data-cp-effective]')?.value || d.effectiveFrom;
  d.changeReason = panel.querySelector('[data-cp-reason]')?.value || '';
}

export function proposalPayload(draft) {
  return {
    action: 'propose',
    regulatorKey: draft.regulatorKey,
    effectiveFrom: draft.effectiveFrom,
    nonBindingPublicationTypes: draft.nonBindingPublicationTypes,
    changeReason: draft.changeReason.trim(),
    entries: draft.entries
      .filter((e) => e.include)
      .map((e) => ({
        code: e.code,
        description: e.description.trim(),
        conversionEnabled: e.conversionEnabled,
        destinationQueue: e.destinationQueue,
        supportingObligationLinkRequired: e.supportingObligationLinkRequired,
      })),
  };
}

/** Wires selection, editing and the operator actions; `rerender(body)` redraws, `onChanged` reloads. */
export function bindClassificationPolicyAdmin(panel, body, state, { rerender, onChanged, onError }) {
  if (!panel) return;
  const act = (fn, message) =>
    fn()
      .then(() => onChanged(message))
      .catch((e) => onError(e));
  panel.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-cp-select-regulator')) {
      ui.regulatorKey = t.getAttribute('data-cp-select-regulator');
      ui.policyId = null;
      ui.editing = false;
      return rerender(body);
    }
    if (t.hasAttribute('data-cp-select-version')) {
      ui.policyId = t.getAttribute('data-cp-select-version');
      return rerender(body);
    }
    if (t.hasAttribute('data-cp-new-draft')) {
      ui.editing = true;
      ui.draft = {
        regulatorKey: ui.regulatorKey,
        entries: templateEntries(body, ui.regulatorKey),
        nonBindingPublicationTypes: policiesFor(body, ui.regulatorKey).find((p) => p.status === 'ACTIVE')?.nonBindingPublicationTypes || [],
        effectiveFrom: new Date().toISOString().slice(0, 10),
        changeReason: '',
      };
      return rerender(body);
    }
    if (t.hasAttribute('data-cp-cancel')) {
      ui.editing = false;
      ui.draft = null;
      return rerender(body);
    }
    if (t.hasAttribute('data-cp-propose')) {
      readEditor(panel);
      return act(async () => {
        const result = await postAdmin(state, proposalPayload(ui.draft));
        ui.editing = false;
        ui.draft = null;
        ui.policyId = result.policyId;
      }, 'DRAFT classification policy proposed — a different operator must activate it');
    }
    if (t.hasAttribute('data-cp-activate')) {
      const policyId = t.getAttribute('data-cp-activate');
      return act(() => postAdmin(state, { action: 'activate', policyId }), 'Classification policy activated');
    }
    if (t.hasAttribute('data-cp-withdraw')) {
      const policyId = t.getAttribute('data-cp-withdraw');
      const reason = t.closest('[data-cp-draft-actions]')?.querySelector('[data-cp-withdraw-reason]')?.value || '';
      return act(() => postAdmin(state, { action: 'withdraw', policyId, reason }), 'Draft withdrawn');
    }
    return undefined;
  });
  panel.addEventListener('change', (ev) => {
    if (!ui.editing || !ev.target.closest('[data-cp-editor]')) return;
    readEditor(panel);
    rerender(body);
  });
}
