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
  getChange,
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
  setAskRiDraft,
  runAskRiComparison,
  runAskRiBoardSummary,
  acceptAskRiBoardSummary,
  applyAskRiSessionRestore,
  notify,
  getViewPublications,
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
import {
  isConnectedBackendActive,
  isConnectedModeIntent,
  isConnectedLabWritesEnabled,
  isPresentationModeRequested,
  shouldAutoConnectToBackend,
  shouldHideDemoRegulatoryData,
  syncEnvironmentFooterBanner,
  exitPresentationMode,
} from './platform/connected-mode.js';
import { formatConnectedSessionChromeLabel } from './platform/connectivity-gate.js';
import { libraryPublicationSearchText } from './platform/connected-display.js';
import {
  markConnectedNotificationRead,
  getConnectedNotificationsUnreadCount,
} from './platform/connected-notifications.js';
import { patchConnectedIntakeTriage } from './platform/connected-intake-writes.js';
import { createConnectedRegulatoryChange, patchConnectedChange } from './platform/connected-change-writes.js';
import {
  createConnectedPolicy,
  patchConnectedPolicy,
  createConnectedFinding,
} from './platform/connected-policy-panels.js';
import { patchConnectedFinding } from './platform/connected-finding-writes.js';
import {
  fetchConnectedAiAnalysisRun,
  submitConnectedAiReview,
  renderConnectedAiRunDetail,
} from './platform/connected-ai-governance-panels.js';
import {
  fetchConnectedWorkflowEvents,
  renderConnectedWorkflowEventsApiTable,
} from './platform/connected-audit.js';
import {
  fetchConnectedTenantWork,
  renderConnectedDashboardMyWork,
} from './platform/connected-tenant-work.js';
import {
  createConnectedImpactAssessment,
  patchConnectedImpactAssessment,
  createConnectedObligation,
  patchConnectedObligation,
  postConnectedLink,
  patchConnectedRisk,
  createConnectedRisk,
  patchConnectedControl,
  createConnectedControl,
  createConnectedAction,
  patchConnectedAction,
  createConnectedEvidence,
  patchConnectedPublicationApplicability,
  patchConnectedApplicabilityWorkflow,
  uploadConnectedEvidenceFile,
  fetchConnectedEvidenceDownloadUrl,
  fetchConnectedGovernancePending,
  createConnectedAssuranceReview,
} from './platform/connected-work-writes.js';
import { collectConnectedActionPatchFields } from './platform/connected-action-patch-fields.js';
import {
  fetchConnectedBoardReport,
  fetchConnectedExecutiveReport,
  renderConnectedExecutiveReport,
} from './platform/connected-reporting.js';
import { renderConnectedGovernancePendingPanel } from './platform/connected-governance-pending-panels.js';
import {
  ensureConnectedCatalogueLoaded,
  loadConnectedCatalogue,
  fetchConnectedPublicationDetail,
  fetchConnectedChangeDetail,
  fetchConnectedAssessmentDetail,
  fetchConnectedObligationDetail,
  fetchConnectedRiskDetail,
  fetchConnectedControlDetail,
  fetchConnectedIngestionRunDetail,
  scheduleConnectedPublicationDetailFetch,
  scheduleConnectedChangeDetailFetch,
  scheduleConnectedAssessmentDetailFetch,
  scheduleConnectedObligationDetailFetch,
  scheduleConnectedRiskDetailFetch,
  scheduleConnectedControlDetailFetch,
  scheduleConnectedActionDetailFetch,
  scheduleConnectedEvidenceDetailFetch,
  scheduleConnectedIngestionRunDetailFetch,
  initConnectedCatalogueState,
} from './platform/connected-catalogue.js';
import { scheduleConnectedEntityWorkflowEventsFetch } from './platform/connected-entity-audit.js';
import { ensureConnectedLandscapeLoaded } from './platform/connected-landscape.js';
import {
  activateConnectedBackend,
  bootstrapLabConnectivity,
  disconnectConnectedBackend,
  refreshLabOrganisationContext,
  setActiveOrganisation,
} from './platform/lab-connectivity.js';

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
    'issues',
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
      { path: 'issues', label: 'Issues & Actions' },
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
  const stConn = getState();
  const unread = isConnectedBackendActive(stConn)
    ? getConnectedNotificationsUnreadCount(getState())
    : buildNotifications(getState()).filter((n) => !n.read).length;
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
  const connectedRibbon = isConnectedBackendActive(stConn);
  const connectedIntent = isConnectedModeIntent(stConn);
  const scenLabel = SCENARIOS.find((x) => x.id === stConn.scenarioId)?.label || stConn.scenarioId;
  let scenarioRibbon;
  if (connectedRibbon) {
    scenarioRibbon = `<p class="ri-scenario-ribbon ri-scenario-ribbon--connected">Connected catalogue · presentation scenarios not applied</p>`;
  } else if (connectedIntent && shouldHideDemoRegulatoryData(stConn)) {
    const sub =
      stConn.connectivity?.mode === 'connecting'
        ? 'Restoring FORGENIQ backend session…'
        : stConn.connectivity?.mode === 'auth_required'
          ? 'Sign in to load live tenant data — presentation fixtures are hidden'
          : 'Backend unavailable — presentation fixtures are hidden until you reconnect';
    scenarioRibbon = `<p class="ri-scenario-ribbon ri-scenario-ribbon--connected">${sub}</p>`;
  } else if (isPresentationModeRequested()) {
    scenarioRibbon = `<p class="ri-scenario-ribbon">Presentation scenario: <strong>${scenLabel}</strong> · fictional data</p>`;
  } else {
    scenarioRibbon = '';
  }
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

function renderChromeScenarioControls() {
  const st = getState();
  if (isConnectedBackendActive(st)) {
    return '<span class="ri-chrome__connected-hint" title="Connected mode uses tenant-scoped staging APIs">Connected catalogue</span>';
  }
  if (isPresentationModeRequested()) {
    return `<label class="ri-scenario" title="Presentation scenarios — fictional data only">
            <span class="sr-only">Presentation scenario</span>
            <span>Scenario:</span>
            <select id="scenario-select">
              ${SCENARIOS.map((s) => `<option value="${s.id}"${s.id === getState().scenarioId ? ' selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </label>`;
  }
  return '<span class="ri-chrome__connected-hint" title="Sign in to load live tenant data">Live tenant data</span>';
}

function renderChromeUserSlot() {
  const st = getState();
  if (isConnectedBackendActive(st)) {
    const label = formatConnectedSessionChromeLabel(st);
    const text = label?.text || 'Connected session';
    const title = label?.title || 'Authenticated FORGENIQ session';
    return `<span class="ri-chrome__session" id="chrome-demo-user" title="${title.replace(/"/g, '&quot;')}">${text}</span>`;
  }
  if (isPresentationModeRequested()) {
    const demo = getDemoUser();
    return `<span class="ri-demo-user" id="chrome-demo-user" title="Presentation persona (not Clerk)">Demo user: ${demo?.name || '—'}</span>`;
  }
  if (st.connectivity?.mode === 'auth_required') {
    return `<a class="ri-chrome__link" id="chrome-demo-user" href="/sign-in">Sign in</a>`;
  }
  const label = formatConnectedSessionChromeLabel(st);
  if (label) {
    return `<span class="ri-chrome__session" id="chrome-demo-user" title="${label.title.replace(/"/g, '&quot;')}">${label.text}</span>`;
  }
  return `<span class="ri-demo-user" id="chrome-demo-user" title="Connecting to FORGENIQ">Connecting…</span>`;
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
          <span class="ri-lab-pill" id="ri-mode-pill">Design Lab</span>
        </div>
        <div class="ri-chrome__right">
          ${renderChromeScenarioControls()}
          ${renderChromeUserSlot()}
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
    ${confirmDialog('reset-dialog', 'Reset presentation environment', 'Restore all Regulatory Intelligence presentation data to the baseline? Your in-session changes will be cleared.')}
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

function askRiSubmitToast(res) {
  if (res.code === 'ask_ri_in_flight') return 'Ask RI is already processing';
  if (res.authError) return 'Authentication or permission required';
  if (res.technicalError) return 'Technical evidence retrieval error';
  if (res.backendError) return 'Ask RI server error';
  if (res.insufficient) return 'INSUFFICIENT RI EVIDENCE';
  if (res.ok) return 'Ask RI complete';
  return res.code || 'Failed';
}

function closeCreateChangePublicationMenus(exceptCombobox = null) {
  document.querySelectorAll('[data-create-change-pub-combobox]').forEach((box) => {
    if (exceptCombobox && box === exceptCombobox) return;
    const menu = box.querySelector('[data-create-change-pub-menu]');
    const trigger = box.querySelector('[data-create-change-pub-trigger]');
    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

function applyCreateChangePublicationFilter(searchInput) {
  const combobox = searchInput.closest('[data-create-change-pub-combobox]');
  if (!combobox) return;
  const listEl = combobox.querySelector('[data-create-change-publication-list]');
  const emptyEl = combobox.querySelector('[data-create-change-publication-empty]');
  const countEl = combobox.querySelector('[data-create-change-publication-count]');
  const q = searchInput.value.trim().toLowerCase();
  const options = listEl ? [...listEl.querySelectorAll('[data-create-change-pub-option]')] : [];
  let visible = 0;
  options.forEach((btn) => {
    const hay = (btn.dataset.search || btn.textContent || '').toLowerCase();
    const match = !q || hay.includes(q);
    btn.hidden = !match;
    if (match) visible += 1;
  });
  if (emptyEl) emptyEl.hidden = !(q.length > 0 && visible === 0);
  if (countEl) {
    countEl.textContent = q
      ? `${visible} of ${options.length} publication(s) match “${searchInput.value.trim()}”`
      : `${options.length} publication${options.length === 1 ? '' : 's'} — type to filter`;
  }
}

function selectCreateChangePublicationOption(btn) {
  const combobox = btn.closest('[data-create-change-pub-combobox]');
  if (!combobox) return;
  const panel = btn.closest('[data-connected-create-change]');
  const hidden = combobox.querySelector('[data-create-change-publication]');
  const selectedEl = panel?.querySelector('[data-create-change-publication-selected]');
  const triggerLabel = combobox.querySelector('[data-create-change-pub-trigger-label]');
  const pubId = btn.dataset.pubId || '';
  const label = btn.textContent?.trim() || pubId;
  if (hidden) hidden.value = pubId;
  if (triggerLabel) triggerLabel.textContent = pubId ? label : 'Select publication…';
  if (selectedEl) {
    selectedEl.hidden = !pubId;
    selectedEl.textContent = pubId ? `Selected publication: ${label}` : '';
  }
  closeCreateChangePublicationMenus();
  showToast('Publication selected');
}

function initCreateChangePublicationComboboxHandlers() {
  if (window.__riCreateChangePubUiBound) return;
  window.__riCreateChangePubUiBound = true;

  document.addEventListener('click', (e) => {
    const option = e.target.closest('[data-create-change-pub-option]');
    if (option) {
      e.preventDefault();
      selectCreateChangePublicationOption(option);
      return;
    }
    const trigger = e.target.closest('[data-create-change-pub-trigger]');
    if (trigger) {
      e.preventDefault();
      const combobox = trigger.closest('[data-create-change-pub-combobox]');
      const menu = combobox?.querySelector('[data-create-change-pub-menu]');
      if (!menu) return;
      const open = menu.hidden;
      closeCreateChangePublicationMenus(combobox);
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) {
        const search = menu.querySelector('[data-create-change-publication-search]');
        search?.focus();
        if (search) applyCreateChangePublicationFilter(search);
      }
      return;
    }
    if (!e.target.closest('[data-create-change-pub-combobox]')) {
      closeCreateChangePublicationMenus();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-create-change-publication-search]')) {
      applyCreateChangePublicationFilter(e.target);
    }
  });
}

function bindViewHandlers() {
  const route = getRoute();
  const pubDetailMatch = route.match(/^\/(?:publication|intake)\/([^/]+)/);
  if (pubDetailMatch && isConnectedBackendActive()) {
    scheduleConnectedPublicationDetailFetch(getState(), pubDetailMatch[1])
      ?.then(() => renderShell())
      .catch(() => {});
  }

  const changeDetailMatch = route.match(/^\/change\/([^/]+)/);
  if (changeDetailMatch && isConnectedBackendActive()) {
    const changeId = changeDetailMatch[1];
    scheduleConnectedEntityWorkflowEventsFetch(getState(), 'regulatory_change', changeId)
      ?.then(() => renderShell())
      .catch(() => {});
    scheduleConnectedChangeDetailFetch(getState(), changeId)
      ?.then(() => renderShell())
      .catch((err) => {
        telemetry.app('error', 'Connected change detail load failed', {
          changeId,
          message: err?.message,
        });
        renderShell();
      });
  }

  const assessmentDetailMatch = route.match(/^\/assessment\/([^/]+)/);
  if (assessmentDetailMatch && isConnectedBackendActive()) {
    const assessmentId = assessmentDetailMatch[1];
    scheduleConnectedEntityWorkflowEventsFetch(getState(), 'impact_assessment', assessmentId)
      ?.then(() => renderShell())
      .catch(() => {});
    scheduleConnectedAssessmentDetailFetch(getState(), assessmentId)
      ?.then(() => renderShell())
      .catch(() => {});
  }

  const obligationDetailMatch = route.match(/^\/obligation\/([^/]+)/);
  if (obligationDetailMatch && isConnectedBackendActive()) {
    const obligationId = obligationDetailMatch[1];
    scheduleConnectedEntityWorkflowEventsFetch(getState(), 'regulatory_obligation', obligationId)
      ?.then(() => renderShell())
      .catch(() => {});
    scheduleConnectedObligationDetailFetch(getState(), obligationId)
      ?.then(() => renderShell())
      .catch(() => {});
  }

  const riskDetailMatch = route.match(/^\/risk\/([^/]+)/);
  if (riskDetailMatch && isConnectedBackendActive()) {
    const riskId = riskDetailMatch[1];
    scheduleConnectedEntityWorkflowEventsFetch(getState(), 'risk', riskId)
      ?.then(() => renderShell())
      .catch(() => {});
    scheduleConnectedRiskDetailFetch(getState(), riskId)
      ?.then(() => renderShell())
      .catch(() => {});
  }

  const controlDetailMatch = route.match(/^\/control\/([^/]+)/);
  if (controlDetailMatch && isConnectedBackendActive()) {
    const controlId = controlDetailMatch[1];
    scheduleConnectedEntityWorkflowEventsFetch(getState(), 'control', controlId)
      ?.then(() => renderShell())
      .catch(() => {});
    scheduleConnectedControlDetailFetch(getState(), controlId)
      ?.then(() => renderShell())
      .catch(() => {});
  }

  const actionDetailMatch = route.match(/^\/action\/([^/]+)/);
  if (actionDetailMatch && isConnectedBackendActive()) {
    const actionId = actionDetailMatch[1];
    scheduleConnectedEntityWorkflowEventsFetch(getState(), 'action', actionId)
      ?.then(() => renderShell())
      .catch(() => {});
    scheduleConnectedActionDetailFetch(getState(), actionId)
      ?.then(() => renderShell())
      .catch(() => {});
  }

  const evidenceDetailMatch = route.match(/^\/evidence\/([^/]+)/);
  if (evidenceDetailMatch && isConnectedBackendActive()) {
    scheduleConnectedEvidenceDetailFetch(getState(), evidenceDetailMatch[1])
      ?.then(() => renderShell())
      .catch(() => {});
  }

  const ingestionRunMatch = route.match(/^\/ingestion\/run\/([^/]+)/);
  if (ingestionRunMatch && isConnectedBackendActive()) {
    scheduleConnectedIngestionRunDetailFetch(getState(), ingestionRunMatch[1])
      ?.then(() => renderShell())
      .catch(() => {});
  }

  const connectPanel = document.querySelector('[data-ri-connect-backend]');
  if (connectPanel && !getState().connectivity?._orgContextLoaded) {
    const st = getState();
    st.connectivity = { ...(st.connectivity || {}), _orgContextLoaded: true };
    refreshLabOrganisationContext(st).then(() => renderShell());
  }

  document.querySelector('[data-ri-apply-org]')?.addEventListener('click', async () => {
    const sel = document.querySelector('[data-ri-select-org]');
    const organisationId = sel?.value?.trim();
    if (!organisationId) {
      showToast('Select an organisation first');
      return;
    }
    try {
      await setActiveOrganisation(organisationId);
      await refreshLabOrganisationContext(getState());
      showToast('Active organisation set');
      renderShell();
    } catch (e) {
      showToast(e?.message || 'Could not set organisation');
    }
  });

  connectPanel?.addEventListener('click', async () => {
    const res = await bootstrapLabConnectivity(getState());
    if (res.mode === 'connected') showToast('Connected to FORGENIQ backend');
    else showToast(getState().connectivity?.error || 'Backend connection failed');
    renderChrome();
    bindChromeHandlers();
    syncModeChrome();
    renderShell();
  });
  document.querySelector('[data-ri-reconnect-backend]')?.addEventListener('click', async () => {
    const res = await bootstrapLabConnectivity(getState());
    if (res.mode === 'connected') showToast('Reconnected to FORGENIQ backend');
    else showToast(getState().connectivity?.error || 'Reconnection failed');
    renderChrome();
    bindChromeHandlers();
    syncModeChrome();
    renderShell();
  });
  document.querySelector('[data-ri-disconnect-backend]')?.addEventListener('click', async () => {
    await disconnectConnectedBackend(getState());
    showToast('Presentation mode enabled — fictional data only');
    renderChrome();
    bindChromeHandlers();
    syncModeChrome();
    renderShell();
  });
  document.querySelector('[data-ri-enter-presentation]')?.addEventListener('click', async () => {
    await disconnectConnectedBackend(getState());
    showToast('Presentation mode enabled');
    renderChrome();
    bindChromeHandlers();
    syncModeChrome();
    renderShell();
  });
  document.querySelector('[data-ri-exit-presentation]')?.addEventListener('click', () => {
    exitPresentationMode();
  });
  document.querySelectorAll('[data-ri-retry-bootstrap]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      showToast('Retrying connection…');
      await bootstrapLabConnectivity(getState());
      renderChrome();
      bindChromeHandlers();
      syncModeChrome();
      renderShell();
      btn.disabled = false;
    });
  });
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

  document.querySelectorAll('[data-connected-change-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const changeId = btn.dataset.changeId;
      const status = btn.dataset.connectedChangeStatus;
      if (!changeId || !status) return;
      btn.disabled = true;
      try {
        await patchConnectedChange(getState(), changeId, {
          status,
          expectedUpdatedAt: btn.dataset.expectedUpdatedAt || null,
        });
        showToast(`Change status updated to ${status.replace(/_/g, ' ').toLowerCase()}`);
        renderShell();
      } catch (e) {
        showToast(e?.message || 'Status update failed');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-connected-change-assign]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const changeId = btn.dataset.changeId;
      const panel = btn.closest('[data-connected-change-owner-panel]');
      const ownerUserId = panel?.querySelector('[data-connected-change-owner-select]')?.value?.trim();
      if (!changeId || !ownerUserId) {
        showToast('Select a member to assign');
        return;
      }
      btn.disabled = true;
      try {
        await patchConnectedChange(getState(), changeId, {
          ownerUserId,
          expectedUpdatedAt: btn.dataset.expectedUpdatedAt || null,
        });
        showToast('Change owner assigned');
        renderShell();
      } catch (e) {
        showToast(e?.message || 'Assignment failed');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-connected-change-metadata-save]').forEach((btn) => {
    if (!btn.dataset.riBoundMetadataSave) btn.dataset.riBoundMetadataSave = '1';
  });

  document.querySelectorAll('[data-connected-create-impact]').forEach((btn) => {
    if (btn.dataset.riBoundCreateImpact) return;
    btn.dataset.riBoundCreateImpact = '1';
    btn.addEventListener('click', async () => {
      const changeId = btn.dataset.changeId;
      if (!changeId) return;
      btn.disabled = true;
      try {
        const assessment = await createConnectedImpactAssessment(getState(), changeId);
        showToast('Impact assessment created');
        if (assessment?.id) location.hash = `#/assessment/${assessment.id}`;
        else renderShell();
      } catch (e) {
        showToast(e?.message || 'Create impact assessment failed');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-connected-impact-save]').forEach((btn) => {
    if (btn.dataset.riBoundImpactSave) return;
    btn.dataset.riBoundImpactSave = '1';
    btn.addEventListener('click', async () => {
      const assessmentId = btn.dataset.assessmentId;
      const panel = btn.closest('[data-connected-impact-panel]');
      if (!assessmentId || !panel) return;
      const fields = {};
      panel.querySelectorAll('[data-connected-impact-field]').forEach((el) => {
        fields[el.dataset.connectedImpactField] = el.value;
      });
      btn.disabled = true;
      try {
        await patchConnectedImpactAssessment(getState(), assessmentId, fields, btn.dataset.expectedUpdatedAt || null);
        showToast('Assessment saved');
        renderShell();
      } catch (e) {
        showToast(e?.message || 'Save failed');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-connected-impact-action]').forEach((btn) => {
    if (btn.dataset.riBoundImpactAction) return;
    btn.dataset.riBoundImpactAction = '1';
    btn.addEventListener('click', async () => {
      const assessmentId = btn.dataset.assessmentId;
      const action = btn.dataset.connectedImpactAction;
      if (!assessmentId || !action) return;
      btn.disabled = true;
      try {
        await patchConnectedImpactAssessment(
          getState(),
          assessmentId,
          { action },
          btn.dataset.expectedUpdatedAt || null,
        );
        showToast(`Assessment ${action}`);
        renderShell();
      } catch (e) {
        showToast(e?.message || 'Workflow action failed');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-connected-impact-assign]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const assessmentId = btn.dataset.assessmentId;
      const panel = btn.closest('[data-connected-impact-panel]');
      const owner = panel?.querySelector('[data-connected-impact-owner-select]')?.value?.trim();
      if (!assessmentId || !owner) {
        showToast('Select owner');
        return;
      }
      btn.disabled = true;
      try {
        await patchConnectedImpactAssessment(getState(), assessmentId, { owner_user_id: owner }, btn.dataset.expectedUpdatedAt || null);
        showToast('Owner assigned');
        renderShell();
      } catch (e) {
        showToast(e?.message || 'Assign failed');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('button[data-connected-create-obligation]').forEach((btn) => {
    if (btn.dataset.riBoundCreateObligation) return;
    btn.dataset.riBoundCreateObligation = '1';
    btn.addEventListener('click', async () => {
      const changeId = btn.dataset.changeId;
      const panel =
        document.querySelector(`section[data-connected-create-obligation="${changeId}"]`) ||
        btn.closest('section.ri-panel');
      const statement = panel?.querySelector('[data-connected-obligation-create-statement]')?.value?.trim();
      if (!changeId || !statement) {
        showToast('Statement required');
        return;
      }
      btn.disabled = true;
      try {
        const obl = await createConnectedObligation(getState(), {
          regulatoryChangeId: changeId,
          obligationStatement: statement,
          citation: panel?.querySelector('[data-connected-obligation-create-citation]')?.value?.trim() || null,
          dueDate: panel?.querySelector('[data-connected-obligation-create-due]')?.value || null,
        });
        showToast('Obligation created');
        if (obl?.id) location.hash = `#/obligation/${obl.id}`;
        else renderShell();
      } catch (e) {
        showToast(e?.message || 'Create failed');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-connected-obligation-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.obligationId;
      const panel = btn.closest('[data-connected-obligation-panel]');
      if (!id || !panel) return;
      const fields = {};
      panel.querySelectorAll('[data-connected-obligation-field]').forEach((el) => {
        fields[el.dataset.connectedObligationField] = el.value;
      });
      btn.disabled = true;
      try {
        await patchConnectedObligation(getState(), id, fields, btn.dataset.expectedUpdatedAt || null);
        showToast('Obligation saved');
        renderShell();
      } catch (e) {
        showToast(e?.message || 'Save failed');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-connected-obligation-assign]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.obligationId;
      const panel = btn.closest('[data-connected-obligation-panel]');
      const owner = panel?.querySelector('[data-connected-obligation-owner-select]')?.value?.trim();
      if (!id || !owner) {
        showToast('Select owner');
        return;
      }
      btn.disabled = true;
      try {
        await patchConnectedObligation(getState(), id, { owner_user_id: owner }, btn.dataset.expectedUpdatedAt || null);
        showToast('Owner assigned');
        renderShell();
      } catch (e) {
        showToast(e?.message || 'Assign failed');
        btn.disabled = false;
      }
    });
  });

  const riskCreateBtn = document.querySelector('[data-connected-create-risk-btn]');
  if (riskCreateBtn && !riskCreateBtn.dataset.riBoundCreateRisk) {
    riskCreateBtn.dataset.riBoundCreateRisk = '1';
    riskCreateBtn.addEventListener('click', async (btnEv) => {
    const panel = document.querySelector('[data-connected-create-risk]');
    const title = panel?.querySelector('[data-connected-risk-create-title]')?.value?.trim();
    if (!title) {
      showToast('Title required');
      return;
    }
    const payload = {
      title,
      description: panel?.querySelector('[data-connected-risk-create-description]')?.value?.trim() || undefined,
      category: panel?.querySelector('[data-connected-risk-create-category]')?.value?.trim() || undefined,
      inherent_risk: panel?.querySelector('[data-connected-risk-create-inherent]')?.value?.trim() || undefined,
      residual_risk: panel?.querySelector('[data-connected-risk-create-residual]')?.value?.trim() || undefined,
      review_date: panel?.querySelector('[data-connected-risk-create-review]')?.value || undefined,
      creationMode: panel?.querySelector('[data-connected-risk-create-mode]')?.value || 'operational',
    };
    btnEv.target.disabled = true;
    try {
      const risk = await createConnectedRisk(getState(), payload);
      showToast('Risk created');
      if (risk?.id) location.hash = `#/risk/${risk.id}`;
      else renderShell();
    } catch (e) {
      showToast(e?.message || 'Create failed');
      btnEv.target.disabled = false;
    }
  });
  }

  const actionCreateBtn = document.querySelector('[data-connected-create-action-btn]');
  if (actionCreateBtn && !actionCreateBtn.dataset.riBoundCreateAction) {
    actionCreateBtn.dataset.riBoundCreateAction = '1';
    actionCreateBtn.addEventListener('click', async (btnEv) => {
      const panel = document.querySelector('[data-connected-create-action]');
      const title = panel?.querySelector('[data-connected-action-create-title]')?.value?.trim();
      if (!title) {
        showToast('Title required');
        return;
      }
      const obligationId = panel?.querySelector('[data-connected-action-create-obligation]')?.value?.trim() || undefined;
      const riskId = panel?.querySelector('[data-connected-action-create-risk]')?.value?.trim() || undefined;
      const controlId = panel?.querySelector('[data-connected-action-create-control]')?.value?.trim() || undefined;
      const ownerUserId = panel?.querySelector('[data-connected-action-create-owner]')?.value?.trim() || undefined;
      if (panel && !panel.dataset.createIdempotencyKey) {
        panel.dataset.createIdempotencyKey =
          typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idem-${Date.now()}`;
      }
      const payload = {
        title,
        description: panel?.querySelector('[data-connected-action-create-description]')?.value?.trim() || undefined,
        priority: panel?.querySelector('[data-connected-action-create-priority]')?.value?.trim() || undefined,
        due_date: panel?.querySelector('[data-connected-action-create-due]')?.value || undefined,
        creationMode: panel?.querySelector('[data-connected-action-create-mode]')?.value || 'uat_authorised',
        obligationId: obligationId || undefined,
        riskId: riskId || undefined,
        controlId: controlId || undefined,
        owner_user_id: ownerUserId || undefined,
        idempotency_key: panel?.dataset.createIdempotencyKey || undefined,
      };
      btnEv.target.disabled = true;
      try {
        const action = await createConnectedAction(getState(), payload);
        const shortId = action?.id ? `${action.id.slice(0, 8)}…` : '';
        showToast(action?.id ? `Action created · ${shortId} (${action.id})` : 'Action created');
        if (action?.id) location.hash = `#/action/${action.id}`;
        else renderShell();
      } catch (e) {
        showToast(e?.message || 'Create failed');
        btnEv.target.disabled = false;
      }
    });
  }

  const controlCreateBtn = document.querySelector('[data-connected-create-control-btn]');
  if (controlCreateBtn && !controlCreateBtn.dataset.riBoundCreateControl) {
    controlCreateBtn.dataset.riBoundCreateControl = '1';
    controlCreateBtn.addEventListener('click', async (btnEv) => {
    const panel = document.querySelector('[data-connected-create-control]');
    const name = panel?.querySelector('[data-connected-control-create-name]')?.value?.trim();
    if (!name) {
      showToast('Name required');
      return;
    }
    const payload = {
      name,
      description: panel?.querySelector('[data-connected-control-create-description]')?.value?.trim() || undefined,
      control_type: panel?.querySelector('[data-connected-control-create-type]')?.value?.trim() || undefined,
      frequency: panel?.querySelector('[data-connected-control-create-frequency]')?.value?.trim() || undefined,
      effectiveness: panel?.querySelector('[data-connected-control-create-effectiveness]')?.value?.trim() || undefined,
      testing_status: panel?.querySelector('[data-connected-control-create-testing]')?.value?.trim() || undefined,
      creationMode: panel?.querySelector('[data-connected-control-create-mode]')?.value || 'operational',
    };
    btnEv.target.disabled = true;
    try {
      const control = await createConnectedControl(getState(), payload);
      showToast('Control created');
      if (control?.id) location.hash = `#/control/${control.id}`;
      else renderShell();
    } catch (e) {
      showToast(e?.message || 'Create failed');
      btnEv.target.disabled = false;
    }
  });
  }

  const btnEvCreate = document.querySelector('[data-connected-create-evidence]');
  if (btnEvCreate && !btnEvCreate.dataset.riBoundCreateEvidence) {
    btnEvCreate.dataset.riBoundCreateEvidence = '1';
    btnEvCreate.addEventListener('click', async (btnEv) => {
    const panel = document.querySelector('[data-connected-evidence-create]');
    const title = panel?.querySelector('[data-connected-evidence-title]')?.value?.trim();
    const evidenceType = panel?.querySelector('[data-connected-evidence-type]')?.value?.trim();
    if (!title || !evidenceType) {
      showToast('Title and type required');
      return;
    }
    btnEv.target.disabled = true;
    try {
      const ev = await createConnectedEvidence(getState(), {
        title,
        evidenceType,
        description: panel?.querySelector('[data-connected-evidence-description]')?.value?.trim() || null,
        sourceHash: panel?.querySelector('[data-connected-evidence-hash]')?.value?.trim() || null,
      });
      showToast('Evidence registered');
      if (ev?.id) location.hash = `#/evidence/${ev.id}`;
      else renderShell();
    } catch (e) {
      showToast(e?.message || 'Create failed');
      btnEv.target.disabled = false;
    }
    });
  }

  const boardLoad = document.querySelector('[data-connected-board-report-load]');
  if (boardLoad && !boardLoad.dataset.loading) {
    boardLoad.dataset.loading = '1';
    fetchConnectedBoardReport(getState())
      .then((body) => {
        const cat = initConnectedCatalogueState(getState());
        cat.boardReport = body;
        renderShell();
      })
      .catch((e) => {
        boardLoad.textContent = e?.message || 'Board report unavailable';
      });
  }

  const execLoad = document.querySelector('[data-connected-executive-report-load]');
  if (execLoad && !execLoad.dataset.loading) {
    execLoad.dataset.loading = '1';
    fetchConnectedExecutiveReport(getState())
      .then((body) => {
        execLoad.outerHTML = renderConnectedExecutiveReport(body);
      })
      .catch((e) => {
        execLoad.textContent = e?.message || 'Executive report unavailable';
      });
  }

  document.querySelector('[data-connected-reporting-refresh]')?.addEventListener('click', () => {
    renderShell();
  });

  const govPendingLoad = document.querySelector('[data-connected-governance-pending-load]');
  if (govPendingLoad && !govPendingLoad.dataset.loading) {
    govPendingLoad.dataset.loading = '1';
    fetchConnectedGovernancePending(getState())
      .then((pending) => {
        govPendingLoad.outerHTML = renderConnectedGovernancePendingPanel(pending);
        bindConnectedGovernancePendingActions();
      })
      .catch((e) => {
        govPendingLoad.textContent = e?.message || 'Pending queue unavailable';
      });
  }

  const aiRunDetail = document.querySelector('[data-connected-ai-run-detail]');
  if (aiRunDetail && !aiRunDetail.dataset.loading) {
    const runId = aiRunDetail.getAttribute('data-connected-ai-run-detail');
    aiRunDetail.dataset.loading = '1';
    fetchConnectedAiAnalysisRun(getState(), runId)
      .then((body) => {
        aiRunDetail.outerHTML = renderConnectedAiRunDetail(body);
      })
      .catch((e) => {
        aiRunDetail.textContent = e?.message || 'Could not load AI run detail';
      });
  }

  const auditLoad = document.querySelector('[data-connected-audit-load]');
  if (auditLoad && !auditLoad.dataset.loading) {
    auditLoad.dataset.loading = '1';
    fetchConnectedWorkflowEvents(getState())
      .then((body) => {
        auditLoad.outerHTML = renderConnectedWorkflowEventsApiTable(
          body.events,
          'No workflow events for this organisation',
        );
      })
      .catch((e) => {
        auditLoad.textContent = e?.message || 'Audit events unavailable';
      });
  }

  const dashWorkLoad = document.querySelector('[data-connected-dashboard-work-load]');
  if (dashWorkLoad && !dashWorkLoad.dataset.loading) {
    dashWorkLoad.dataset.loading = '1';
    const userId = getState().platformConfig?.backendSession?.userId;
    fetchConnectedTenantWork(getState())
      .then((body) => {
        dashWorkLoad.outerHTML = renderConnectedDashboardMyWork(body, userId);
      })
      .catch((e) => {
        dashWorkLoad.textContent = e?.message || 'Tenant work unavailable';
      });
  }

  function bindConnectedGovernancePendingActions() {
    document.querySelectorAll('[data-governance-impact-approve]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.impactId;
        btn.disabled = true;
        try {
          await patchConnectedImpactAssessment(getState(), id, { action: 'approve' });
          showToast('Impact approved');
          renderShell();
        } catch (e) {
          showToast(e?.message || 'Approve failed');
          btn.disabled = false;
        }
      });
    });
    document.querySelectorAll('[data-governance-impact-reject]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.impactId;
        btn.disabled = true;
        try {
          await patchConnectedImpactAssessment(getState(), id, { action: 'reject' });
          showToast('Impact rejected');
          renderShell();
        } catch (e) {
          showToast(e?.message || 'Reject failed');
          btn.disabled = false;
        }
      });
    });
    document.querySelectorAll('[data-governance-applicability-approve]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.assessmentId;
        btn.disabled = true;
        try {
          await patchConnectedApplicabilityWorkflow(getState(), id, { action: 'approve' });
          showToast('Applicability approved');
          renderShell();
        } catch (e) {
          showToast(e?.message || 'Approve failed');
          btn.disabled = false;
        }
      });
    });
    document.querySelectorAll('[data-governance-applicability-reject]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.assessmentId;
        btn.disabled = true;
        try {
          await patchConnectedApplicabilityWorkflow(getState(), id, {
            action: 'reject',
            decisionComments: 'Rejected from governance queue',
          });
          showToast('Applicability rejected');
          renderShell();
        } catch (e) {
          showToast(e?.message || 'Reject failed');
          btn.disabled = false;
        }
      });
    });
  }

  document.querySelector('[data-connected-create-assurance-review]')?.addEventListener('click', async () => {
    const panel = document.querySelector('[data-connected-assurance-create]');
    const reviewType = panel?.querySelector('[data-connected-assurance-type]')?.value?.trim();
    const result = panel?.querySelector('[data-connected-assurance-result]')?.value;
    const notes = panel?.querySelector('[data-connected-assurance-notes]')?.value?.trim();
    const controlId = panel?.querySelector('[data-connected-assurance-control-id]')?.value?.trim();
    if (!reviewType) {
      showToast('Review type required');
      return;
    }
    const btn = panel.querySelector('[data-connected-create-assurance-review]');
    if (btn) btn.disabled = true;
    try {
      await createConnectedAssuranceReview(getState(), { review_type: reviewType, result, notes, controlId });
      showToast('Assurance review created');
      renderShell();
    } catch (e) {
      showToast(e?.message || 'Create failed');
      if (btn) btn.disabled = false;
    }
  });

  document.querySelectorAll('[data-connected-evidence-upload]').forEach((btn) => {
    if (btn.dataset.riBoundEvidenceUpload) return;
    btn.dataset.riBoundEvidenceUpload = '1';
    btn.addEventListener('click', async () => {
      const evidenceId = btn.dataset.evidenceId;
      const panel =
        (evidenceId && document.querySelector(`[data-connected-evidence-upload-panel="${evidenceId}"]`)) ||
        btn.closest('[data-connected-evidence-upload-panel]');
      const input = panel?.querySelector('[data-connected-evidence-file]');
      const file = input?.files?.[0];
      if (!evidenceId || !file) {
        showToast('Select a file first');
        return;
      }
      btn.disabled = true;
      try {
        await uploadConnectedEvidenceFile(getState(), evidenceId, file);
        showToast('Evidence file uploaded');
        renderShell();
      } catch (e) {
        showToast(e?.message || 'Upload failed');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-connected-evidence-download]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const evidenceId = btn.dataset.evidenceId;
      if (!evidenceId) return;
      try {
        const body = await fetchConnectedEvidenceDownloadUrl(getState(), evidenceId);
        showToast(`Download link (${body.expiresIn}s TTL)`);
        window.open(body.signedUrl, '_blank', 'noopener,noreferrer');
      } catch (e) {
        showToast(e?.message || 'Download unavailable');
      }
    });
  });

  document.querySelector('[data-connected-applicability-save]')?.addEventListener('click', async (btnEv) => {
    const btn = btnEv.currentTarget;
    const publicationId = btn.dataset.publicationId;
    const recommendation = document.querySelector('[data-connected-applicability-recommendation]')?.value;
    const rationale = document.querySelector('[data-connected-applicability-rationale]')?.value?.trim();
    btn.disabled = true;
    try {
      await patchConnectedPublicationApplicability(getState(), publicationId, {
        assessmentId: btn.dataset.assessmentId || null,
        recommendation,
        rationale,
        expectedUpdatedAt: btn.dataset.expectedUpdatedAt || null,
      });
      await fetchConnectedPublicationDetail(getState(), publicationId);
      showToast('Applicability draft saved');
      renderShell();
    } catch (e) {
      showToast(e?.message || 'Save failed');
      btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-applicability-submit]')?.addEventListener('click', async (btnEv) => {
    const btn = btnEv.currentTarget;
    const assessmentId = btn.dataset.assessmentId;
    if (!assessmentId) {
      showToast('Save a draft assessment first');
      return;
    }
    btn.disabled = true;
    try {
      await patchConnectedApplicabilityWorkflow(getState(), assessmentId, {
        action: 'submit',
        expectedUpdatedAt: btn.dataset.expectedUpdatedAt || null,
      });
      showToast('Submitted for approval');
      renderShell();
    } catch (e) {
      showToast(e?.message || 'Submit failed');
      btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-applicability-approve]')?.addEventListener('click', async (btnEv) => {
    const btn = btnEv.currentTarget;
    const assessmentId = btn.dataset.assessmentId;
    const decisionComments = document.querySelector('[data-connected-applicability-decision-comments]')?.value?.trim();
    btn.disabled = true;
    try {
      await patchConnectedApplicabilityWorkflow(getState(), assessmentId, {
        action: 'approve',
        decisionComments,
        expectedUpdatedAt: btn.dataset.expectedUpdatedAt || null,
      });
      showToast('Applicability approved');
      renderShell();
    } catch (e) {
      showToast(e?.message || 'Approve failed');
      btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-applicability-reject]')?.addEventListener('click', async (btnEv) => {
    const btn = btnEv.currentTarget;
    const assessmentId = btn.dataset.assessmentId;
    const decisionComments = document.querySelector('[data-connected-applicability-decision-comments]')?.value?.trim();
    btn.disabled = true;
    try {
      await patchConnectedApplicabilityWorkflow(getState(), assessmentId, {
        action: 'reject',
        decisionComments,
        expectedUpdatedAt: btn.dataset.expectedUpdatedAt || null,
      });
      showToast('Applicability rejected');
      renderShell();
    } catch (e) {
      showToast(e?.message || 'Reject failed');
      btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-create-change-submit]')?.addEventListener('click', async () => {
    const panel = document.querySelector('[data-connected-create-change]');
    const publicationId =
      panel?.querySelector('[data-create-change-publication]')?.value?.trim() ||
      panel?.querySelector('select[data-create-change-publication]')?.value?.trim();
    const title = panel?.querySelector('[data-create-change-title]')?.value?.trim();
    const changeType = panel?.querySelector('[data-create-change-type]')?.value?.trim() || 'Policy update';
    const creationMode =
      panel?.querySelector('[data-create-change-mode]:checked')?.value?.trim() || 'operational';
    if (!publicationId || !title) {
      showToast('Publication and title are required');
      return;
    }
    const btn = panel.querySelector('[data-connected-create-change-submit]');
    if (btn) btn.disabled = true;
    try {
      const change = await createConnectedRegulatoryChange(getState(), {
        publicationId,
        title,
        changeType,
        status: 'OPEN',
        creationMode,
      });
      try {
        await fetchConnectedChangeDetail(getState(), change.id);
      } catch {
        /* detail hydrate best-effort */
      }
      showToast('Regulatory change registered');
      location.hash = `#/change/${change.id}`;
    } catch (e) {
      showToast(e?.message || 'Could not register change');
      if (btn) btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-policy-submit]')?.addEventListener('click', async () => {
    const name = document.querySelector('[data-connected-policy-name]')?.value?.trim();
    const version = document.querySelector('[data-connected-policy-version]')?.value?.trim() || '1.0';
    if (!name) {
      showToast('Policy name is required');
      return;
    }
    const btn = document.querySelector('[data-connected-policy-submit]');
    if (btn) btn.disabled = true;
    try {
      const body = await createConnectedPolicy(getState(), { name, version, status: 'DRAFT' });
      showToast('Policy created');
      location.hash = `#/policy/${body.policy.id}`;
    } catch (e) {
      showToast(e?.message || 'Policy create failed');
      if (btn) btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-policy-save]')?.addEventListener('click', async () => {
    const panel = document.querySelector('[data-connected-policy-edit]');
    const policyId = panel?.dataset.connectedPolicyEdit;
    if (!policyId) return;
    const name = panel.querySelector('[data-connected-policy-edit-name]')?.value?.trim();
    const status = panel.querySelector('[data-connected-policy-edit-status]')?.value?.trim();
    const nextReviewDate = panel.querySelector('[data-connected-policy-edit-review]')?.value || null;
    const btn = panel.querySelector('[data-connected-policy-save]');
    if (btn) btn.disabled = true;
    try {
      await patchConnectedPolicy(getState(), policyId, { name, status, nextReviewDate });
      showToast('Policy saved');
      renderShell();
    } catch (e) {
      showToast(e?.message || 'Policy update failed');
      if (btn) btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-finding-submit]')?.addEventListener('click', async () => {
    const title = document.querySelector('[data-connected-finding-title]')?.value?.trim();
    const severity = document.querySelector('[data-connected-finding-severity]')?.value || 'MEDIUM';
    if (!title) {
      showToast('Finding title is required');
      return;
    }
    const btn = document.querySelector('[data-connected-finding-submit]');
    if (btn) btn.disabled = true;
    try {
      const body = await createConnectedFinding(getState(), { title, severity, status: 'OPEN' });
      showToast('Finding created');
      location.hash = `#/finding/${body.finding.id}`;
    } catch (e) {
      showToast(e?.message || 'Finding create failed');
      if (btn) btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-finding-status-save]')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const findingId = btn.dataset.findingId;
    const panel = btn.closest('[data-connected-finding-workflow]');
    const status = panel?.querySelector('[data-connected-finding-status-select]')?.value;
    if (!findingId || !status) return;
    btn.disabled = true;
    try {
      await patchConnectedFinding(getState(), findingId, { status });
      showToast('Finding updated');
      renderShell();
    } catch (e) {
      showToast(e?.message || 'Finding update failed');
      btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-ai-review-submit]')?.addEventListener('click', async () => {
    const panel = document.querySelector('[data-connected-ai-review]');
    const runId = panel?.getAttribute('data-connected-ai-review');
    const decision = panel?.querySelector('[data-connected-ai-review-decision]')?.value;
    const notes = panel?.querySelector('[data-connected-ai-review-notes]')?.value?.trim();
    if (!runId || !decision) return;
    const btn = panel.querySelector('[data-connected-ai-review-submit]');
    if (btn) btn.disabled = true;
    try {
      await submitConnectedAiReview(getState(), runId, { decision, notes, acceptedClaimIndexes: [], rejectedClaimIndexes: [] });
      showToast('AI review recorded');
      renderShell();
    } catch (e) {
      showToast(e?.message || 'AI review failed');
      if (btn) btn.disabled = false;
    }
  });

  document.querySelector('[data-connected-intake-create-change-submit]')?.addEventListener('click', async () => {
    const wrap = document.querySelector('[data-connected-intake-create-change]');
    const publicationId = wrap?.getAttribute('data-connected-intake-create-change');
    const title = wrap?.querySelector('[data-intake-change-title]')?.value?.trim();
    if (!publicationId || !title) {
      showToast('Title is required');
      return;
    }
    const btn = wrap?.querySelector('[data-connected-intake-create-change-submit]');
    if (btn) btn.disabled = true;
    try {
      const change = await createConnectedRegulatoryChange(getState(), {
        publicationId,
        title,
        changeType: 'Intake progression',
        status: 'OPEN',
        creationMode: 'operational',
      });
      showToast('Regulatory change registered');
      location.hash = `#/change/${change.id}`;
    } catch (e) {
      showToast(e?.message || 'Could not register change');
      if (btn) btn.disabled = false;
    }
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
    btn.addEventListener('click', () => {
      if (isConnectedBackendActive(getState())) {
        showToast('Use Board or Executive connected reports for real exports.');
        return;
      }
      showToast(`Mock ${btn.dataset.export} export (DEMO)`);
    });
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
    btn.addEventListener('click', async () => {
      const pubId = btn.closest('[data-intake-pub]')?.dataset.intakePub;
      if (!pubId) return;
      if (btn.dataset.connectedTriage && isConnectedBackendActive(getState())) {
        try {
          await patchConnectedIntakeTriage(getState(), pubId, { action: btn.dataset.triage });
          showToast('Triage saved to staging');
          await loadConnectedCatalogue(getState());
          renderShell();
        } catch (e) {
          showToast(e.message || 'Triage failed');
        }
        return;
      }
      triagePublication(pubId, btn.dataset.triage, { user: getDemoUser()?.name });
      showToast('Triage updated');
      renderShell();
    });
  });

  document.querySelector('[data-intake-assign]')?.addEventListener('click', async () => {
    const pubId = document.querySelector('[data-intake-pub]')?.dataset.intakePub;
    const assigneeId = document.getElementById('intake-assignee')?.value?.trim();
    const due = document.getElementById('intake-due')?.value;
    if (!pubId) return;
    if (document.querySelector('[data-connected-intake-assign]') && isConnectedBackendActive(getState())) {
      try {
        await patchConnectedIntakeTriage(getState(), pubId, {
          action: 'assign',
          assignedTo: assigneeId || null,
        });
        showToast('Assignment saved');
        await loadConnectedCatalogue(getState());
        renderShell();
      } catch (e) {
        showToast(e.message || 'Assign failed');
      }
      return;
    }
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

  const librarySearch = document.getElementById('library-search');
  if (librarySearch) {
    const applyLibrarySearch = () => {
      const q = librarySearch.value.trim().toLowerCase();
      const rows = document.querySelectorAll('[data-library-row]');
      let visible = 0;
      rows.forEach((row) => {
        const text = (row.dataset.search || '').toLowerCase();
        const match = !q || text.includes(q);
        row.hidden = !match;
        if (match) visible += 1;
      });
      const countEl = document.getElementById('library-search-count');
      if (countEl && rows.length) {
        countEl.textContent = q
          ? `${visible} of ${rows.length} publication(s) match “${librarySearch.value.trim()}”`
          : `${rows.length} publication(s) in catalogue`;
      }
    };
    librarySearch.addEventListener('input', applyLibrarySearch);
    applyLibrarySearch();
  }

  const createChangePubSearch = document.querySelector('[data-create-change-publication-search]');
  if (createChangePubSearch) {
    applyCreateChangePublicationFilter(createChangePubSearch);
  }

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
    btn.addEventListener('click', async () => {
      if (btn.dataset.connectedMarkRead && isConnectedBackendActive(getState())) {
        try {
          await markConnectedNotificationRead(getState(), btn.dataset.markRead);
          showToast('Marked read');
          renderShell();
        } catch (e) {
          showToast(e.message || 'Mark read failed');
        }
        return;
      }
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

  document.querySelector('#ask-ri-input')?.addEventListener('input', (e) => {
    setAskRiDraft(e.target.value);
  });
  document.querySelector('[data-ask-ri-submit]')?.addEventListener('click', async () => {
    const q = document.getElementById('ask-ri-input')?.value?.trim();
    if (!q || getState()._askRiPending) return;
    const res = await runAskRiQuestion(q);
    showToast(askRiSubmitToast(res));
  });
  document.querySelectorAll('[data-ask-ri-suggest]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (getState()._askRiPending) return;
      const q = btn.textContent?.trim();
      const res = await runAskRiQuestion(q);
      showToast(askRiSubmitToast(res));
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

function syncModeChrome() {
  const pill = document.getElementById('ri-mode-pill');
  const st = getState();
  syncEnvironmentFooterBanner(st);
  if (!pill) return;
  pill.classList.remove('ri-lab-pill--connected');
  if (isConnectedBackendActive(st)) {
    pill.textContent = isConnectedLabWritesEnabled(st) ? 'Connected (writes)' : 'Connected (read-only)';
    pill.classList.add('ri-lab-pill--connected');
  } else if (isPresentationModeRequested()) {
    pill.textContent = 'Presentation mode';
  } else if (st.connectivity?.mode === 'auth_required') {
    pill.textContent = 'Sign in required';
  } else if (isConnectedModeIntent(st)) {
    const mode = st.connectivity?.mode;
    pill.textContent =
      mode === 'connecting' ? 'Connecting…' : mode === 'connected_error' ? 'Connected (error)' : 'Connected (pending)';
    pill.classList.add('ri-lab-pill--connected');
  } else {
    pill.textContent = 'Sign in required';
  }
}

let lastConnectivityMode = null;

function initConnectedLinkDelegation() {
  if (document.documentElement.dataset.connectedLinkDelegation === '1') return;
  document.documentElement.dataset.connectedLinkDelegation = '1';
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-ri-post-link]');
    if (!btn || btn.disabled) return;
    const linkType = btn.getAttribute('data-link-type');
    const leftId = btn.getAttribute('data-left-id');
    const panel = btn.closest('[data-connected-link-panel]');
    const targetSel =
      linkType === 'obligation_control' || linkType === 'risk_control'
        ? '[data-connected-link-control-target]'
        : '[data-connected-link-target]';
    const targetInput = panel?.querySelector(targetSel);
    const rightId = targetInput?.value?.trim();
    if (!linkType || !leftId || !rightId) {
      const needControl = linkType === 'obligation_control' || linkType === 'risk_control';
      showToast(needControl ? 'Enter control UUID' : 'Enter risk UUID');
      return;
    }
    btn.disabled = true;
    try {
      await postConnectedLink(getState(), linkType, leftId, rightId);
      const linkToast =
        linkType === 'obligation_risk'
          ? 'Risk linked'
          : linkType === 'risk_control'
            ? 'Control linked to risk'
            : 'Control linked';
      showToast(linkToast);
      if (targetInput) targetInput.value = '';
      renderShell();
    } catch (e) {
      showToast(e?.message || 'Link failed');
      btn.disabled = false;
    }
  });
}

function initConnectedWriteDelegation() {
  if (document.documentElement.dataset.connectedWriteDelegation === '1') return;
  document.documentElement.dataset.connectedWriteDelegation = '1';
  document.addEventListener(
    'click',
    async (ev) => {
      const riskBtn = ev.target.closest('[data-connected-risk-save]');
      if (riskBtn && !riskBtn.disabled) {
        const id = riskBtn.dataset.riskId;
        const panel = riskBtn.closest('[data-connected-risk-panel]');
        if (!id || !panel) return;
        const fields = {};
        panel.querySelectorAll('[data-connected-risk-field]').forEach((el) => {
          fields[el.dataset.connectedRiskField] = el.value;
        });
        riskBtn.disabled = true;
        try {
          await patchConnectedRisk(getState(), id, fields, riskBtn.dataset.expectedUpdatedAt || null);
          showToast('Risk saved');
          renderShell();
        } catch (e) {
          showToast(e?.message || 'Save failed');
          riskBtn.disabled = false;
        }
        return;
      }

      const actionBtn = ev.target.closest('[data-connected-action-save]');
      if (actionBtn && !actionBtn.disabled) {
        const id = actionBtn.dataset.actionId;
        const panel = actionBtn.closest('[data-connected-action-panel]');
        if (!id || !panel) return;
        const fields = collectConnectedActionPatchFields(panel);
        if (!Object.keys(fields).length) {
          showToast('No changes to save');
          return;
        }
        actionBtn.disabled = true;
        try {
          await patchConnectedAction(getState(), id, fields, actionBtn.dataset.expectedUpdatedAt || null);
          showToast('Action saved');
          renderShell();
        } catch (e) {
          showToast(e?.message || 'Save failed');
          actionBtn.disabled = false;
        }
        return;
      }

      const controlBtn = ev.target.closest('[data-connected-control-save]');
      if (controlBtn && !controlBtn.disabled) {
        const id = controlBtn.dataset.controlId;
        const panel = controlBtn.closest('[data-connected-control-panel]');
        if (!id || !panel) return;
        const fields = {};
        panel.querySelectorAll('[data-connected-control-field]').forEach((el) => {
          fields[el.dataset.connectedControlField] = el.value;
        });
        controlBtn.disabled = true;
        try {
          await patchConnectedControl(getState(), id, fields, controlBtn.dataset.expectedUpdatedAt || null);
          showToast('Control saved');
          renderShell();
        } catch (e) {
          showToast(e?.message || 'Save failed');
          controlBtn.disabled = false;
        }
        return;
      }

      const metaBtn = ev.target.closest('[data-connected-change-metadata-save]');
      if (!metaBtn || metaBtn.disabled) return;
      const changeId = metaBtn.dataset.changeId;
      const panel = metaBtn.closest('section.ri-panel');
      if (!changeId || !panel?.querySelector('[data-connected-change-materiality]')) {
        showToast('Change metadata panel not ready');
        return;
      }
      metaBtn.disabled = true;
      try {
        const live = getChange(changeId);
        await patchConnectedChange(getState(), changeId, {
          materiality: panel.querySelector('[data-connected-change-materiality]')?.value ?? null,
          implementationDeadline: panel.querySelector('[data-connected-change-deadline]')?.value || null,
          changeType: panel.querySelector('[data-connected-change-type]')?.value?.trim() || undefined,
          expectedUpdatedAt: live?.updatedAt || metaBtn.dataset.expectedUpdatedAt || null,
        });
        showToast('Change metadata saved');
        renderShell();
      } catch (e) {
        showToast(e?.message || 'Metadata update failed');
        metaBtn.disabled = false;
      }
    },
    false,
  );
}

function init() {
  initStore();
  initCreateChangePublicationComboboxHandlers();
  if (shouldAutoConnectToBackend()) {
    const st = getState();
    st.connectivity = {
      ...(st.connectivity || {}),
      mode: 'connecting',
      lastCheckedAt: new Date().toISOString(),
      error: null,
    };
  }
  renderChrome();
  bindChromeHandlers();
  initConnectedLinkDelegation();
  initConnectedWriteDelegation();
  subscribe(() => {
    const mode = getState().connectivity?.mode;
    if (mode !== lastConnectivityMode) {
      lastConnectivityMode = mode;
      renderChrome();
      bindChromeHandlers();
    }
    renderShell();
    syncModeChrome();
  });
  window.addEventListener('hashchange', renderShell);
  if (!location.hash) location.hash = '#/dashboard';
  renderShell();
  syncModeChrome();
  bootstrapLabConnectivity(getState())
    .then(() => {
      applyAskRiSessionRestore();
      notify();
      return Promise.all([
        ensureConnectedCatalogueLoaded(getState()),
        ensureConnectedLandscapeLoaded(getState()),
      ]);
    })
    .then(() => {
      lastConnectivityMode = getState().connectivity?.mode;
      renderChrome();
      bindChromeHandlers();
      syncModeChrome();
      renderShell();
    })
    .catch(() => {
      syncModeChrome();
      renderShell();
    });
}

init();
