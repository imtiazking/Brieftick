import { esc, badge, formatDate } from '../components.js';
import { getState } from '../store.js';
import { getConnectedAssigneeLabel, getConnectedCatalogue } from './connected-catalogue.js';
import { isConnectedObligationReviewEnabled, isConnectedObligationWritesEnabled } from './connected-mode.js';
import { renderConnectedWorkflowEventsTable } from './connected-governance-ui.js';
import { getConnectedEntityWorkflowEvents } from './connected-entity-audit.js';

export function renderConnectedObligationWorkflowPanel(obligationId) {
  const events = getConnectedEntityWorkflowEvents(getState(), 'regulatory_obligation', obligationId);
  return `<section class="ri-panel"><h2>Audit history</h2>
    ${renderConnectedWorkflowEventsTable(events, 'No workflow events for this obligation yet')}</section>`;
}

export function renderConnectedObligationEditPanel(id, o) {
  if (!isConnectedObligationWritesEnabled(getState())) return '';
  const s = getState();
  const cat = getConnectedCatalogue(s);
  const members = cat.orgMembers || [];
  const options = members
    .map((m) => `<option value="${esc(m.clerkUserId)}">${esc(m.label || m.clerkUserId)}</option>`)
    .join('');
  return `<section class="ri-panel" data-connected-obligation-panel="${esc(id)}">
    <h2>Obligation maintenance</h2>
    <div class="ri-form">
      <label>Statement <textarea data-connected-obligation-field="obligation_statement" rows="3">${esc(o.statement || o.title || '')}</textarea></label>
      <label>Citation <input data-connected-obligation-field="citation" value="${esc(o.citation || '')}" /></label>
      <label>Priority <input data-connected-obligation-field="priority" value="${esc(o.priority || '')}" /></label>
      <label>Due date <input type="date" data-connected-obligation-field="due_date" value="${esc(o.dueDateRaw || '')}" /></label>
      <label>Status <input data-connected-obligation-field="status" value="${esc(o.statusCode || o.status || 'DRAFT')}" /></label>
      <label>Assign owner
        <select data-connected-obligation-owner-select>
          <option value="">Select member…</option>
          ${options}
        </select>
      </label>
    </div>
    <div class="ri-form__actions">
      <button type="button" class="ri-btn ri-btn--primary" data-connected-obligation-save data-obligation-id="${esc(id)}" data-expected-updated-at="${esc(o.updatedAt || '')}">Save</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-obligation-assign data-obligation-id="${esc(id)}" data-expected-updated-at="${esc(o.updatedAt || '')}">Assign owner</button>
    </div>
    <p class="ri-muted">Owner: ${esc(getConnectedAssigneeLabel(s, o.ownerId) || o.ownerLabel || '—')} · Updated ${formatDate(o.updatedAt)}</p>
  </section>`;
}

const LEGAL_STATUS_LABELS = {
  binding: 'Binding obligation',
  evidential: 'Evidential requirement',
};

/** Regulatory classification of an obligation; legacy obligations without one are flagged for review. */
export function renderConnectedObligationClassificationPanel(id, o) {
  if (!o?._connected) return '';
  if (o.classificationReviewRequired) {
    return `<section class="ri-panel" data-connected-obligation-classification="${esc(id)}" data-classification-review-required>
      <h2>Regulatory classification</h2>
      <p class="ri-callout">Classification review required: this obligation was created before the regulatory classification policy and has no verified classification or authoritative legal basis. It is retained, not deleted; review it against the authoritative provision.</p>
    </section>`;
  }
  return `<section class="ri-panel" data-connected-obligation-classification="${esc(id)}">
    <h2>Regulatory classification</h2>
    <dl class="ri-dl">
      <dt>Code</dt><dd data-obligation-classification-code>${esc(o.classificationCode || '—')}</dd>
      <dt>Reporting category</dt><dd data-obligation-legal-status>${esc(LEGAL_STATUS_LABELS[o.legalStatus] || o.legalStatus || '—')}</dd>
      ${o.authoritativeReference ? `<dt>Authoritative provision</dt><dd>${esc(o.authoritativeReference)}</dd>` : ''}
      ${
        o.supportsObligationId
          ? `<dt>Evidences binding obligation</dt><dd><a href="#/obligation/${esc(o.supportsObligationId)}">${esc(o.supportsObligationId.slice(0, 8))}…</a></dd>`
          : ''
      }
    </dl>
  </section>`;
}

export function renderConnectedObligationReviewPanel(id, o) {
  if (!isConnectedObligationReviewEnabled(getState())) return '';
  const governed = o.origin === 'AI_ASSISTED' || (o.classificationCode && !o.classificationReviewRequired);
  if (!governed || o.statusCode !== 'IN_REVIEW') return '';
  const explanation =
    o.origin === 'AI_ASSISTED'
      ? 'AI-assisted obligation submitted for approval. The approver must not be the AI run requester, the person who accepted the AI output, or the person who submitted it.'
      : 'Classified obligation submitted for approval. The approver must verify the authoritative provision and must not be the creator or the person who submitted it.';
  return `<section class="ri-panel" data-connected-obligation-review="${esc(id)}">
    <h2>Independent review</h2>
    <p class="ri-muted">${esc(explanation)}</p>
    <div class="ri-form__actions">
      <button type="button" class="ri-btn ri-btn--primary" data-connected-obligation-decision="OPEN" data-obligation-id="${esc(id)}" data-expected-updated-at="${esc(o.updatedAt || '')}">Approve into register</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-connected-obligation-decision="DRAFT" data-obligation-id="${esc(id)}" data-expected-updated-at="${esc(o.updatedAt || '')}">Return to draft</button>
    </div>
  </section>`;
}

export function renderConnectedCreateObligationPanel(changeId) {
  if (!isConnectedObligationWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-create-obligation="${esc(changeId)}">
    <h2>Regulatory obligation</h2>
    <div class="ri-form">
      <label>Statement <textarea data-connected-obligation-create-statement rows="2" placeholder="Describe the implementation obligation…"></textarea></label>
      <label>Citation <input data-connected-obligation-create-citation /></label>
      <label>Due date <input type="date" data-connected-obligation-create-due /></label>
      <label>Regulatory classification code
        <select data-connected-obligation-create-code>
          <option value="">Select…</option>
          <option value="R">R — Rule</option>
          <option value="E">E — Evidential provision (link the binding obligation)</option>
          <option value="D">D — Direction</option>
          <option value="P">P — Principle</option>
          <option value="UK">UK — UK legislation</option>
          <option value="EU">EU — Applicable EU legislation</option>
          <option value="TS">TS — Binding technical standards</option>
        </select>
      </label>
      <label>Legal basis <input data-connected-obligation-create-legal-basis placeholder="e.g. PSRs 2017 regulation 86(2C)" /></label>
      <label>Authoritative provision reference <input data-connected-obligation-create-authority-reference /></label>
      <label>Authoritative source URL <input type="url" data-connected-obligation-create-authority-url placeholder="https://www.legislation.gov.uk/… or https://www.handbook.fca.org.uk/…" /></label>
      <label>Exact text of the authoritative provision <textarea data-connected-obligation-create-authority-quotation rows="3"></textarea></label>
      <label>Binding obligation this evidential provision supports (E only) <input data-connected-obligation-create-supports placeholder="Obligation UUID" /></label>
      <p class="ri-muted">Guidance text cannot ground a binding classification: verify the provision on legislation.gov.uk, the FCA Handbook or EUR-Lex. The obligation is created as DRAFT and needs independent approval. Non-obligation material (guidance, conduct, permissions, definitions…) is recorded through finding triage, not here.</p>
    </div>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-obligation data-change-id="${esc(changeId)}">Create obligation</button>
  </section>`;
}

export function renderConnectedObligationLinkPanel(id, o) {
  if (!isConnectedObligationWritesEnabled(getState())) return '';
  const s = getState();
  const cat = getConnectedCatalogue(s);
  const riskPick = [];
  const seenRisk = new Set();
  for (const r of [...(cat.authorisedUatRisks || []), ...(cat.risks || [])]) {
    if (!r?.id || seenRisk.has(r.id)) continue;
    seenRisk.add(r.id);
    riskPick.push(`<option value="${esc(r.id)}">${esc(r.title || r.id.slice(0, 8))}</option>`);
  }
  const controlPick = [];
  const seenCtrl = new Set();
  for (const c of [...(cat.authorisedUatControls || []), ...(cat.controls || [])]) {
    if (!c?.id || seenCtrl.has(c.id)) continue;
    seenCtrl.add(c.id);
    controlPick.push(`<option value="${esc(c.id)}">${esc(c.name || c.title || c.id.slice(0, 8))}</option>`);
  }
  const listId = `connected-link-targets-${esc(id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return `<section class="ri-panel" data-connected-link-panel data-obligation-id="${esc(id)}">
    <h2>Link risk or control</h2>
    <div class="ri-form">
      <label>Risk ID
        <input data-connected-link-target list="${listId}-risks" placeholder="Full risk UUID" autocomplete="off" />
      </label>
      <label>Control ID
        <input data-connected-link-control-target list="${listId}-controls" placeholder="Full control UUID" autocomplete="off" />
      </label>
      <datalist id="${listId}-risks">${riskPick.join('')}</datalist>
      <datalist id="${listId}-controls">${controlPick.join('')}</datalist>
    </div>
    <div class="ri-form__actions">
      <button type="button" class="ri-btn ri-btn--sm ri-btn--primary" data-ri-post-link data-link-type="obligation_risk" data-left-id="${esc(id)}">Link risk</button>
      <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-ri-post-link data-link-type="obligation_control" data-left-id="${esc(id)}">Link control</button>
    </div>
    <p class="ri-muted">Choose from the register list or paste the full UUID. Short prefixes are not accepted.</p>
  </section>`;
}
