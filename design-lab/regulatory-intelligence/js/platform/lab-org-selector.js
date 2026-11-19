/**
 * Shared Supabase tenant picker (distinct from Clerk Organizations).
 */
import { esc } from '../components.js';

export function renderOrganisationMembershipPicker(state, { heading = 'Active FORGENIQ organisation' } = {}) {
  const orgMemberships = state.connectivity?.orgMemberships || [];
  if (!orgMemberships.length) {
    return `<p class="ri-muted">No Supabase organisation memberships were returned for this Clerk user.</p>`;
  }
  if (orgMemberships.length === 1) {
    const m = orgMemberships[0];
    return `<p class="ri-muted">${esc(heading)}: <strong>${esc(m.organisationName || m.organisationId)}</strong> · ${esc(m.role)}</p>`;
  }
  return `<div class="ri-form-group">
      <label for="ri-active-org-select">${esc(heading)}</label>
      <select id="ri-active-org-select" data-ri-select-org>
        <option value="">— Select organisation —</option>
        ${orgMemberships
          .map(
            (m) =>
              `<option value="${esc(m.organisationId)}"${m.organisationId === state.connectivity?.activeOrganisationId ? ' selected' : ''}>${esc(m.organisationName || m.organisationId)} · ${esc(m.role)}</option>`,
          )
          .join('')}
      </select>
      <button type="button" class="ri-btn ri-btn--primary" data-ri-apply-org>Use selected organisation</button>
      <p class="ri-muted">This sets the <code>forgeniq_active_org</code> cookie for tenant-scoped RI APIs. Clerk organisation membership is separate.</p>
    </div>`;
}