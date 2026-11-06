import { esc } from '../components.js';
import { getState } from '../store.js';
import { isConnectedAssuranceWritesEnabled } from './connected-mode.js';

export function renderConnectedAssuranceCreatePanel() {
  if (!isConnectedAssuranceWritesEnabled(getState())) return '';
  return `<section class="ri-panel" data-connected-assurance-create="true">
    <h2>Register assurance review</h2>
    <label>Review type <input data-connected-assurance-type placeholder="e.g. Second line sample" /></label>
    <label>Result
      <select data-connected-assurance-result>
        <option value="PASS">Pass</option>
        <option value="PASS_WITH_OBSERVATIONS">Pass with observations</option>
        <option value="FAIL">Fail</option>
        <option value="NOT_TESTED">Not tested</option>
      </select>
    </label>
    <label>Notes <textarea data-connected-assurance-notes rows="2"></textarea></label>
    <label>Link control (optional UUID) <input data-connected-assurance-control-id placeholder="control id" /></label>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-create-assurance-review>Create review</button>
    <p class="ri-muted">Reviewer is the signed-in user. Outcomes persist to <code>assurance_reviews</code> only — no demo opinions.</p>
  </section>`;
}

export function renderConnectedAssuranceHistoryNote() {
  return `<p class="ri-muted">Assurance history is loaded from tenant <code>assurance_reviews</code> and linked workflow events.</p>`;
}
