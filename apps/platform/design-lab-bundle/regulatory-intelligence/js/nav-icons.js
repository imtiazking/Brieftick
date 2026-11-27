/**
 * Inline SVG icons for sidebar navigation (monochrome, currentColor).
 */

const IC = {
  dashboard: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="11" y="2" width="7" height="4" rx="1.5" fill="currentColor" opacity=".85"/><rect x="11" y="9" width="7" height="9" rx="1.5" fill="currentColor" opacity=".7"/><rect x="2" y="12" width="7" height="6" rx="1.5" fill="currentColor" opacity=".85"/></svg>',
  ask: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 1 0 3.2 15.4l2.3 2.3 1.4-1.4-2.1-2.1A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"/><circle cx="10" cy="9" r="2.2" fill="currentColor" opacity=".9"/></svg>',
  horizon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 3 3 16h14L10 3Zm0 3.2 4.1 8.3H5.9L10 6.2Z"/></svg>',
  intelligence: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M4 4h12v3H4V4Zm0 5h8v3H4V9Zm0 5h12v2H4v-2Z"/></svg>',
  risk: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 2 2 17h16L10 2Zm0 4 5.5 9h-11L10 6Z"/><path fill="var(--ri-void,#020204)" d="M10 8v4M10 14.5h.01"/></svg>',
  work: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="5" width="14" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path fill="currentColor" d="M7 5V4a3 3 0 0 1 6 0v1"/></svg>',
  reports: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M5 3h7l4 4v10H5V3Zm7 0v4h4"/></svg>',
  admin: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3" fill="currentColor"/><path fill="currentColor" d="M10 1v2M10 17v2M1 10h2M17 10h2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4" opacity=".8"/></svg>',
  link: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M4 10a4 4 0 0 1 4-4h2v2H8a2 2 0 1 0 0 4h2v2H8a4 4 0 0 1-4-4Zm8-2h2a4 4 0 1 1 0 8h-2v-2h2a2 2 0 1 0 0-4h-2V8Z"/></svg>',
};

export function navIcon(name) {
  return IC[name] || IC.link;
}