/**
 * Collapsible left-hand navigation for connected Design Lab.
 */
import { navIcon } from './nav-icons.js';
import { persistSectionCollapse, readCollapsedSectionSet } from './shell-nav-preferences.js';

export const SIDE_NAV = [
  { id: 'dashboard', label: 'Dashboard', path: 'dashboard', icon: 'dashboard' },
  { id: 'ask-ri', label: 'Ask RI', path: 'ask-ri', icon: 'ask' },
  {
    id: 'horizon',
    label: 'Horizon Scanning',
    icon: 'horizon',
    items: [
      { path: 'horizon', label: 'Horizon Overview', icon: 'link' },
      { path: 'feed', label: 'Regulatory Feed', icon: 'link' },
      { path: 'calendar', label: 'Regulatory Calendar', icon: 'link' },
      { path: 'horizon', label: 'Consultation Tracker', hash: '#consultations', icon: 'link' },
      { path: 'horizon', label: 'Watchlists', hash: '#watchlists', icon: 'link' },
      { path: 'landscape', label: 'Regulatory Landscape', icon: 'link' },
    ],
  },
  {
    id: 'ri',
    label: 'Regulatory Intelligence',
    icon: 'intelligence',
    items: [
      { path: 'library', label: 'Publications', icon: 'link' },
      { path: 'changes', label: 'Regulatory Changes', icon: 'link' },
      { path: 'triage/all', label: 'Findings & Triage', icon: 'link' },
      { path: 'obligations', label: 'Obligations', icon: 'link' },
      { path: 'assessments', label: 'Impact Assessments', icon: 'link' },
    ],
  },
  {
    id: 'rc',
    label: 'Risk & Controls',
    icon: 'risk',
    items: [
      { path: 'risks', label: 'Risks', icon: 'link' },
      { path: 'controls', label: 'Controls', icon: 'link' },
      { path: 'policies', label: 'Policies', icon: 'link' },
      { path: 'assurance', label: 'Assurance', icon: 'link' },
      { path: 'issues', label: 'Issues & Remediation', icon: 'link' },
      { path: 'evidence', label: 'Evidence', icon: 'link' },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    icon: 'work',
    items: [
      { path: 'my-tasks', label: 'My Tasks', icon: 'link' },
      { path: 'approval', label: 'Reviews & Approvals', icon: 'link' },
      { path: 'notifications', label: 'Attention Centre', icon: 'link' },
      { path: 'notifications', label: 'Notifications', hash: '#inbox', icon: 'link' },
    ],
  },
  { id: 'reports', label: 'Reports', path: 'reports', icon: 'reports' },
  {
    id: 'admin',
    label: 'Administration',
    icon: 'admin',
    items: [
      { path: 'admin/organisation', label: 'Organisation', icon: 'link' },
      { path: 'admin/sources', label: 'Regulatory Sources', icon: 'link' },
      { path: 'admin/classification-policy', label: 'Classification Policy', icon: 'link' },
      { path: 'admin/health', label: 'Health', icon: 'link' },
      { path: 'admin/qa', label: 'Quality Assurance', icon: 'link' },
      { path: 'admin/readiness', label: 'Readiness', icon: 'link' },
      { path: 'admin', label: 'Platform overview', icon: 'link' },
      { path: 'ingestion', label: 'Ingestion (ops)', icon: 'link' },
      { path: 'ai-operations', label: 'AI Operations (ops)', icon: 'link' },
    ],
  },
];

export function sideNavHref(item) {
  if (item.hash && item.hash.startsWith('#')) {
    const segment = item.hash.slice(1);
    return `#/${item.path}/${segment}`;
  }
  return `#/${item.path}`;
}

function iconSpan(name, label) {
  return `<span class="ri-sidebar__icon" title="${label}">${navIcon(name)}</span>`;
}

function linkLabel(label, iconName) {
  return `${iconSpan(iconName || 'link', label)}<span class="ri-sidebar__label">${label}</span>`;
}

export function renderSidebarNav(routeKey, collapsedGroups) {
  const collapsed = collapsedGroups || readCollapsedSectionSet();
  let html = '';
  let groupIndex = 0;
  for (const section of SIDE_NAV) {
    if (section.path && !section.items) {
      const active = routeKey === section.path || routeKey.startsWith(`${section.path}/`);
      html += `<a class="ri-sidebar__link${active ? ' is-active' : ''}" href="#/${section.path}" data-nav-link="${section.path}" title="${section.label}">${linkLabel(section.label, section.icon)}</a>`;
      continue;
    }
    groupIndex += 1;
    const open = !collapsed.has(section.id);
    const childActive = section.items.some(
      (it) => routeKey === it.path || routeKey.startsWith(`${it.path}/`) || routeKey.split('/')[0] === it.path,
    );
    const links = section.items
      .map((it) => {
        const href = sideNavHref(it);
        const hashSeg = it.hash?.startsWith('#') ? it.hash.slice(1) : null;
        const subPath = hashSeg ? `${it.path}/${hashSeg}` : it.path;
        const active =
          routeKey === subPath ||
          routeKey.startsWith(`${subPath}/`) ||
          (hashSeg == null && (routeKey === it.path || routeKey.startsWith(`${it.path}/`)));
        const key = it.hash ? `${it.path}${it.hash}` : it.path;
        return `<a class="ri-sidebar__sublink${active ? ' is-active' : ''}" href="${href}" data-nav-link="${key}" title="${it.label}">${linkLabel(it.label, it.icon)}</a>`;
      })
      .join('');
    html += `
      <section class="ri-sidebar__group${groupIndex > 1 ? ' ri-sidebar__group--divider' : ''}" data-nav-section="${section.id}">
        <button type="button" class="ri-sidebar__group-btn${childActive ? ' is-active' : ''}" data-nav-collapse="${section.id}" aria-expanded="${open}" title="${section.label}">
          ${iconSpan(section.icon, section.label)}
          <span class="ri-sidebar__section-label">${section.label}</span>
          <span class="ri-sidebar__caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
        </button>
        <div class="ri-sidebar__children" ${open ? '' : 'hidden'}>${links}</div>
      </section>`;
  }
  return html;
}

export function bindSidebarNav(handlers = {}) {
  document.querySelectorAll('[data-nav-collapse]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-nav-collapse');
      const panel = btn.parentElement?.querySelector('.ri-sidebar__children');
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      const caret = btn.querySelector('.ri-sidebar__caret');
      if (caret) caret.textContent = open ? '▾' : '▸';
      persistSectionCollapse(id, open);
      handlers.onToggle?.(id, open);
    });
  });
}