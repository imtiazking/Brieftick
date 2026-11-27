/**
 * Collapsible left-hand navigation for connected Design Lab.
 */

export const SIDE_NAV = [
  { id: 'dashboard', label: 'Dashboard', path: 'dashboard' },
  {
    id: 'horizon',
    label: 'Horizon Scanning',
    items: [
      { path: 'horizon', label: 'Horizon Overview' },
      { path: 'feed', label: 'Regulatory Feed' },
      { path: 'calendar', label: 'Regulatory Calendar' },
      { path: 'horizon', label: 'Consultation Tracker', hash: '#consultations' },
      { path: 'horizon', label: 'Watchlists', hash: '#watchlists' },
      { path: 'landscape', label: 'Regulatory Landscape' },
    ],
  },
  {
    id: 'ri',
    label: 'Regulatory Intelligence',
    items: [
      { path: 'library', label: 'Publications' },
      { path: 'changes', label: 'Regulatory Changes' },
      { path: 'triage/all', label: 'Findings & Triage' },
      { path: 'obligations', label: 'Obligations' },
      { path: 'assessments', label: 'Impact Assessments' },
    ],
  },
  {
    id: 'rc',
    label: 'Risk & Controls',
    items: [
      { path: 'risks', label: 'Risks' },
      { path: 'controls', label: 'Controls' },
      { path: 'policies', label: 'Policies' },
      { path: 'assurance', label: 'Assurance' },
      { path: 'issues', label: 'Issues & Remediation' },
      { path: 'evidence', label: 'Evidence' },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    items: [
      { path: 'my-tasks', label: 'My Tasks' },
      { path: 'approval', label: 'Reviews & Approvals' },
      { path: 'notifications', label: 'Attention Centre' },
      { path: 'notifications', label: 'Notifications', hash: '#inbox' },
    ],
  },
  { id: 'reports', label: 'Reports', path: 'reports' },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { path: 'admin', label: 'Administration' },
      { path: 'admin/organisation', label: 'Organisation' },
      { path: 'admin/sources', label: 'Regulatory Sources' },
      { path: 'admin/classification-policy', label: 'Classification Policy' },
      { path: 'admin/health', label: 'Health' },
      { path: 'admin/qa', label: 'Quality Assurance' },
      { path: 'admin/readiness', label: 'Readiness' },
      { path: 'ingestion', label: 'Ingestion (ops)' },
      { path: 'ai-operations', label: 'AI Operations (ops)' },
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

export function renderSidebarNav(routeKey, collapsedGroups) {
  const collapsed = collapsedGroups || new Set();
  return SIDE_NAV.map((section) => {
    if (section.path && !section.items) {
      const active = routeKey === section.path || routeKey.startsWith(`${section.path}/`);
      return `<a class="ri-sidebar__link${active ? ' is-active' : ''}" href="#/${section.path}" data-nav-link="${section.path}">${section.label}</a>`;
    }
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
        return `<a class="ri-sidebar__sublink${active ? ' is-active' : ''}" href="${href}" data-nav-link="${key}">${it.label}</a>`;
      })
      .join('');
    return `
      <section class="ri-sidebar__group" data-nav-section="${section.id}">
        <button type="button" class="ri-sidebar__group-btn${childActive ? ' is-active' : ''}" data-nav-collapse="${section.id}" aria-expanded="${open}">
          <span>${section.label}</span><span class="ri-sidebar__caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
        </button>
        <div class="ri-sidebar__children" ${open ? '' : 'hidden'}>${links}</div>
      </section>`;
  }).join('');
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
      handlers.onToggle?.(id, open);
    });
  });
}