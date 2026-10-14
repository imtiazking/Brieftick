import {
  initStore,
  subscribe,
  resetStore,
  setScenario,
  setPublicationApplicability,
  setChangeApplicability,
  updateAssessment,
  updateAction,
  getState,
  triagePublication,
  assignEntity,
  markNotificationRead,
  setDemoUser,
  submitAssessmentForReview,
  approveAssessment,
  recordAiOverride,
  getDemoUser,
  buildNotifications,
  executeMockIngestion,
  executeFixtureConnectorRun,
  executeLiveVerification,
  setLiveVerificationEnabled,
  retryIngestionItem,
  reviewChangeCandidate,
  setConnectorEnabled,
  governanceApproveStep,
  governanceReturnStep,
  governanceCommitteeApprove,
  governanceReviewEvidence,
  governanceCompleteAttestation,
  governanceCloseChange,
  governanceReopenChange,
  governanceVersionImpact,
  aiResolveConflict,
  aiRunReanalysis,
  completeFindingRemediation,
  validateAssuranceFinding,
  completeManagementAttestation,
  finalizeBoardPackReview,
  markAssuranceStaleForChange,
  setCustomerSectorPreferences,
  generatePublicationAiSummary,
  acceptPublicationAiSummary,
  rejectPublicationAiSummary,
  runChangeAnalysis,
  runIaAi,
  runObligationAi,
  acceptWorkflowDraft,
  rejectWorkflowDraft,
  runAskRiQuestion,
  runAskRiComparison,
  runAskRiBoardSummary,
  acceptAskRiBoardSummary,
} from './store.js';
import { LOCAL_AI_BRIDGE_ORIGIN } from './ai/ri-bridge-config.js';
import { LANDSCAPE_SECTOR_NAV } from './landscape-seed.js';
import { mySectorIds } from './landscape-helpers.js';
import { SCENARIOS, MARKET_INTEL_URL, PRODUCT_RI_LABEL, PRODUCT_MI_LABEL, DOCUMENT_TITLE_RI } from './seed-data.js';
import { isWithinForwardDateWindow } from './workflow-helpers.js';
import { renderViewSafe } from './router.js';
import { viewPersistenceRecovery } from './error-views.js';
import { confirmDialog } from './components.js';
import { DEMO_JOURNEYS, getActiveWalkthroughStep, startWalkthrough, stopWalkthrough, advanceWalkthrough } from './demo-journey.js';
import { renderWalkthroughBar } from './demo-views.js';

const NAV_ACTIVE = {
  landscape: ['landscape'],
  changes: ['changes', 'change', 'library', 'publication', 'horizon', 'feed', 'version', 'applicability'],
  work: ['work', 'work-queue', 'notifications'],
  governance: [
    'governance',
    'ai-governance',
    'ask-ri',
    'assurance',
    'risks',
    'risk',
    'controls',
    'control',
    'policies',
    'policy',
    'actions',
    'action',
    'evidence',
    'approval',
    'attestation',
    'exception',
    'control-test',
    'finding',
    'management-attestation',
    'assurance-pack',
  ],
  reports: ['reports', 'board', 'calendar', 'board-pack'],
  operations: ['ingestion', 'ai-operations', 'ai-execution', 'assessments', 'assessment', 'obligations', 'obligation', 'source-document'],
  admin: ['admin', 'demo'],
};

/** Slim horizontal top navigation (Market Intelligence–style). */
const TOP_NAV = [
  { type: 'link', id: 'dashboard', path: 'dashboard', label: 'Dashboard' },
  { type: 'link', id: 'intake', path: 'intake', label: 'Intake' },
  { type: 'landscape-menu', id: 'landscape', label: 'Regulatory Landscape' },
  {
    type: 'menu',
    id: 'changes',
    label: 'Changes',
    items: [
      { path: 'changes', label: 'Regulatory Changes' },
      { path: 'library', label: 'Publications' },
      { path: 'horizon', label: 'Horizon' },
      { path: 'feed', label: 'Regulatory Feed' },
    ],
  },
  {
    type: 'menu',
    id: 'work',
    label: 'Work',
    items: [
      { path: 'work', label: 'Work Queue' },
      { path: 'notifications', label: 'Attention Centre' },
    ],
  },
  {
    type: 'menu',
    id: 'governance',
    label: 'Governance',
    items: [
      { path: 'governance', label: 'Governance' },
      { path: 'ask-ri', label: 'Ask RI' },
      { path: 'ai-governance', label: 'AI Governance' },
      { path: 'assurance', label: 'Assurance' },
      { path: 'risks', label: 'Risks' },
      { path: 'controls', label: 'Controls' },
      { path: 'policies', label: 'Policies' },
      { path: 'actions', label: 'Issues & Actions' },
      { path: 'evidence', label: 'Evidence' },
    ],
  },
  {
    type: 'menu',
    id: 'reports',
    label: 'Reports',
    items: [
      { path: 'reports', label: 'Reports & Audit' },
      { path: 'reports/board', label: 'Board / Executive' },
      { path: 'calendar', label: 'Regulatory Calendar' },
    ],
  },
  {
    type: 'menu',
    id: 'operations',
    label: 'Operations',
    items: [
      { path: 'ingestion', label: 'Ingestion' },
      { path: 'ingestion/live-verification', label: 'Live Verification' },
      { path: 'admin/sources', label: 'Live Regulatory Sources' },
      { path: 'ai-operations', label: 'AI Operations' },
      { path: 'assessments', label: 'Impact Assessments' },
      { path: 'obligations', label: 'Obligations' },
    ],
  },
  {
    type: 'menu',
    id: 'admin',
    label: 'Admin',
    items: [
      { path: 'admin/organisation', label: 'Organisation' },
      { path: 'admin/sources', label: 'Sources' },
      { path: 'admin/platform', label: 'Platform' },
      { path: 'admin/health', label: 'Health' },
      { path: 'admin/readiness', label: 'Readiness' },
      { path: 'demo', label: 'Demo Journeys' },
      { path: 'admin', label: 'Administration' },
    ],
  },
];

function routeMatchesPath(routeKey, path) {
  if (routeKey === path) return true;
  if (routeKey.startsWith(`${path}/`)) return true;
  const top = routeKey.split('/')[0];
  const pathTop = path.split('/')[0];
  return top === pathTop && path === top;
}

function isNavGroupActive(routeKey, groupId) {
  const paths = NAV_ACTIVE[groupId];
  if (!paths) return false;
  const top = routeKey.split('/')[0];
  return paths.some((p) => routeKey === p || routeKey.startsWith(`${p}/`) || top === p);
}

function renderLandscapeNavMenu(menuId) {
  const st = getState();
  const my = new Set(mySectorIds(st));
  const sectorBySlug = new Map((st.sectors || []).map((s) => [s.slug, s]));
  const mySlugs = LANDSCAPE_SECTOR_NAV.filter((n) => {
    const sec = sectorBySlug.get(n.slug);
    return sec && my.has(sec.id);
  });
  const otherSlugs = LANDSCAPE_SECTOR_NAV.filter((n) => {
    const sec = sectorBySlug.get(n.slug);
    return sec && !my.has(sec.id);
  });
  const link = (n) =>
    `<a role="menuitem" class="ri-topnav__menu-link" href="#/landscape/${n.slug}" data-nav-link="landscape/${n.slug}">${n.label}</a>`;
  let inner = '';
  if (mySlugs.length) {
    inner += `<p class="ri-topnav__menu-label" role="presentation">My sectors</p>${mySlugs.map(link).join('')}`;
    inner += `<p class="ri-topnav__menu-label" role="presentation">All sectors</p>`;
  }
  inner += otherSlugs.map(link).join('');
  inner += `<div class="ri-topnav__menu-divider" role="separator"></div>`;
  inner += `<a role="menuitem" class="ri-topnav__menu-link ri-topnav__menu-link--footer" href="#/landscape" data-nav-link="landscape">View all sectors →</a>`;
  return `
    <div class="ri-topnav__dropdown">
      <button type="button" class="ri-topnav__trigger" data-nav-group="landscape" aria-expanded="false" aria-controls="${menuId}" aria-haspopup="true">
        Regulatory Landscape<span class="ri-topnav__caret" aria-hidden="true">▾</span>
      </button>
      <div class="ri-topnav__menu ri-topnav__menu--landscape" id="${menuId}" role="menu" hidden>${inner}</div>
    </div>`;
}

function renderTopNav() {
  return TOP_NAV
    .map((item) => {
      if (item.type === 'landscape-menu') {
        return renderLandscapeNavMenu(`nav-menu-${item.id}`);
      }
      if (item.type === 'link') {
        return `<a class="ri-topnav__link" href="#/${item.path}" data-nav-link="${item.path}">${item.label}</a>`;
      }
      const menuId = `nav-menu-${item.id}`;
      return `
        <div class="ri-topnav__dropdown">
          <button type="button" class="ri-topnav__trigger" data-nav-group="${item.id}" aria-expanded="false" aria-controls="${menuId}" aria-haspopup="true">
            ${item.label}<span class="ri-topnav__caret" aria-hidden="true">▾</span>
          </button>
          <div class="ri-topnav__menu" id="${menuId}" role="menu" hidden>
            ${item.items
              .map(
                (sub) =>
                  `<a role="menuitem" class="ri-topnav__menu-link" href="#/${sub.path}" data-nav-link="${sub.path}">${sub.label}</a>`
              )
              .join('')}
          </div>
        </div>`;
    })
    .join('');
}

function syncNavActive(routeKey) {
  document.querySelectorAll('[data-nav-link]').forEach((el) => {
    const path = el.dataset.navLink || '';
    el.classList.toggle('is-active', routeMatchesPath(routeKey, path));
  });
  document.querySelectorAll('[data-nav-group]').forEach((el) => {
    const id = el.dataset.navGroup || '';
    el.classList.toggle('is-active', isNavGroupActive(routeKey, id));
  });
}

function closeTopNavMenus() {
  document.querySelectorAll('.ri-topnav__menu').forEach((m) => {
    m.hidden = true;
  });
  document.querySelectorAll('.ri-topnav__trigger').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

function getRoute() {
  const hash = location.hash.replace(/^#/, '') || '/dashboard';
  return hash.startsWith('/') ? hash : `/${hash}`;
}

function renderShell() {
  const route = getRoute();
  const routeKey = route.replace(/^\//, '').split('/').filter(Boolean).join('/') || 'dashboard';
  const scenario = getState().scenarioId;
  const demo = getDemoUser();
  const chromeUser = document.getElementById('chrome-demo-user');
  if (chromeUser && demo) chromeUser.textContent = `Demo user: ${demo.name}`;
  const unread = buildNotifications(getState()).filter((n) => !n.read).length;
  const alerts = document.getElementById('chrome-notifications');
  if (alerts) alerts.textContent = unread ? `Alerts (${unread})` : 'Alerts';

  const walk = renderWalkthroughBar(getActiveWalkthroughStep());
  const st = getState();
  let showRecovery = Boolean(st.persistenceRecovery?.usedBaseline);
  try {
    if (showRecovery && sessionStorage.getItem('ri-recovery-dismissed')) showRecovery = false;
  } catch {
    /* non-browser */
  }
  const body = showRecovery ? viewPersistenceRecovery(st.persistenceRecovery.message) : renderViewSafe(route);
  try {
    if (showRecovery) sessionStorage.setItem('ri-recovery-dismissed', '1');
  } catch {
    /* non-browser */
  }
  const scenLabel = SCENARIOS.find((x) => x.id === getState().scenarioId)?.label || getState().scenarioId;
  const scenarioRibbon = `<p class="ri-scenario-ribbon">Viewing scenario: <strong>${scenLabel}</strong></p>`;
  document.getElementById('ri-main').innerHTML = `${scenarioRibbon}${walk}${body}`;
  syncNavActive(routeKey);
  closeTopNavMenus();
  const routeSeg = routeKey.split('/')[0] || 'dashboard';
  document.title = routeSeg === 'dashboard' ? DOCUMENT_TITLE_RI : `${DOCUMENT_TITLE_RI} · ${routeSeg}`;
  bindViewHandlers();
  scrollToSourceHighlight();
}

function scrollToSourceHighlight() {
  const host = document.querySelector('[data-highlight-section]');
  const slug = host?.dataset.highlightSection;
  if (!slug) return;
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-source-section="${slug}"]`);
    if (!el) return;
    document.querySelectorAll('.ri-source-section.is-highlight').forEach((n) => n.classList.remove('is-highlight'));
    el.classList.add('is-highlight');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function renderChrome() {
  const app = document.getElementById('ri-app');
  app.innerHTML = `
    <header class="ri-shell-header">
      <div class="ri-chrome">
        <div class="ri-chrome__left">
          <a class="ri-brand" href="${MARKET_INTEL_URL}">FORGENIQ</a>
          <div class="ri-product-switch">
            <button type="button" class="ri-product-switch__btn" id="product-menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="Current product: ${PRODUCT_RI_LABEL}">
              <span class="ri-product-switch__code">RI</span><span class="ri-product-switch__name">· Regulatory Intelligence</span><span class="ri-product-switch__caret" aria-hidden="true">▾</span>
            </button>
            <div class="ri-product-switch__menu" id="product-menu" hidden role="menu">
              <a href="#/dashboard" class="is-current" role="menuitem"><span class="ri-product-switch__code">RI</span> · Regulatory Intelligence</a>
              <a href="${MARKET_INTEL_URL}" role="menuitem"><span class="ri-product-switch__code">MI</span> · Market Intelligence</a>
            </div>
          </div>
          <span class="ri-lab-pill">Design Lab</span>
        </div>
        <div class="ri-chrome__right">
          <label class="ri-scenario" title="Switch between seeded regulatory-change examples (mock data)">
            <span class="sr-only">Demo scenario</span>
            <span>Demo scenario:</span>
            <select id="scenario-select">
              ${SCENARIOS.map((s) => `<option value="${s.id}"${s.id === getState().scenarioId ? ' selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </label>
          <span class="ri-demo-user" id="chrome-demo-user" title="Current demo user"></span>
          <a class="ri-chrome__link" href="#/notifications" id="chrome-notifications">Alerts</a>
          <a class="ri-chrome__link" href="/design-lab/">Lab home</a>
        </div>
      </div>
      <nav class="ri-topnav" aria-label="Regulatory Intelligence">
        <div class="ri-topnav__inner">${renderTopNav()}</div>
      </nav>
    </header>
    <main class="ri-main" id="ri-main"></main>
    <div class="ri-toast" id="ri-toast" hidden role="status"></div>
    ${confirmDialog('reset-dialog', 'Reset demo environment', 'Restore all Regulatory Intelligence demo data to the presentation-ready baseline? Your in-session changes will be cleared.')}
  `;
}

function showToast(msg) {
  const t = document.getElementById('ri-toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._id);
  showToast._id = setTimeout(() => {
    t.hidden = true;
  }, 2400);
}

function bindChromeHandlers() {
  document.getElementById('product-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('product-menu');
    const btn = document.getElementById('product-menu-btn');
    const open = menu.hidden;
    closeTopNavMenus();
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.ri-topnav__trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById(btn.getAttribute('aria-controls'));
      const wasHidden = menu?.hidden;
      closeTopNavMenus();
      const productMenu = document.getElementById('product-menu');
      if (productMenu) productMenu.hidden = true;
      document.getElementById('product-menu-btn')?.setAttribute('aria-expanded', 'false');
      if (menu && wasHidden) {
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ri-product-switch')) {
      const menu = document.getElementById('product-menu');
      if (menu) menu.hidden = true;
      document.getElementById('product-menu-btn')?.setAttribute('aria-expanded', 'false');
    }
    if (!e.target.closest('.ri-topnav__dropdown')) {
      closeTopNavMenus();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTopNavMenus();
      const menu = document.getElementById('product-menu');
      if (menu) menu.hidden = true;
      document.getElementById('product-menu-btn')?.setAttribute('aria-expanded', 'false');
    }
  });
  document.getElementById('scenario-select')?.addEventListener('change', (e) => {
    setScenario(e.target.value);
    showToast(`Scenario: ${e.target.selectedOptions[0].text} (filter applied where relevant)`);
    renderShell();
  });
  document.getElementById('reset-dialog')?.addEventListener('close', (e) => {
    if (e.target.returnValue === 'confirm') {
      resetStore();
      showToast('Demo environment reset');
      renderShell();
    }
  });
}

function bindViewHandlers() {
  document.querySelector('[data-retry-view]')?.addEventListener('click', () => renderShell());
  document.querySelectorAll('[data-start-demo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.startDemo;
      const j = DEMO_JOURNEYS[id];
      if (!j) return;
      stopWalkthrough();
      setScenario(j.scenarioId);
      location.hash = j.startHref;
      showToast(`${j.title} demo started`);
    });
  });
  document.querySelectorAll('[data-start-guided]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.startGuided;
      const j = DEMO_JOURNEYS[id];
      if (!j) return;
      startWalkthrough(id);
      setScenario(j.scenarioId);
      location.hash = j.walkthrough[0].next;
    });
  });
  document.querySelector('[data-walkthrough-dismiss]')?.addEventListener('click', stopWalkthrough);
  document.querySelector('[data-walkthrough-end]')?.addEventListener('click', () => {
    stopWalkthrough();
    renderShell();
  });
  document.querySelector('[data-walkthrough-next]')?.addEventListener('click', () => {
    const next = advanceWalkthrough();
    if (next?.next) location.hash = next.next.replace(/^#/, '');
    else renderShell();
  });
  document.querySelectorAll('[data-why-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('[data-ai-box]')?.querySelector('[data-why-panel]');
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  document.querySelectorAll('[data-change-applicability]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('[data-change-id]');
      const changeId = wrap?.dataset.changeId;
      if (!changeId) return;
      const decision = btn.dataset.changeApplicability;
      setChangeApplicability(changeId, decision, `Prototype decision: ${decision}`, 'Sarah Jones');
      showToast(`Change applicability: ${decision}`);
      renderShell();
    });
  });

  document.querySelectorAll('[data-applicability]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.getElementById('applicability-form');
      const pubId = form?.dataset.pubId;
      if (!pubId) return;
      const j = form.justification?.value || 'Accepted FORGENIQ AI recommendation (DEMO)';
      const map = {
        accept: 'Applicable',
        'override-applicable': 'Applicable',
        'override-possible': 'Possibly Applicable',
        'override-na': 'Not Applicable',
      };
      setPublicationApplicability(pubId, map[btn.dataset.applicability], j, 'Sarah Jones');
      showToast('Publication applicability decision saved');
      location.hash = `#/publication/${pubId}/applicability`;
    });
  });

  document.querySelectorAll('[data-ia-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('[data-assessment-id]');
      const id = wrap?.dataset.assessmentId;
      if (!id) return;
      const act = btn.dataset.iaAction;
      if (act === 'review') {
        submitAssessmentForReview(id);
        showToast('Submitted for review');
      } else if (act === 'approve') {
        const r = approveAssessment(id, 'approve', 'Approved for implementation (DEMO)');
        if (r?.error) showToast(r.error);
        else showToast('Assessment approved');
      } else if (act === 'reject') {
        approveAssessment(id, 'reject', 'Rejected (DEMO)');
        showToast('Assessment rejected');
      } else if (act === 'back') {
        approveAssessment(id, 'return', 'Returned for changes (DEMO)');
        showToast('Returned for changes');
      } else if (act === 'draft') {
        updateAssessment(id, { status: 'Draft' }, getDemoUser()?.name, 'Assessment draft saved');
        showToast('Draft saved');
      }
      renderShell();
    });
  });

  document.querySelector('[data-save-action-status]')?.addEventListener('click', () => {
    const sel = document.getElementById('action-status');
    const id = sel?.dataset.actionId;
    if (id && sel) {
      updateAction(id, { status: sel.value }, 'Sarah Jones');
      showToast('Action status updated');
      renderShell();
    }
  });

  document.getElementById('admin-reset')?.addEventListener('click', () => {
    document.getElementById('reset-dialog')?.showModal();
  });

  document.querySelectorAll('[data-proto-toast]').forEach((el) => {
    el.addEventListener('click', () => showToast('Prototype only — no live integration'));
  });

  document.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => showToast(`Mock ${btn.dataset.export} export (DEMO)`));
  });

  const feedSearch = document.getElementById('feed-search');
  if (feedSearch) {
    feedSearch.addEventListener('input', () => {
      const q = feedSearch.value.toLowerCase();
      document.querySelectorAll('[data-feed-item]').forEach((card) => {
        const text = (card.dataset.search || '').toLowerCase();
        const pri = document.getElementById('feed-filter-priority')?.value || '';
        const reg = document.getElementById('feed-filter-reg')?.value || '';
        const match =
          (!q || text.includes(q)) &&
          (!pri || card.dataset.priority === pri) &&
          (!reg || card.dataset.regulator === reg);
        card.hidden = !match;
      });
    });
    document.querySelectorAll('[data-filter-feed]').forEach((sel) => {
      sel.addEventListener('change', () => feedSearch.dispatchEvent(new Event('input')));
    });
  }

  document.querySelectorAll('[data-triage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pubId = btn.closest('[data-intake-pub]')?.dataset.intakePub;
      if (!pubId) return;
      triagePublication(pubId, btn.dataset.triage, { user: getDemoUser()?.name });
      showToast('Triage updated');
      renderShell();
    });
  });

  document.querySelector('[data-intake-assign]')?.addEventListener('click', () => {
    const pubId = document.querySelector('[data-intake-pub]')?.dataset.intakePub;
    const assigneeId = document.getElementById('intake-assignee')?.value;
    const due = document.getElementById('intake-due')?.value;
    if (pubId) {
      assignEntity('Publication', pubId, { assigneeId, dueDate: due }, getDemoUser()?.name);
      showToast('Reviewer assigned');
      renderShell();
    }
  });

  document.getElementById('landscape-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = encodeURIComponent(e.target.value.trim());
      location.hash = q ? `#/landscape/search/${q}` : '#/landscape';
    }
  });
  document.getElementById('my-sectors-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const ids = [...document.querySelectorAll('[data-my-sector]:checked')].map((el) => el.dataset.mySector);
    setCustomerSectorPreferences(ids);
    showToast('My sectors updated');
    renderShell();
  });

  document.getElementById('intake-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('[data-intake-row]').forEach((row) => {
      const text = row.dataset.search || '';
      row.hidden = q && !text.toLowerCase().includes(q);
    });
  });

  document.querySelectorAll('[data-intake-filter]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const reg = document.querySelector('[data-intake-filter="regulator"]')?.value;
      const st = document.querySelector('[data-intake-filter="status"]')?.value;
      const pri = document.querySelector('[data-intake-filter="priority"]')?.value;
      const typ = document.querySelector('[data-intake-filter="type"]')?.value;
      document.querySelectorAll('[data-intake-row]').forEach((row) => {
        row.hidden =
          (reg && row.dataset.regulator !== reg) ||
          (st && row.dataset.status !== st) ||
          (pri && row.dataset.priority !== pri) ||
          (typ && row.dataset.type !== typ);
      });
    });
  });

  document.getElementById('save-demo-user')?.addEventListener('click', () => {
    const id = document.getElementById('demo-user-select')?.value;
    if (id) {
      setDemoUser(id);
      showToast('Demo user updated');
      renderShell();
    }
  });

  document.querySelectorAll('[data-mark-read]').forEach((btn) => {
    btn.addEventListener('click', () => {
      markNotificationRead(btn.dataset.markRead);
      renderShell();
    });
  });

  document.querySelector('[data-save-action-assign]')?.addEventListener('click', () => {
    const wrap = document.querySelector('[data-action-assign]');
    const id = wrap?.dataset.actionAssign;
    const ownerId = wrap?.querySelector('[data-action-owner]')?.value;
    const due = wrap?.querySelector('[data-action-due]')?.value;
    if (id) {
      updateAction(id, { ownerId, dueDate: due }, getDemoUser()?.name);
      showToast('Action assignment saved');
      renderShell();
    }
  });

  document.getElementById('work-view')?.addEventListener('change', (e) => {
    const v = e.target.value;
    document.querySelectorAll('[data-work-row]').forEach((row) => {
      let show = true;
      if (v === 'my') show = row.dataset.viewMy === '1';
      if (v === 'my-team') show = row.dataset.viewTeam === '1';
      if (v === 'overdue') show = row.dataset.sla === 'Overdue';
      if (v === 'due-soon') show = row.dataset.sla === 'Due Soon';
      if (v === 'approval') show = (row.dataset.status || '').includes('Review') || (row.dataset.status || '').includes('Approval') || (row.dataset.status || '').includes('Pending');
      if (v === 'governance') {
        const et = row.dataset.entity || '';
        show = ['Governance Approval', 'Attestation', 'Governance Exception', 'Evidence'].includes(et) || (row.dataset.status || '').includes('Pending');
      }
      if (v === 'attestations') show = row.dataset.entity === 'Attestation' || row.dataset.entity === 'Management Attestation';
      if (v === 'exceptions') show = row.dataset.entity === 'Governance Exception';
      if (v === 'assurance') show = (row.dataset.category || '').includes('Assurance') || row.dataset.entity === 'Assurance Review';
      if (v === 'findings') show = row.dataset.entity === 'Assurance Finding' || (row.dataset.category || '').includes('Finding');
      if (v === 'validation') show = row.dataset.entity === 'Finding Validation';
      row.hidden = !show;
    });
  });

  document.getElementById('horizon-window')?.addEventListener('change', (e) => {
    const days = Number(e.target.value) || 90;
    let visible = 0;
    document.querySelectorAll('[data-horizon-item]').forEach((li) => {
      const dates = (li.dataset.horizonDates || '').split(',').filter(Boolean);
      const show = dates.some((d) => isWithinForwardDateWindow(d, days));
      li.hidden = !show;
      if (show) visible += 1;
    });
    const count = document.getElementById('horizon-window-count');
    if (count) count.textContent = `${visible} publication(s) with dates in the next ${days} days`;
  });

  document.getElementById('cal-window')?.addEventListener('change', (e) => {
    const days = Number(e.target.value) || 90;
    let visible = 0;
    document.querySelectorAll('[data-cal-item]').forEach((li) => {
      const show = isWithinForwardDateWindow(li.dataset.calDate, days);
      li.hidden = !show;
      if (show) visible += 1;
    });
    const count = document.getElementById('cal-window-count');
    if (count) count.textContent = `${visible} event(s) in the next ${days} days`;
  });

  document.querySelector('[data-ai-override-save]')?.addEventListener('click', () => {
    const changeId = document.querySelector('[data-ai-override-form]')?.dataset.changeId;
    const decision = document.getElementById('ai-override-decision')?.value;
    const justification = document.getElementById('ai-override-justification')?.value || 'Human override (DEMO)';
    const ch = getState().changes.find((c) => c.id === changeId);
    if (changeId && ch) {
      recordAiOverride('Regulatory Change', changeId, {
        aiRecommendation: ch.applicabilityRecommendation,
        humanDecision: decision,
        justification,
      });
      showToast('AI recommendation override recorded');
      renderShell();
    }
  });

  document.querySelectorAll('.ri-row-link[data-href]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      location.hash = row.dataset.href.replace(/^#/, '');
    });
  });

  document.querySelector('[data-run-mock-ingestion]')?.addEventListener('click', () => {
    const r = executeMockIngestion();
    showToast(r.ok ? `Mock ingestion run ${r.runId} completed` : r.error || 'Ingestion failed');
    renderShell();
  });

  document.querySelector('[data-run-fixture-fca]')?.addEventListener('click', async () => {
    const r = await executeFixtureConnectorRun('CONN-FCA-001');
    showToast(r.ok ? `Fixture connector run ${r.runId} completed` : r.error || 'Connector run failed');
    renderShell();
  });

  document.querySelector('[data-live-verify-fca]')?.addEventListener('click', async () => {
    if (!window.confirm('This performs a small read-only request against the official FCA publications RSS feed (max 3 items). Continue?')) return;
    const r = await executeLiveVerification('CONN-FCA-001');
    showToast(r.ok ? `Live verification run ${r.runId} staged` : r.error || r.code || 'Live verification failed');
    renderShell();
  });

  document.querySelector('[data-toggle-live-verify]')?.addEventListener('click', () => {
    const s = getState();
    setLiveVerificationEnabled(!s.platformConfig?.allowLiveRegulatoryVerification);
    showToast('Live verification setting updated (Design Lab only)');
    renderShell();
  });

  document.querySelectorAll('[data-retry-raw]').forEach((btn) => {
    btn.addEventListener('click', () => {
      retryIngestionItem(btn.dataset.retryRaw);
      showToast('Retry processing completed');
      renderShell();
    });
  });

  document.querySelectorAll('[data-toggle-connector]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setConnectorEnabled(btn.dataset.toggleConnector, btn.dataset.enabled === '1');
      showToast('Connector updated');
      renderShell();
    });
  });

  document.querySelectorAll('[data-accept-candidate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      reviewChangeCandidate(btn.dataset.acceptCandidate, 'accept');
      showToast('Candidate accepted — Regulatory Change created');
      renderShell();
    });
  });

  document.querySelectorAll('[data-modify-candidate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const justification = window.prompt('Modification justification (DEMO):', 'Narrowed scope after compliance review') || 'Modified (DEMO)';
      reviewChangeCandidate(btn.dataset.modifyCandidate, 'modify', { justification, title: null, description: null });
      showToast('Candidate accepted with modification');
      renderShell();
    });
  });

  document.querySelector('[data-gov-approve-step]')?.addEventListener('click', () => {
    const wrap = document.querySelector('[data-approval-chain]');
    const r = governanceApproveStep(wrap?.dataset.approvalChain, wrap?.dataset.approvalStep, 'Approved (DEMO)');
    showToast(r.ok ? 'Approval recorded' : r.error || 'Blocked');
    renderShell();
  });
  document.querySelector('[data-gov-return-step]')?.addEventListener('click', () => {
    const wrap = document.querySelector('[data-approval-chain]');
    governanceReturnStep(wrap?.dataset.approvalChain, wrap?.dataset.approvalStep, 'Returned for changes (DEMO)');
    showToast('Returned for changes');
    renderShell();
  });
  document.querySelectorAll('[data-committee-approve]').forEach((btn) => {
    btn.addEventListener('click', () => {
      governanceCommitteeApprove(btn.dataset.committeeApprove, 'Committee approved with actions (DEMO)');
      showToast('Committee decision recorded');
      renderShell();
    });
  });
  document.querySelectorAll('[data-evidence-accept]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('[data-evidence-id]')?.dataset.evidenceId;
      const r = governanceReviewEvidence(id, 'accept', 'Independent review complete (DEMO)');
      showToast(r.ok ? 'Evidence accepted' : r.error || 'Review blocked');
      renderShell();
    });
  });
  document.querySelectorAll('[data-evidence-reject]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('[data-evidence-id]')?.dataset.evidenceId;
      governanceReviewEvidence(id, 'reject', 'Rejected (DEMO)');
      showToast('Evidence rejected');
      renderShell();
    });
  });
  document.querySelectorAll('[data-complete-attestation]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = governanceCompleteAttestation(btn.dataset.completeAttestation, 'Formal attestation (DEMO)');
      showToast(r.ok ? 'Attestation completed' : r.error || 'Attestation blocked');
      renderShell();
    });
  });
  document.querySelector('[data-close-change]')?.addEventListener('click', () => {
    const id = document.querySelector('[data-close-change]')?.dataset.closeChange;
    const r = governanceCloseChange(id, 'Closure approved (DEMO)');
    if (!r.ok) showToast(r.error || 'Closure blocked — see checklist');
    else showToast('Regulatory Change closed');
    renderShell();
  });
  document.querySelector('[data-reopen-change]')?.addEventListener('click', () => {
    const id = document.querySelector('[data-reopen-change]')?.dataset.reopenChange;
    governanceReopenChange(id, 'Reopened for source update review (DEMO)');
    showToast('Change reopened');
    renderShell();
  });
  document.querySelector('[data-version-impact="material"]')?.addEventListener('click', () => {
    governanceVersionImpact('PUB-001', 'Material update — reapproval required', 'Effective date and monitoring wording changed (DEMO)');
    showToast('Version impact review recorded');
    renderShell();
  });
  document.querySelector('[data-version-impact="minor"]')?.addEventListener('click', () => {
    governanceVersionImpact('PUB-001', 'Minor update — no reapproval', 'Clarification only — no implementation change (DEMO)');
    showToast('Version impact review recorded');
    renderShell();
  });

  document.querySelectorAll('[data-resolve-conflict]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-resolve-conflict');
      aiResolveConflict(id, 'Follow transitional timing per PRA SS4/26 (DEMO)');
      showToast('Source conflict resolution recorded');
      renderShell();
    });
  });
  document.querySelectorAll('[data-run-reanalysis]').forEach((btn) => {
    btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-run-reanalysis');
    const r = aiRunReanalysis(id);
    showToast(r.ok ? `Re-analysis created: ${r.analysisId}` : r.error || 'Re-analysis blocked');
    if (r.ok && r.analysisId) location.hash = `#/ai-analysis/${r.analysisId}`;
    else renderShell();
    });
  });

  document.querySelectorAll('[data-finding-remediation]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-finding-remediation');
      const r = completeFindingRemediation(id, 'Remediation completed (DEMO)');
      showToast(r.ok ? 'Remediation marked complete — validation required' : r.error || 'Failed');
      renderShell();
    });
  });
  document.querySelectorAll('[data-finding-validate-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-finding-validate-btn');
      const comments = document.querySelector(`[data-finding-validate="${id}"] textarea`)?.value || '';
      const r = validateAssuranceFinding(id, comments);
      showToast(r.ok ? 'Finding validated and closed' : r.error || 'Validation blocked');
      renderShell();
    });
  });
  document.querySelectorAll('[data-mgmt-attest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = completeManagementAttestation(btn.getAttribute('data-mgmt-attest'));
      showToast(r.ok ? 'Management attestation recorded (mock)' : r.error || 'Failed');
      renderShell();
    });
  });
  document.querySelectorAll('[data-board-pack-finalize]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = finalizeBoardPackReview(btn.getAttribute('data-board-pack-finalize'), 'Board pack reviewed (DEMO)');
      showToast(r.ok ? 'Board pack marked Final' : r.error || 'Failed');
      renderShell();
    });
  });
  document.querySelectorAll('[data-mark-assurance-stale]').forEach((btn) => {
    btn.addEventListener('click', () => {
    const id = btn.dataset.changeId || 'CHG-001';
    markAssuranceStaleForChange(id, 'Source update — assurance refresh required (DEMO)');
    showToast('Assurance marked stale');
    renderShell();
    });
  });

  document.querySelectorAll('[data-reject-candidate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      reviewChangeCandidate(btn.dataset.rejectCandidate, 'reject', { justification: 'Not material to firm profile (DEMO)' });
      showToast('Candidate rejected');
      renderShell();
    });
  });

  document.querySelectorAll('[data-ai-summary-generate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pubId = btn.dataset.pubId;
      btn.disabled = true;
      const res = await generatePublicationAiSummary(pubId, { live: false });
      btn.disabled = false;
      showToast(res.ok ? 'AI Summary generated (AI FIXTURE)' : res.code || res.message || 'Generation failed');
      renderShell();
    });
  });
  document.querySelectorAll('[data-ai-summary-generate-live]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pubId = btn.dataset.pubId;
      btn.disabled = true;
      const res = await generatePublicationAiSummary(pubId, { live: true });
      btn.disabled = false;
      showToast(
        res.ok ? 'AI Summary generated (AI LIVE)' : res.code === 'NOT_CONFIGURED' ? 'AI NOT CONFIGURED' : res.code || 'Failed'
      );
      renderShell();
    });
  });
  document.querySelectorAll('[data-ai-summary-accept]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = acceptPublicationAiSummary(btn.dataset.analysisId, 'Accepted in Design Lab');
      showToast(r.ok ? 'AI Summary accepted' : r.code || 'Denied');
      renderShell();
    });
  });
  document.querySelectorAll('[data-ai-summary-reject]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = rejectPublicationAiSummary(btn.dataset.analysisId, 'Rejected in Design Lab');
      showToast(r.ok ? 'AI Summary rejected' : r.code || 'Denied');
      renderShell();
    });
  });

  document.querySelectorAll('[data-ai-change-analyse]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await runChangeAnalysis(btn.dataset.pubId);
      btn.disabled = false;
      showToast(res.ok ? 'Change analysis generated (AI FIXTURE)' : res.code || 'Failed');
      renderShell();
    });
  });
  document.querySelectorAll('[data-ai-ia-generate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await runIaAi(btn.dataset.changeId);
      btn.disabled = false;
      showToast(res.ok ? 'IA draft assist generated' : res.code || 'Failed');
      renderShell();
    });
  });
  document.querySelectorAll('[data-ai-obl-generate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await runObligationAi(btn.dataset.assessmentId);
      btn.disabled = false;
      showToast(res.ok ? 'Obligation suggestions generated' : res.code || 'Failed');
      renderShell();
    });
  });
  document.querySelectorAll('[data-ai-wf-accept]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const res = acceptWorkflowDraft(btn.dataset.analysisId, btn.dataset.wfKind);
      showToast(res.ok ? 'Draft record created' : res.code || 'Denied');
      renderShell();
    });
  });
  document.querySelectorAll('[data-ai-wf-reject]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const res = rejectWorkflowDraft(btn.dataset.analysisId);
      showToast(res.ok ? 'Suggestion rejected' : res.code || 'Denied');
      renderShell();
    });
  });

  document.querySelector('[data-ask-ri-submit]')?.addEventListener('click', async () => {
    const q = document.getElementById('ask-ri-input')?.value?.trim();
    if (!q) return;
    const res = await runAskRiQuestion(q);
    showToast(res.insufficient ? 'INSUFFICIENT RI EVIDENCE' : res.ok ? 'Ask RI complete' : res.code || 'Failed');
    renderShell();
  });
  document.querySelectorAll('[data-ask-ri-suggest]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const q = btn.textContent?.trim();
      const input = document.getElementById('ask-ri-input');
      if (input) input.value = q;
      const res = await runAskRiQuestion(q);
      showToast(res.insufficient ? 'INSUFFICIENT RI EVIDENCE' : res.ok ? 'Ask RI complete' : res.code || 'Failed');
      renderShell();
    });
  });
  document.querySelector('[data-ask-ri-compare]')?.addEventListener('click', async () => {
    const res = await runAskRiComparison();
    showToast(res.ok ? 'Comparison complete' : res.code || 'Failed');
    renderShell();
  });
  document.querySelector('[data-ask-ri-board]')?.addEventListener('click', async () => {
    const res = await runAskRiBoardSummary();
    showToast(res.ok ? 'Board summary draft generated' : res.code || 'Failed');
    renderShell();
  });
  document.querySelector('[data-ask-ri-board-accept]')?.addEventListener('click', () => {
    const res = acceptAskRiBoardSummary(document.querySelector('[data-ask-ri-board-accept]')?.dataset.analysisId);
    showToast(res.ok ? 'Summary marked reviewed' : res.code || 'Denied');
    renderShell();
  });

  const adminAi = document.querySelector('[data-admin-ai-panel]');
  if (adminAi) {
    fetch(`${LOCAL_AI_BRIDGE_ORIGIN}/health`)
      .then((res) => res.json())
      .then((h) => {
        const bridgeStatus = document.querySelector('[data-admin-ai-bridge-status]');
        const modeEl = document.querySelector('[data-admin-ai-mode]');
        const providerEl = document.querySelector('[data-admin-ai-provider]');
        const modelEl = document.querySelector('[data-admin-ai-model]');
        const cacheEl = document.querySelector('[data-admin-ai-cache]');
        const mode =
          h.modelConfigured && h.status === 'READY'
            ? 'LIVE'
            : h.status === 'NOT_CONFIGURED'
              ? 'NOT CONFIGURED'
              : 'ERROR';
        if (bridgeStatus) bridgeStatus.textContent = h.status || 'UNKNOWN';
        if (modeEl) modeEl.textContent = mode;
        if (providerEl) providerEl.textContent = h.provider || '—';
        if (modelEl) modelEl.textContent = h.modelConfigured ? 'CONFIGURED' : 'NOT CONFIGURED';
        if (cacheEl) cacheEl.textContent = h.cacheEnabled ? 'ENABLED' : 'DISABLED';
      })
      .catch(() => {
        const bridgeStatus = document.querySelector('[data-admin-ai-bridge-status]');
        const modeEl = document.querySelector('[data-admin-ai-mode]');
        if (bridgeStatus) bridgeStatus.textContent = 'UNAVAILABLE';
        if (modeEl) modeEl.textContent = 'ERROR';
      });
  }
}

function init() {
  initStore();
  renderChrome();
  bindChromeHandlers();
  subscribe(() => renderShell());
  window.addEventListener('hashchange', renderShell);
  if (!location.hash) location.hash = '#/dashboard';
  renderShell();
}

init();
