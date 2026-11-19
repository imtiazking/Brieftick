import { esc } from '../components.js';
import { getState, getDemoUser } from '../store.js';
import { isPresentationModeRequested } from './connected-mode.js';

const SIGN_OUT_HREF = '/sign-out';
const PLATFORM_HOME_HREF = '/';

function accountInitials(email) {
  if (!email) return '?';
  const local = String(email).split('@')[0] || '';
  return (local.slice(0, 2) || '?').toUpperCase();
}

function sessionAccountMeta(state) {
  const session = state.platformConfig?.backendSession;
  if (session?.ok) {
    return {
      email: session.userEmail || null,
      organisationName: session.organisationName || session.organisationId || 'Organisation',
      organisationId: session.organisationId || state.connectivity?.activeOrganisationId || '',
      role: session.role || 'Member',
    };
  }
  return null;
}

export function closeAccountChromeMenu() {
  const menu = document.getElementById('ri-account-menu');
  const btn = document.getElementById('ri-account-menu-btn');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

export function renderAccountChromeSlot() {
  const st = getState();

  if (isPresentationModeRequested()) {
    const demo = getDemoUser();
    return `<span class="ri-demo-user" id="chrome-demo-user" title="Presentation persona (not Clerk)">Demo user: ${esc(demo?.name || '—')}</span>`;
  }

  if (st.connectivity?.mode === 'auth_required') {
    return `<a class="ri-chrome__link" id="chrome-demo-user" href="/sign-in">Sign in</a>`;
  }

  const meta = sessionAccountMeta(st);
  if (!meta) {
    return `<span class="ri-demo-user" id="chrome-demo-user" title="Connecting to FORGENIQ">Connecting…</span>`;
  }

  const email = meta.email || 'Account';
  const initials = accountInitials(email);

  return `<div class="ri-account" id="ri-account-root">
    <button type="button" class="ri-account__trigger" id="ri-account-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="ri-account-menu" title="${esc(email)}">
      <span class="ri-account__avatar" aria-hidden="true">${esc(initials)}</span>
      <span class="ri-account__label">Account</span>
    </button>
    <div class="ri-account__menu" id="ri-account-menu" hidden role="menu">
      <div class="ri-account__meta">
        <p class="ri-account__email">${esc(email)}</p>
        <p class="ri-account__row"><span class="ri-account__k">Organisation</span> <strong>${esc(meta.organisationName)}</strong></p>
        ${meta.organisationId ? `<p class="ri-account__mono">${esc(meta.organisationId)}</p>` : ''}
        <p class="ri-account__row"><span class="ri-account__k">Role</span> ${esc(meta.role)}</p>
      </div>
      <div class="ri-account__actions">
        <a class="ri-account__action" href="${PLATFORM_HOME_HREF}" role="menuitem">Platform home</a>
        <a class="ri-account__action ri-account__action--signout" href="${SIGN_OUT_HREF}" role="menuitem">Sign out</a>
      </div>
    </div>
  </div>`;
}

let accountChromeListenersBound = false;

export function bindAccountChromeHandlers() {
  const btn = document.getElementById('ri-account-menu-btn');
  const menu = document.getElementById('ri-account-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    closeAccountChromeMenu();
    const productMenu = document.getElementById('product-menu');
    if (productMenu) productMenu.hidden = true;
    document.getElementById('product-menu-btn')?.setAttribute('aria-expanded', 'false');
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });

  if (!accountChromeListenersBound) {
    accountChromeListenersBound = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#ri-account-root')) closeAccountChromeMenu();
    });
  }
}
