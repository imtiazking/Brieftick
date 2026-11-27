/**
 * Persisted Design Lab sidebar mode and section collapse state.
 */

export const NAV_MODE_KEY = 'forgeniq-ri-sidebar-mode';
export const NAV_SECTIONS_KEY = 'forgeniq-ri-sidebar-sections';
export const NAV_MODES = ['expanded', 'collapsed', 'hidden'];

export function readNavMode() {
  try {
    const m = localStorage.getItem(NAV_MODE_KEY);
    return NAV_MODES.includes(m) ? m : 'expanded';
  } catch {
    return 'expanded';
  }
}

export function readWidthMode() {
  const m = readNavMode();
  return m === 'hidden' ? 'expanded' : m;
}

export function writeNavMode(mode) {
  if (!NAV_MODES.includes(mode)) return;
  try {
    localStorage.setItem(NAV_MODE_KEY, mode);
  } catch {
    /* private browsing */
  }
  applyNavMode(mode);
}

export function applyNavMode(mode = readNavMode()) {
  const safe = NAV_MODES.includes(mode) ? mode : 'expanded';
  document.documentElement.dataset.riNavMode = safe;
  const sidebar = document.getElementById('ri-sidebar');
  const toggle = document.getElementById('ri-nav-menu-toggle');
  const widthToggle = document.getElementById('ri-sidebar-width-toggle');
  if (sidebar) {
    sidebar.hidden = safe === 'hidden';
    sidebar.classList.toggle('ri-sidebar--collapsed', safe === 'collapsed');
  }
  if (toggle) {
    toggle.setAttribute('aria-expanded', safe === 'hidden' ? 'false' : 'true');
    toggle.setAttribute(
      'aria-label',
      safe === 'hidden' ? 'Show navigation' : safe === 'collapsed' ? 'Hide navigation (sidebar collapsed)' : 'Hide navigation',
    );
  }
  if (widthToggle) {
    widthToggle.hidden = safe === 'hidden';
    widthToggle.setAttribute(
      'aria-label',
      safe === 'collapsed' ? 'Expand sidebar labels' : 'Collapse sidebar to icons',
    );
    widthToggle.setAttribute('aria-pressed', safe === 'collapsed' ? 'true' : 'false');
  }
}

export function toggleSidebarVisibility() {
  const cur = readNavMode();
  if (cur === 'hidden') {
    const stored = (() => {
      try {
        return localStorage.getItem('forgeniq-ri-sidebar-last-width') || 'expanded';
      } catch {
        return 'expanded';
      }
    })();
    writeNavMode(stored === 'collapsed' ? 'collapsed' : 'expanded');
    return;
  }
  try {
    if (cur === 'expanded' || cur === 'collapsed') {
      localStorage.setItem('forgeniq-ri-sidebar-last-width', cur);
    }
  } catch {
    /* ignore */
  }
  writeNavMode('hidden');
}

export function toggleSidebarWidth() {
  const cur = readNavMode();
  if (cur === 'hidden') {
    writeNavMode('collapsed');
    return;
  }
  writeNavMode(cur === 'collapsed' ? 'expanded' : 'collapsed');
}

export function readCollapsedSectionSet() {
  try {
    const raw = localStorage.getItem(NAV_SECTIONS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function persistSectionCollapse(sectionId, open) {
  const set = readCollapsedSectionSet();
  if (open) set.delete(sectionId);
  else set.add(sectionId);
  try {
    localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}