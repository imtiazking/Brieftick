import { summarizeObligationPortfolio, UI_LABEL_OPEN_OBLIGATIONS } from './ai/obligation-portfolio.js';
import {
  getState,
  computeDashboardStats,
  getPublication,
  getAssessment,
  getObligation,
  getRisk,
  getControl,
  getPolicy,
  getAction,
  getEvidence,
  getChange,
  getDashboardTraceBlocks,
  scenarioFilter,
  getViewPublications,
  getViewChanges,
  getViewAuthorisedUatChanges,
  getViewUnverifiedAuditChanges,
  getConnectedChangeProvenance,
  getViewImpactAssessments,
  getViewObligations,
  getViewRisks,
  getViewAuthorisedUatRisks,
  getViewControls,
  getViewAuthorisedUatControls,
  getViewPolicies,
  getViewEvidence,
  getViewActions,
  getViewAuthorisedUatActions,
  getViewFindings,
  getViewAssuranceReviews,
  getViewWorkflowEvents,
  getViewAiAnalysisRuns,
  getViewAuthorisedUatAiAnalysisRuns,
  getConnectedAiAnalysisProvenance,
  getConnectedOperationsMetrics,
  getViewIngestionRuns,
  getConnectedSourceMonitoringSummary,
  getConnectedSourceMonitoringNote,
  buildWorkQueue,
  getDemoUser,
  personName,
} from './store.js';
import { connectedCatalogueBanner, getConnectedCatalogue, getConnectedAssigneeLabel, isConnectedCatalogueReady } from './platform/connected-catalogue.js';
import { getConnectedDashboardMetrics } from './platform/connected-notifications.js';
import {
  isConnectedBackendActive,
  isConnectedChangeWritesEnabled,
  isConnectedPolicyWritesEnabled,
  isConnectedEvidenceWritesEnabled,
  isConnectedActionWritesEnabled,
  isConnectedModeIntent,
} from './platform/connected-mode.js';
import {
  assertConnectedCatalogueReady,
  guardConnectedDemoSubroute,
  renderConnectedUnavailableView,
} from './platform/connected-route-guard.js';
import { renderConnectedApplicabilityView } from './platform/connected-applicability-panels.js';
import {
  renderConnectedImpactEditPanel,
  renderConnectedImpactWorkflowPanel,
} from './platform/connected-impact-panels.js';
import {
  renderConnectedObligationEditPanel,
  renderConnectedObligationLinkPanel,
  renderConnectedObligationWorkflowPanel,
} from './platform/connected-obligation-panels.js';
import {
  renderConnectedControlEditPanel,
  renderConnectedRiskEditPanel,
  renderConnectedRiskCreateBanner,
  renderConnectedControlCreateBanner,
  renderConnectedRiskLinkPanel,
  renderConnectedRiskWorkflowPanel,
  renderConnectedControlWorkflowPanel,
} from './platform/connected-risk-control-panels.js';
import {
  renderConnectedActionCreateBanner,
  renderConnectedActionEditPanel,
  renderConnectedActionWorkflowPanel,
} from './platform/connected-action-panels.js';
import {
  renderConnectedEvidenceCreatePanel,
  renderConnectedEvidenceUploadPanel,
  renderConnectedEvidenceWorkflowPanel,
} from './platform/connected-evidence-panels.js';
import {
  renderConnectedPolicyCreatePanel,
  renderConnectedPolicyEditPanel,
} from './platform/connected-policy-panels.js';
import {
  boardPdfExportUrl,
  renderConnectedReportingPeriodSelector,
} from './platform/connected-reporting.js';
import {
  connectedReadOnlyGovernanceBanner,
  renderConnectedWorkflowEventsTable,
  connectedRegisterEmpty,
} from './platform/connected-governance-ui.js';
import {
  renderConnectedAuditLoadPanel,
} from './platform/connected-audit.js';
import {
  renderConnectedDashboardWorkLoadPlaceholder,
} from './platform/connected-tenant-work.js';
import {
  connectedReadOnlyOperationsBanner,
  renderConnectedOperationsMetrics,
  renderConnectedSourceMonitoringSummary,
} from './platform/connected-operations-ui.js';
import { viewPublication } from './publication-views.js';
import { viewChange } from './change-views.js';
import {
  viewIntakeList,
  viewIntakeDetail,
  viewWorkQueue,
  viewNotifications,
  viewReportsExecutive,
  viewReportsExtended,
  viewAdminOrganisation,
} from './operational-views.js';
import { viewAdminPlatform } from './platform-views.js';
import { viewDemo } from './demo-views.js';
import {
  viewIngestionMonitor,
  viewIngestionRun,
  viewIngestionItem,
  viewSourceDocument,
  viewChangeCandidate,
  viewAdminSources,
  viewLiveVerificationEvidence,
  renderDashboardIngestionSummary,
} from './ingestion-views.js';
import {
  viewGovernanceRegister,
  viewApprovalStep,
  viewAttestation,
  viewException,
  viewControlTest,
  renderDashboardGovernanceSummary,
  renderDashboardGovernanceSummaryConnected,
  renderAssessmentGovernance,
} from './governance-views.js';
import {
  viewAiGovernanceRegister,
  viewAiAnalysis,
  viewAiModel,
  viewAiUseCase,
  viewAiConfig,
  viewAiOversightReport,
  renderDashboardAiSummary,
} from './ai-governance-views.js';
import { viewAiOperations, viewAiExecutionDetail } from './ai-operations-views.js';
import { viewAdminHealth, viewAdminReadiness } from './admin-health-views.js';
import { viewAdminAi } from './admin-ai-views.js';
import { renderIaObligationPanel } from './ai-workflow-ui.js';
import { renderAskRiPage } from './ask-ri-ui.js';
import {
  viewAssuranceDashboard,
  viewAssuranceReview,
  viewFinding,
  viewManagementAttestation,
  viewAssurancePack,
  viewBoardReport,
  viewBoardPack,
  viewPeriodChanges,
  viewAssuranceReport,
  renderDashboardAssuranceSummary,
  renderObligationCoveragePanel,
  renderEvidenceAssurancePanel,
  renderControlAssurancePanel,
} from './assurance-views.js';
import { getEvidenceAssuranceStatus } from './governance-helpers.js';
import { isWithinForwardDateWindow, DEMO_TODAY } from './workflow-helpers.js';
import { SCENARIOS } from './seed-data.js';
import {
  esc,
  badge,
  aiRecommendation,
  traceChain,
  moduleCard,
  dataTable,
  pageHeader,
  detailTabs,
  formatDate,
  linkRecord,
  renderTraceSection,
  entityHero,
  notFoundState,
  formatDateTime,
  intelligenceLabel,
  sectionHeader,
  metric,
  emptyState,
} from './components.js';
import {
  connectedLibraryRowCells,
  connectedWorkModeBanner,
  libraryPublicationSearchText,
} from './platform/connected-display.js';
import {
  viewLandscapeHome,
  viewSectorDetail,
  viewFrameworkDetail,
  viewRegulatorDetail,
  viewLandscapeGaps,
  viewLandscapeMatrix,
  viewLandscapePreferences,
  viewLandscapeSearch,
} from './landscape-views.js';
import { viewLegislationDetail, viewLegislationStaging } from './legislation-views.js';
import { viewTprPublication, viewTprStaging } from './tpr-views.js';
import { viewBaselPublication, viewBaselStaging, viewBaselUkImplementation } from './basel-views.js';
import { mySectorIds, publicationsForSector, changesForSector, obligationsForSector } from './landscape-helpers.js';

function renderDashboardMySectors(s) {
  if (!s.sectors?.length) return '';
  const ids = mySectorIds(s);
  const sectors = ids.map((id) => s.sectors.find((x) => x.id === id)).filter(Boolean);
  if (!sectors.length) return '';
  const pubCount = sectors.reduce((n, sec) => n + publicationsForSector(s, sec.id).length, 0);
  const chgCount = sectors.reduce((n, sec) => n + changesForSector(s, sec.id).length, 0);
  const oblCount = sectors.reduce((n, sec) => n + obligationsForSector(s, sec.id).length, 0);
  const links = sectors.map((sec) => `<a href="#/landscape/${sec.slug}">${esc(sec.name)}</a>`).join(' · ');
  return `
    <section class="ri-panel ri-dashboard-my-sectors">
      <h2>My sectors</h2>
      <p class="ri-muted">Prioritised landscape: ${links}</p>
      <p>Mapped publications <strong>${pubCount}</strong> · changes <strong>${chgCount}</strong> · obligations <strong>${oblCount}</strong>
        · <a href="#/landscape/gaps">Coverage gaps</a> · <a href="#/landscape/preferences">Edit</a></p>
    </section>`;
}

function renderDashboardMySectorsConnected(s) {
  return renderDashboardMySectors(s);
}

function renderConnectedCompactPanel(title, message, href, linkLabel) {
  return `<section class="ri-panel ri-panel--compact"><h2>${title}</h2>
    <p class="ri-muted">${message}</p>${href ? `<p><a href="${href}">${linkLabel}</a></p>` : ''}</section>`;
}

export function renderView(route) {
  const [path, ...rest] = route.replace(/^\//, '').split('/').filter(Boolean);
  const id = rest[0];
  switch (path || 'dashboard') {
    case 'change':
      return viewChange(id);
    case 'ask-ri':
      return viewAskRi();
    case 'dashboard':
      return viewDashboard();
    case 'intake':
      return id ? viewIntakeDetail(id) : viewIntakeList();
    case 'work':
    case 'work-queue':
      return viewWorkQueue();
    case 'notifications':
      return viewNotifications();
    case 'feed':
      return viewFeed();
    case 'horizon':
      return viewHorizon();
    case 'library':
      return viewLibrary();
    case 'publication':
      return viewPublication(rest);
    case 'changes':
      return viewChangesRegister();
    case 'version':
      return viewVersion(id);
    case 'applicability':
      return viewApplicability(id);
    case 'assessments':
      return viewAssessments();
    case 'assessment':
      return viewAssessment(id);
    case 'obligations':
      return viewObligations();
    case 'obligation':
      return viewObligation(id);
    case 'risks':
      return viewRisks();
    case 'risk':
      return viewRisk(id);
    case 'controls':
      return viewControls();
    case 'control':
      return viewControl(id);
    case 'policies':
      return viewPolicies();
    case 'policy':
      return viewPolicy(id);
    case 'actions':
      return viewActions();
    case 'action':
      return viewAction(id);
    case 'evidence':
      return rest.length ? viewEvidenceDetail(id) : viewEvidenceList();
    case 'calendar':
      return viewCalendar();
    case 'reports':
      if (id === 'executive') return viewReportsExecutive();
      if (id === 'ai-oversight') return viewAiOversightReport();
      if (id === 'board') return viewBoardReport();
      if (id === 'period-changes') return viewPeriodChanges();
      if (
        id &&
        ['obligation-assurance', 'control-assurance', 'evidence-assurance', 'findings', 'management-attestations', 'assurance-opinions', 'control-coverage'].includes(
          id
        )
      ) {
        return viewAssuranceReport(id);
      }
      if (id) return viewReportsExtended(id);
      return viewReports();
    case 'board':
      return viewBoardReport();
    case 'assurance':
      return id ? viewAssuranceReview(id) : viewAssuranceDashboard();
    case 'finding':
      return viewFinding(id);
    case 'management-attestation':
      return viewManagementAttestation(id);
    case 'assurance-pack':
      return viewAssurancePack(id);
    case 'board-pack':
      return viewBoardPack(id);
    case 'audit':
      return viewAudit();
    case 'demo':
      return viewDemo(id);
    case 'ingestion':
      if (id === 'live-verification') return viewLiveVerificationEvidence(rest[0] || '');
      if (id === 'run' && rest[1]) return viewIngestionRun(rest[1]);
      if (id === 'item' && rest[1]) return viewIngestionItem(rest[1]);
      if (id === 'candidate' && rest[1]) return viewChangeCandidate(rest[1]);
      return viewIngestionMonitor();
    case 'source-document':
      return viewSourceDocument(id);
    case 'governance':
      return viewGovernanceRegister();
    case 'approval':
      return viewApprovalStep(id);
    case 'attestation':
      return viewAttestation(id);
    case 'exception':
      return viewException(id);
    case 'control-test':
      return viewControlTest(id);
    case 'ai-governance':
      return viewAiGovernanceRegister();
    case 'ai-operations':
      return viewAiOperations();
    case 'ai-execution':
      return viewAiExecutionDetail(id);
    case 'ai-analysis':
      return viewAiAnalysis(id);
    case 'ai-model':
      return viewAiModel(id);
    case 'ai-use-case':
      return viewAiUseCase(id);
    case 'ai-config':
      return viewAiConfig(id);
    case 'admin':
      if (id === 'organisation') return viewAdminOrganisation();
      if (id === 'sources') return viewAdminSources();
      if (id === 'platform') return viewAdminPlatform();
      if (id === 'health') return viewAdminHealth();
      if (id === 'readiness') return viewAdminReadiness();
      if (id === 'ai') return viewAdminAi();
      return viewAdmin();
    case 'legislation':
      if (id === 'staging') return viewLegislationStaging();
      return viewLegislationDetail(id);
    case 'tpr':
      if (id === 'staging') return viewTprStaging();
      return viewTprPublication(id);
    case 'basel':
      if (id === 'staging') return viewBaselStaging();
      if (id === 'uk-implementation') return viewBaselUkImplementation();
      return viewBaselPublication(id);
    case 'landscape':
      if (!id) return viewLandscapeHome();
      if (id === 'gaps') return viewLandscapeGaps();
      if (id === 'matrix') return viewLandscapeMatrix();
      if (id === 'preferences') return viewLandscapePreferences();
      if (id === 'search') {
        try {
          return viewLandscapeSearch(decodeURIComponent(rest.join('/') || ''));
        } catch {
          return viewLandscapeSearch(rest.join('/') || '');
        }
      }
      if (id === 'framework' && rest[1]) return viewFrameworkDetail(rest[1]);
      if (id === 'regulator' && rest[1]) return viewRegulatorDetail(rest[1]);
      if (rest[0]) {
        const tabSlug = rest[0];
        const knownTabs = [
          'frameworks',
          'regulators',
          'compliance-themes',
          'publications',
          'changes',
          'obligations',
          'risks-controls',
          'coverage',
        ];
        if (knownTabs.includes(tabSlug)) return viewSectorDetail(id, tabSlug);
      }
      return viewSectorDetail(id, 'overview');
    default:
      return viewDashboard();
  }
}

function viewAskRi() {
  const s = getState();
  return renderAskRiPage(s, { lastAsk: s._lastAskRi });
}

function viewDashboard() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  if (isConnectedModeIntent(s) && !connected) {
    const err = s.connectivity?.error || 'not_authenticated';
    const mode = s.connectivity?.mode || 'connected_error';
    return `
    ${pageHeader({
      eyebrow: 'CONNECTED STAGING',
      title: mode === 'connecting' ? 'Connecting to staging APIs…' : 'Connected staging unavailable',
      subtitle:
        'Demo mock dashboards are not shown when connected mode is requested. Operational UAT requires a valid Clerk session and tenant-scoped API data.',
    })}
    <section class="ri-panel ri-alert ri-alert--readonly">
      <p><strong>Status:</strong> ${esc(String(mode))}${err ? ` — ${esc(String(err))}` : ''}</p>
      <p class="ri-muted">Sign in at <code>/sign-in</code>, then reload the Design Lab. Live tenant data loads automatically; use <strong>Admin → Platform</strong> to retry or enter presentation mode.</p>
    </section>`;
  }
  const stats = computeDashboardStats();
  const scopedPubs = getViewPublications();
  const scopedChanges = getViewChanges();
  const materialOpen = connected
    ? scopedChanges.filter((c) => c.materiality === 'High' && !['Implemented', 'Closed', 'Complete'].includes(c.status))
    : scopedChanges.filter((c) => c.materiality === 'High' && c.status !== 'Complete');
  const openObl = connected ? null : stats.openObligations || 0;
  const overdueObl = connected ? null : stats.oblOverdue || 0;
  const catLoadedAt = connected ? getConnectedCatalogue(s).loadedAt : null;
  const dashApi = connected ? getConnectedDashboardMetrics(s) : null;
  const tenantSummary = dashApi?.summary;
  const pendingApprovals = dashApi?.pendingApprovals ?? [];
  const excludedUat = connected ? getConnectedCatalogue(s).excludedSyntheticUat || {} : {};
  const pendingUatExcluded =
    dashApi?.excludedSyntheticUat?.pendingApprovals ?? excludedUat.pendingApprovals ?? 0;
  const aiRunsUatExcluded = excludedUat.aiAnalysisRuns ?? 0;
  const aiProv = connected ? getConnectedAiAnalysisProvenance() : null;
  const aiUatAuthorisedCount =
    aiProv?.uatAuthorised ?? excludedUat.aiAnalysisUatAuthorised ?? getViewAuthorisedUatAiAnalysisRuns().length;
  const aiSyntheticFixtureCount =
    aiProv?.syntheticFixtures ?? excludedUat.aiAnalysisSyntheticFixtures ?? 0;
  const opsMetrics = connected ? getConnectedOperationsMetrics() : null;
  const ingestionRunsRestricted = opsMetrics?.operationsVisibility === 'restricted';
  const visibleIngestionRuns = ingestionRunsRestricted ? null : getViewIngestionRuns().length;
  const dataAsOfIso = connected
    ? (catLoadedAt || stats.latestRetrievedAt || new Date().toISOString()).slice(0, 10)
    : DEMO_TODAY;
  const headline = connected
    ? `${stats.catalogueCount ?? scopedPubs.length} publication${(stats.catalogueCount ?? scopedPubs.length) === 1 ? '' : 's'} in staging catalogue`
    : materialOpen.length > 0
      ? `${materialOpen.length} material change${materialOpen.length === 1 ? '' : 's'} require attention`
      : 'Regulatory implementation remains broadly controlled';
  const feed = connected
    ? [...scopedPubs]
        .sort((a, b) => (b.publishedDate || '').localeCompare(a.publishedDate || ''))
        .slice(0, 5)
    : scopedPubs
        .filter((p) => p.priority === 'High' || p.workflowStatus === 'Impact Review' || p.workflowStatus === 'Assessment Required')
        .slice(0, 5);
  const traceBlocks = connected ? [] : getDashboardTraceBlocks();
  const cal = connected
    ? []
    : filterCalendarEvents(s.calendarEvents)
        .filter((e) => e.date >= '2026-10-01' && e.date <= '2026-11-30')
        .slice(0, 6);
  const unavailablePanel = (label, detail) =>
    `<p class="ri-muted"><strong>${esc(label)}</strong> — ${esc(detail)}</p>`;

  const heroSection = connected
    ? `${connectedCatalogueBanner(s)}
    <section class="ri-dashboard-hero">
      <p class="ri-dashboard-hero__narrative">Staging catalogue connected — publication metrics reflect ingested <code>regulatory_publications</code>. Tenant compliance counts use server-enforced <code>dataScope=operational</code> (UAT-labelled rows excluded).</p>
      <p class="ri-muted">Global catalogue · ${scopedPubs.length} publication(s) · tenant triage/applicability overlay when provisioned</p>
    </section>`
    : `<section class="ri-dashboard-hero">
      <p class="ri-dashboard-hero__narrative">${esc(s.forgeniqRead.summary)}</p>
      <p class="ri-muted">FORGENIQ read · confidence ${s.forgeniqRead.confidence}% · ${s.forgeniqRead.sourcesAnalysed} mock sources analysed</p>
    </section>`;

  return `
    ${pageHeader({
      eyebrow: connected
        ? `REGULATORY POSITION · Data as of ${formatDate(dataAsOfIso)}`
        : `REGULATORY POSITION · ${formatDate(DEMO_TODAY)}`,
      title: headline,
      subtitle: 'Regulatory Intelligence — know what changed, understand what it means, prove what you did.',
      meta: connected
        ? '<span class="ri-mono">Connected read-only · global catalogue</span>'
        : `<span class="ri-mono">Scenario: ${esc(SCENARIOS.find((x) => x.id === s.scenarioId)?.label || s.scenarioId)}</span>`,
      actions: `<a class="ri-btn ri-btn--primary" href="#/intake">Review intake</a><a class="ri-btn ri-btn--ghost" href="#/notifications">Attention centre</a>`,
    })}
    ${heroSection}
    <div class="ri-priority-metrics">
      ${
        connected
          ? `${metric('Catalogue publications', `<strong>${stats.catalogueCount ?? scopedPubs.length}</strong>`, 'regulatory_publications (global)')}
      ${metric('Awaiting triage', `<strong>${tenantSummary?.publicationsAwaitingTriage ?? stats.notTriaged ?? 0}</strong>`, 'organisation_publications')}
      ${metric('Pending approvals', `<strong>${tenantSummary?.pendingApprovals ?? pendingApprovals.length}</strong>`, 'Impact & applicability IN_REVIEW')}
      ${metric('Overdue obligations', `<strong>${tenantSummary?.obligationsOverdue ?? 0}</strong>`, 'regulatory_obligations')}
      ${metric('Open findings', `<strong>${tenantSummary?.findingsOpen ?? 0}</strong>`, 'findings register')}
      ${metric('Unread notifications', `<strong>${tenantSummary?.unreadNotifications ?? 0}</strong>`, 'tenant_notifications · <a href="#/notifications">Attention centre</a>')}
      ${metric('Open risks', `<strong>${tenantSummary?.risksOpen ?? 0}</strong>`, 'risks register')}
      ${metric('Controls tracked', `<strong>${tenantSummary?.controlsTracked ?? 0}</strong>`, 'controls register')}
      ${metric('Impacts in review', `<strong>${tenantSummary?.impactsInReview ?? 0}</strong>`, 'impact_assessments IN_REVIEW')}`
          : `${metric('Material changes', `<strong>${materialOpen.length}</strong>`, 'High materiality in flight')}
      ${metric('Awaiting review', `<strong>${stats.awaitingReview}</strong>`, 'Intake & applicability')}
      ${metric(UI_LABEL_OPEN_OBLIGATIONS, `<strong>${openObl}</strong>`, 'Active implementation (Open / In Progress / Overdue)')}
      ${metric('Overdue obligations', `<strong>${overdueObl}</strong>`, 'Subset of open obligations')}
      ${metric('Upcoming deadlines', `<strong>${stats.upcomingDeadlines}</strong>`, 'Next 30 days')}`
      }
    </div>
    ${
      connected && (pendingApprovals.length || pendingUatExcluded)
        ? `<section class="ri-panel ri-panel--compact"><h2>Pending approvals</h2>
            ${
              pendingApprovals.length
                ? `<ul class="ri-list-compact">
              ${pendingApprovals
                .slice(0, 8)
                .map(
                  (p) =>
                    `<li><a href="${esc(p.href || `#/assessment/${p.id}`)}">${esc(p.title || p.id)}</a> — ${badge(p.status)} · ${esc(p.kind || 'review')}</li>`,
                )
                .join('')}
            </ul>`
                : `<p class="ri-muted">No operational pending approvals.</p>`
            }
            ${
              pendingUatExcluded
                ? `<p class="ri-muted">${pendingUatExcluded} IN_REVIEW item(s) excluded from this operational view (UAT / unverified provenance). Records remain in staging.</p>`
                : ''
            }
            <p><a href="#/governance">Governance register</a></p></section>`
        : ''
    }
    ${connected ? renderDashboardMySectorsConnected(s) : renderDashboardMySectors(s)}
    <div class="ri-module-grid ri-module-grid--priority">
      ${
        connected
          ? `${moduleCard('01', 'Catalogue publications', stats.catalogueCount ?? scopedPubs.length, [
              `Published today: <strong>${stats.publishedToday ?? 0}</strong> (publication_date)`,
              `Published this week: <strong>${stats.publishedThisWeek ?? 0}</strong> (publication_date)`,
              `Detected this week: <strong>${stats.detectedThisWeek ?? 0}</strong> (retrieved_at)`,
            ])}
      ${moduleCard('02', 'Regulatory changes', stats.regulatoryChangesCount ?? 0, [
              `Material (high) open: <strong>${materialOpen.length}</strong>`,
              `Not triaged (publications): <strong>${stats.notTriaged ?? 0}</strong>`,
              `Impact assessments: <strong>${stats.impactAssessmentCount ?? 0}</strong> · <a href="#/assessments">Open register</a>`,
              `Obligations: <strong>${stats.obligationCount ?? 0}</strong> · <a href="#/obligations">Open register</a>`,
            ])}`
          : `${moduleCard('01', 'New regulatory changes', stats.newChanges, [
              `New today: <strong>${stats.newToday}</strong>`,
              `New this week: <strong>${stats.newWeek}</strong>`,
              `Awaiting review: <strong>${stats.awaitingReview}</strong>`,
            ])}
      ${moduleCard('02', 'Impact assessments', stats.impactAssessments, [
              `Draft: <strong>${stats.iaDraft}</strong>`,
              `Under review: <strong>${stats.iaReview}</strong>`,
              `Awaiting approval: <strong>${stats.iaApproval}</strong>`,
            ])}`
      }
    </div>
    ${
      connected
        ? `<section class="ri-panel ri-panel--compact"><h2>Regulatory ingestion</h2>
            ${connectedReadOnlyOperationsBanner()}
            ${renderConnectedSourceMonitoringSummary(getConnectedSourceMonitoringSummary(), getConnectedSourceMonitoringNote())}
            ${renderConnectedOperationsMetrics(opsMetrics)}
            <p class="ri-muted">${
              ingestionRunsRestricted
                ? 'Ingestion run history is not visible for tenant Compliance Manager sessions (platform-operator RLS).'
                : `${visibleIngestionRuns} ingestion run(s) visible`
            } · <a href="#/ingestion">Open Ingestion Monitor</a></p></section>`
        : renderDashboardIngestionSummary()
    }
    ${
      connected
        ? renderDashboardGovernanceSummaryConnected()
        : renderDashboardGovernanceSummary()
    }
    ${
      connected
        ? `<section class="ri-panel ri-panel--compact"><h2>AI governance</h2>
            <p class="ri-muted">${getViewAiAnalysisRuns().length} operational analysis run(s) in tenant register (dataScope=operational).</p>
            ${
              aiUatAuthorisedCount > 0
                ? `<p class="ri-muted">${aiUatAuthorisedCount} authorised UAT / acceptance execution(s) — open <a href="#/ai-governance">AI Governance</a> audit register (excluded from operational counters).</p>`
                : ''
            }
            ${
              aiSyntheticFixtureCount > 0
                ? `<p class="ri-muted">${aiSyntheticFixtureCount} synthetic fixture run(s) excluded from operational reporting.</p>`
                : aiRunsUatExcluded > 0 && !aiUatAuthorisedCount
                  ? `<p class="ri-muted">${aiRunsUatExcluded} non-operational run(s) excluded from this dashboard.</p>`
                  : getViewAiAnalysisRuns().length === 0 && !aiUatAuthorisedCount
                    ? `<p class="ri-muted">Zero operational runs is expected when persisted analyses are classified as UAT acceptance or synthetic fixtures.</p>`
                    : ''
            }
            <p><a href="#/ai-governance">AI Governance register</a></p></section>`
        : renderDashboardAiSummary()
    }
    ${
      connected
        ? `<section class="ri-panel ri-panel--compact"><h2>Assurance</h2>
            <p class="ri-muted">${getViewAssuranceReviews().length} assurance review(s) · ${getViewFindings().length} finding(s) in tenant register.</p>
            <p><a href="#/assurance">Assurance dashboard</a></p></section>`
        : renderDashboardAssuranceSummary()
    }
    ${sectionHeader('PRIORITY INTELLIGENCE', 'What needs attention now', 'High-signal publications and operational modules for the selected scenario.')}
    <div class="ri-split">
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>05</span> Regulatory intelligence feed</h2>
        <ul class="ri-feed-mini">
          ${feed
            .map(
              (p) => `
            <li><a href="#/publication/${p.id}"><strong>${esc(p.regulator)}</strong> — ${esc(p.title)}</a>
              <span>${connected ? `${esc(p.display?.reference || '—')} · ${esc(p.display?.classification || 'Unassessed')}` : `${badge(p.priority)} ${badge(p.applicabilityRecommendation)} ${badge(p.workflowStatus)}`}</span></li>`
            )
            .join('')}
        </ul>
      </section>
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>06</span> FORGENIQ Read</h2>
        ${
          connected
            ? unavailablePanel(
                'FORGENIQ Read',
                'Unavailable — connected mode does not generate executive narrative (no Ask RI / read pipeline on this dashboard).',
              )
            : `<blockquote class="ri-read">${esc(s.forgeniqRead.summary)}</blockquote>
        <p class="ri-muted">Confidence ${s.forgeniqRead.confidence}% · ${s.forgeniqRead.sourcesAnalysed} mock sources</p>`
        }
      </section>
    </div>
    <div class="ri-split">
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>07</span> Regulatory Calendar</h2>
        ${connected ? unavailablePanel('Regulatory calendar', 'Unavailable — no tenant regulatory calendar API connected to this dashboard.') : `<ul class="ri-list-compact">
          ${cal.map((e) => `<li><a href="${linkHref(e)}">${formatDate(e.date)} — ${esc(e.title)}</a></li>`).join('')}
        </ul>`}
      </section>
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>08</span> Traceability</h2>
        ${
          connected
            ? unavailablePanel(
                'Traceability',
                'Unavailable — end-to-end traceability chains are not exposed via tenant lab APIs (use publication / change / assessment detail views).',
              )
            : `${traceBlocks
                .map(
                  (b) => `
          <div class="ri-dash-trace">
            <p class="ri-muted ri-dash-trace__label">${esc(b.label)}</p>
            ${traceChain(b.chain)}
          </div>`
                )
                .join('')}
        <p class="ri-muted" style="margin-top:12px">Derived from central mock relationships (DEMO)</p>`
        }
      </section>
    </div>
    <div class="ri-split">
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>09</span> Governance Coverage</h2>
        ${
          connected
            ? unavailablePanel(
                'Governance coverage',
                'Partially connected — tenant registers and workflow events load via API; aggregate coverage ratios are not computed on this dashboard.',
              )
            : `<ul class="ri-stats-inline">
          <li>Risks linked <strong>${stats.risksLinked}</strong></li>
          <li>Controls mapped <strong>${stats.controlsMapped}</strong></li>
          <li>Policies impacted <strong>${stats.policiesImpacted}</strong></li>
          <li>Evidence items <strong>${stats.evidenceItems}</strong></li>
        </ul>`
        }
      </section>
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>10</span> Source Health</h2>
        ${
          connected
            ? unavailablePanel(
                'Source health',
                'Partially connected — catalogue readiness and connector registry appear under Regulatory ingestion above; live connector health requires platform-operator access.',
              )
            : `<ul class="ri-source-health">
          ${s.sourceHealth.map((h) => `<li><span>${esc(h.name)}</span><em class="ri-ok">${esc(h.status)}</em></li>`).join('')}
        </ul>
        <p class="ri-muted">Simulation only — no live connectors</p>`
        }
      </section>
    </div>
    <div class="ri-module-grid" style="margin-top:16px">
      ${
        connected
          ? `${moduleCard('11', 'Regulatory intake', stats.intakeCount ?? scopedPubs.length, [
              `Not triaged (tenant): <strong>${stats.notTriaged ?? 0}</strong>`,
              `Catalogue intake rows: <strong>${stats.intakeCount ?? scopedPubs.length}</strong>`,
              `<a href="#/intake">Open intake</a>`,
            ])}
      ${moduleCard('12', 'Assessments attention', tenantSummary?.impactsInReview ?? pendingApprovals.length, [
              `Impacts in review: <strong>${tenantSummary?.impactsInReview ?? 0}</strong>`,
              `Pending approvals: <strong>${tenantSummary?.pendingApprovals ?? pendingApprovals.length}</strong>`,
              `<a href="#/assessments">Open assessments</a>`,
            ])}
      ${moduleCard('13', 'Implementation', tenantSummary?.obligationsOverdue ?? 0, [
              `Overdue obligations: <strong>${tenantSummary?.obligationsOverdue ?? 0}</strong>`,
              `Open findings: <strong>${tenantSummary?.findingsOpen ?? 0}</strong>`,
              `<a href="#/obligations">Obligations</a> · <a href="#/findings">Findings</a>`,
            ])}
      ${moduleCard('14', 'Escalations', tenantSummary?.unreadNotifications ?? 0, [
              `<a href="#/notifications">Attention centre</a>`,
              `Unread notifications: <strong>${tenantSummary?.unreadNotifications ?? 0}</strong>`,
              `Awaiting triage: <strong>${tenantSummary?.publicationsAwaitingTriage ?? stats.notTriaged ?? 0}</strong>`,
            ])}`
          : `${moduleCard('11', 'Regulatory intake', stats.intakeAwaitingTriage, [
              `New: <strong>${stats.intakeNew}</strong>`,
              `High relevance: <strong>${stats.intakeHighRelevance}</strong>`,
              `<a href="#/intake">Open intake</a>`,
            ])}
      ${moduleCard('12', 'Assessments attention', stats.iaReview + stats.iaApproval, [
              `Awaiting review: <strong>${stats.iaReview}</strong>`,
              `Awaiting approval: <strong>${stats.iaApproval}</strong>`,
              `Overdue (SLA): <strong>${scenarioFilter(s.assessments).filter((a) => a.dueDate && a.dueDate < '2026-10-07' && !['Implementation', 'Complete'].includes(a.status)).length}</strong>`,
            ])}
      ${moduleCard('13', 'Implementation', stats.actionsOpen, [
              `Open actions: <strong>${stats.actionsOpen}</strong>`,
              `Overdue: <strong>${stats.actionsOverdue}</strong>`,
              `Evidence items: <strong>${stats.evidenceItems}</strong>`,
            ])}
      ${moduleCard('14', 'Escalations', stats.escalations, [
              `<a href="#/notifications">Attention centre</a>`,
              `Pipeline in triage: <strong>${stats.pipeline?.inTriage ?? 0}</strong>`,
            ])}`
      }
    </div>
    <section class="ri-panel" style="margin-top:16px">
      <h2 class="ri-panel__title"><span>15</span> My work (${connected ? 'Connected tenant registers' : esc(getDemoUser()?.name || 'Demo user')})</h2>
      ${
        connected
          ? `${renderConnectedDashboardWorkLoadPlaceholder()}<p><a href="#/work">Open work queue</a> · tenant changes and impacts from <code>/api/ri-lab/tenant-work</code></p>`
          : `<ul class="ri-list-compact">
        ${buildWorkQueuePreview(s, 5)}
      </ul>
      <p><a href="#/work">Open work queue</a></p>`
      }
    </section>`;
}

function buildWorkQueuePreview(s, limit) {
  const items = buildWorkQueue(s, s.scenarioId).filter((w) => w.ownerId === s.currentDemoUserId).slice(0, limit);
  if (!items.length) return '<li class="ri-muted">No assignments for current demo user</li>';
  return items.map((w) => `<li><a href="#/work">${esc(w.entityType)} ${esc(w.id)}</a> — ${esc(w.title.slice(0, 50))}… ${w.dueDate ? `· due ${formatDate(w.dueDate)}` : ''}</li>`).join('');
}

function linkHref(e) {
  const m = { Publication: 'publication', 'Impact Assessment': 'assessment', Obligation: 'obligation', Action: 'action', Policy: 'policy' };
  const seg = m[e.recordType];
  return seg ? `#/${seg}/${e.recordId}` : '#/calendar';
}

function viewFeed() {
  const s = getState();
  if (isConnectedBackendActive(s)) {
    const ready = assertConnectedCatalogueReady(s);
    if (!ready.ok) return ready.html;
    const pubs = [...getViewPublications()].sort((a, b) =>
      String(b.publishedDate || '').localeCompare(String(a.publishedDate || '')),
    );
    return `${pageHeader('Regulatory Feed', 'Staging catalogue publications · connected read-only')}
      ${connectedCatalogueBanner(s)}
      ${connectedWorkModeBanner(s)}
      <p class="ri-muted">Regulator-associated catalogue items only — not confirmed organisational applicability.</p>
      <div class="ri-metrics-row">
        <span>Catalogue publications: <strong>${pubs.length}</strong></span>
      </div>
      <div class="ri-feed-list" id="feed-list">
        ${
          pubs.length
            ? pubs
                .map(
                  (p) => `
        <article class="ri-feed-card" data-feed-item>
          <header>
            <span class="ri-feed-card__reg">${esc(p.regulator)}</span>
            <h2><a href="#/publication/${p.id}">${esc(p.title)}</a></h2>
            <p class="ri-muted">${esc(p.display?.reference || '—')} · ${esc(p.publicationType || '—')} · Published ${formatDate(p.publishedDate)}</p>
          </header>
          <p class="ri-feed-card__summary">${esc(p.summary || p.display?.classification || '—')}</p>
          <div class="ri-feed-card__actions">
            <a class="ri-btn ri-btn--sm" href="#/publication/${p.id}">Open</a>
            <a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/intake/${p.id}">Intake</a>
          </div>
        </article>`,
                )
                .join('')
            : '<p class="ri-muted">No publications in staging catalogue.</p>'
        }
      </div>`;
  }
  const pubs = scenarioFilter(s.publications);
  const newToday = pubs.filter((p) => p.publishedDate === '2026-10-07').length;
  const unreviewed = pubs.filter((p) => p.unreviewed).length;
  const likely = pubs.filter((p) => (p.applicabilityRecommendation || '').includes('Applicable')).length;
  const high = pubs.filter((p) => p.priority === 'High').length;

  return `
    ${pageHeader('Regulatory Feed', 'New regulatory developments requiring triage and review. <strong>DEMO / MOCK DATA</strong>')}
    <div class="ri-toolbar">
      <label class="ri-search"><span class="sr-only">Search</span>
        <input type="search" id="feed-search" placeholder="Search title, reference, topic, regulator…" data-filter-target="feed-list" />
      </label>
      <select id="feed-filter-priority" data-filter-feed="priority" class="ri-select">
        <option value="">All priorities</option><option>High</option><option>Medium</option><option>Low</option>
      </select>
      <select id="feed-filter-reg" data-filter-feed="regulator" class="ri-select">
        <option value="">All regulators</option><option>FCA</option><option>PRA</option>
      </select>
    </div>
    <div class="ri-metrics-row">
      <span>New Today: <strong>${newToday}</strong></span>
      <span>Unreviewed: <strong>${unreviewed}</strong></span>
      <span>Likely Applicable: <strong>${likely}</strong></span>
      <span>High Priority: <strong>${high}</strong></span>
    </div>
    <div class="ri-feed-list" id="feed-list">
      ${pubs
        .map(
          (p) => `
        <article class="ri-feed-card" data-feed-item data-priority="${esc(p.priority)}" data-regulator="${esc(p.regulator)}" data-search="${esc(`${p.title} ${p.reference} ${p.topic}`)}">
          <header>
            <span class="ri-feed-card__reg">${esc(p.regulator)}</span>
            <h2><a href="#/publication/${p.id}">${esc(p.title)}</a></h2>
            <p class="ri-muted">${esc(p.reference)} · ${esc(p.publicationType)} · Published ${formatDate(p.publishedDate)}</p>
          </header>
          <p class="ri-feed-card__summary">${esc(p.aiSummary)}</p>
          <div class="ri-feed-card__tags">${badge(p.priority)} ${badge(p.applicabilityRecommendation)} ${badge(p.workflowStatus)}</div>
          <div class="ri-feed-card__actions">
            <a class="ri-btn ri-btn--sm" href="#/publication/${p.id}">Open</a>
            <a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/applicability/${p.id}">Review applicability</a>
            <a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/assessment/IA-0042">Start assessment</a>
            <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-proto-toast="Mock source viewer">View source</button>
          </div>
        </article>`
        )
        .join('')}
    </div>`;
}

function renderConnectedChangeRegisterRow(s, c, { includeProvenance = false, includeDeadline = false } = {}) {
  const provCell = includeProvenance
    ? `<td>${badge(c.labClassificationLabel || c.labClassification || '—')}</td>`
    : '';
  const deadlineCell = includeDeadline ? `<td>${c.dueDate ? formatDate(c.dueDate) : '—'}</td>` : '';
  return `<tr>
      <td><a href="#/change/${c.id}">${esc(c.externalKey || c.id.slice(0, 8))}</a></td>
      <td><a href="#/change/${c.id}">${esc(c.title)}</a></td>
      <td><a href="#/publication/${c.publicationId}">${esc(c.publicationTitle || c.publicationId)}</a></td>
      <td>${esc(getConnectedAssigneeLabel(s, c.ownerId))}</td>
      ${deadlineCell}
      <td>${badge(c.materiality)}</td>
      <td>${badge(c.status)}</td>
      <td>${badge(c.applicabilityDecision || c.applicabilityRecommendation || 'Pending')}</td>
      ${provCell}
    </tr>`;
}

function viewChangesRegister() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const changes = connected ? getViewChanges() : scenarioFilter(s.changes);
  const uatChanges = connected ? getViewAuthorisedUatChanges() : [];
  const unverifiedChanges = connected ? getViewUnverifiedAuditChanges() : [];
  const changeProv = connected ? getConnectedChangeProvenance() : null;

  const createPanel =
    connected && isConnectedChangeWritesEnabled(s)
      ? (() => {
          const session = s.platformConfig?.backendSession;
          const uatModeEnabled = session?.authorisedUatChangeCreationEnabled === true;
          const modeOptions = `
            <label class="ri-radio"><input type="radio" name="create-change-mode" value="operational" data-create-change-mode checked /> Operational regulatory change</label>
            ${
              uatModeEnabled
                ? `<label class="ri-radio"><input type="radio" name="create-change-mode" value="uat_authorised" data-create-change-mode /> Authorised UAT / acceptance test</label>`
                : `<p class="ri-muted">Authorised UAT creation is disabled on this environment (requires staging flag and Compliance Manager role).</p>`
            }`;
          const pubOptions = getViewPublications()
            .map((p) => {
              const search = libraryPublicationSearchText(p);
              const ref = p.display?.reference || p.reference || p.id.slice(0, 8);
              const label = `${p.regulator || '—'} · ${ref} — ${p.title || p.id}`;
              return `<button type="button" class="ri-picker-option" role="option" data-create-change-pub-option data-pub-id="${esc(p.id)}" data-search="${esc(search)}">${esc(label)}</button>`;
            })
            .join('');
          const pubCount = getViewPublications().length;
          return `<section class="ri-panel ri-form ri-form--create-change" data-connected-create-change>
            <h2>Register regulatory change</h2>
            <p class="ri-muted">Choose creation mode — provenance is locked at registration and enforced server-side.</p>
            <fieldset class="ri-form__row ri-create-mode"><legend>Creation mode</legend>${modeOptions}</fieldset>
            <label class="ri-form__row">Publication
              <div class="ri-pub-combobox" data-create-change-pub-combobox>
                <input type="hidden" data-create-change-publication value="" />
                <button type="button" class="ri-pub-combobox__trigger" data-create-change-pub-trigger aria-haspopup="listbox" aria-expanded="false" aria-controls="create-change-pub-list">
                  <span data-create-change-pub-trigger-label>Select publication…</span>
                </button>
                <div class="ri-pub-combobox__menu" data-create-change-pub-menu hidden>
                  <input type="search" class="ri-search-full" data-create-change-publication-search placeholder="Search regulator, title, reference…" autocomplete="off" aria-controls="create-change-pub-list" />
                  <p class="ri-muted ri-pub-combobox__count" data-create-change-publication-count aria-live="polite">${pubCount} publication${pubCount === 1 ? '' : 's'} — type to filter</p>
                  <p class="ri-muted" data-create-change-publication-empty hidden>No publications match this search.</p>
                  <div class="ri-picker-list ri-picker-list--compact" id="create-change-pub-list" role="listbox" data-create-change-publication-list>${pubOptions || '<p class="ri-muted">No publications loaded yet.</p>'}</div>
                </div>
              </div>
              <p class="ri-muted ri-create-change-selected" data-create-change-publication-selected hidden aria-live="polite"></p>
            </label>
            <label class="ri-form__row">Title <input type="text" data-create-change-title required maxlength="500" placeholder="Change title" /></label>
            <label class="ri-form__row">Change type <input type="text" data-create-change-type value="Policy update" maxlength="200" /></label>
            <div class="ri-form__actions">
              <button type="button" class="ri-btn ri-btn--primary" data-connected-create-change-submit>Register change</button>
            </div>
          </section>`;
        })()
      : '';

  const subtitle = connected
    ? isConnectedChangeWritesEnabled(s)
      ? 'Tenant-scoped regulatory changes · connected writes enabled'
      : 'Tenant-scoped regulatory changes · connected read-only'
    : 'DEMO — first-class change records';

  if (connected && !isConnectedCatalogueReady(s)) {
    return `${pageHeader('Regulatory Changes', subtitle)}
      ${connectedCatalogueBanner(s)}
      <p class="ri-muted" data-connected-changes-loading="true">Loading tenant regulatory changes from staging catalogue…</p>`;
  }

  if (!connected) {
    const rows = changes.map(
      (c) => `<tr>
      <td><a href="#/change/${c.id}">${esc(c.externalKey || c.id.slice(0, 8))}</a></td>
      <td>${esc(c.title)}</td>
      <td><a href="#/publication/${c.publicationId}">${esc(c.publicationTitle || c.publicationId)}</a></td>
      <td>${esc(personName(s, c.ownerId) || '—')}</td>
      <td>${badge(c.materiality)}</td>
      <td>${badge(c.status)}</td>
      <td>${badge(c.applicabilityDecision || c.applicabilityRecommendation || 'Pending')}</td>
    </tr>`,
    );
    return `${pageHeader('Regulatory Changes', subtitle)}
    ${createPanel}
    ${rows.length ? dataTable(['Ref / ID', 'Title', 'Publication', 'Owner', 'Materiality', 'Status', 'Applicability'], rows) : emptyState('No tenant regulatory changes recorded for this organisation')}`;
  }

  const operationalRows = changes.map((c) => renderConnectedChangeRegisterRow(s, c));
  const uatRows = uatChanges.map((c) => renderConnectedChangeRegisterRow(s, c, { includeProvenance: true, includeDeadline: true }));
  const unverifiedRows = unverifiedChanges.map((c) => renderConnectedChangeRegisterRow(s, c, { includeProvenance: true, includeDeadline: true }));

  const provSummary = changeProv
    ? `<p class="ri-muted">Provenance (tenant changes loaded): operational <strong>${changeProv.operational ?? 0}</strong> · authorised UAT <strong>${changeProv.uatAuthorised ?? 0}</strong> · unverified audit <strong>${changeProv.unverified ?? 0}</strong> · synthetic excluded <strong>${changeProv.syntheticUat ?? 0}</strong></p>`
    : '';

  return `${pageHeader('Regulatory Changes', subtitle)}
    ${connectedCatalogueBanner(s)}
    ${connectedWorkModeBanner(s)}
    ${provSummary}
    ${createPanel}
    <section class="ri-panel"><h2>Operational changes</h2>
      <p class="ri-muted">Server-enforced operational scope — UAT-labelled and unverified tenant rows are excluded from compliance counters.</p>
      ${
        operationalRows.length
          ? dataTable(['Ref / ID', 'Title', 'Publication', 'Owner', 'Materiality', 'Status', 'Applicability'], operationalRows)
          : connectedRegisterEmpty('operational regulatory changes')
      }
    </section>
    <section class="ri-panel"><h2>Authorised UAT / audit changes</h2>
      <p class="ri-muted">Acceptance-test changes with trustworthy provenance (e.g. Phase 8D.3 Consumer Duty). Visible for audit; not counted as operational.</p>
      ${
        uatRows.length
          ? dataTable(
              ['Ref / ID', 'Title', 'Publication', 'Owner', 'Deadline', 'Materiality', 'Status', 'Applicability', 'Classification'],
              uatRows,
            )
          : emptyState('No authorised UAT regulatory changes on this tenant.')
      }
    </section>
    <section class="ri-panel"><h2>Unverified provenance (audit)</h2>
      <p class="ri-muted">Tenant rows without confirmed operational or UAT acceptance provenance. Shown for audit only — do not treat as operational compliance evidence.</p>
      ${
        unverifiedRows.length
          ? dataTable(
              ['Ref / ID', 'Title', 'Publication', 'Owner', 'Deadline', 'Materiality', 'Status', 'Applicability', 'Classification'],
              unverifiedRows,
            )
          : emptyState('No unverified tenant changes in the connected register.')
      }
    </section>`;
}

function viewVersion(id) {
  const blocked = guardConnectedDemoSubroute('Version intelligence', {
    subtitle: 'Design Lab demonstration only',
    links: `<p><a href="#/publication/${esc(id || '')}">Publication record</a> · <a href="#/library">Library</a></p>`,
  });
  if (blocked) return blocked;
  const p = getPublication(id);
  const s = getState();
  const diff = s.versionDiffs[id];
  if (!p || !diff) {
    return `${pageHeader('Version intelligence', 'DEMO')}<p class="ri-muted">No version comparison mock for this publication. Try PUB-001 or PUB-002.</p>
      <a href="#/publication/${id || 'PUB-001'}">Back to publication</a>`;
  }
  return `
    ${pageHeader('Version intelligence', `${p.title} — ${diff.provisionCount} provisions changed (simulated)`)}
    <div class="ri-version-grid">
      <div class="ri-panel"><h3>Previous</h3><p>${esc(diff.previousLabel)}</p>
        <ul>${diff.removed.map((x) => `<li class="ri-diff-remove">${esc(x)}</li>`).join('')}</ul>
      </div>
      <div class="ri-panel"><h3>Current</h3><p>${esc(diff.currentLabel)}</p>
        <ul>${diff.added.map((x) => `<li class="ri-diff-add">${esc(x)}</li>`).join('')}</ul>
        <ul>${diff.changed.map((x) => `<li class="ri-diff-change">${esc(x)}</li>`).join('')}</ul>
      </div>
    </div>
    <section class="ri-subsection"><h3>Downstream impact (mock)</h3>
      <p>Obligations: ${diff.affected.obligations.map((o) => linkRecord('Obligation', o, o)).join(', ')}</p>
      <p>Policies: ${diff.affected.policies.map((x) => linkRecord('Policy', x, x)).join(', ')}</p>
      <p>Risks: ${diff.affected.risks.map((x) => linkRecord('Risk', x, x)).join(', ')}</p>
      <p>Controls: ${diff.affected.controls.map((x) => linkRecord('Control', x, x)).join(', ')}</p>
      <p>Actions: ${diff.affected.actions.map((x) => linkRecord('Action', x, x)).join(', ')}</p>
    </section>`;
}

function viewApplicability(id) {
  const s = getState();
  if (isConnectedBackendActive(s)) {
    const p = getPublication(id);
    if (!p) return notFound('Publication', id);
    const assessment = p._detail?.applicability || p.applicability || null;
    return renderConnectedApplicabilityView(id, p, assessment);
  }
  const blocked = guardConnectedDemoSubroute('Applicability assessment', {
    links: `<p><a href="#/publication/${esc(id || '')}">Publication</a> · <a href="#/intake/${esc(id || '')}">Intake</a></p>`,
  });
  if (blocked) return blocked;
  const p = getPublication(id);
  if (!p) return notFound('Publication', id);
  const org = s.org;
  return `
    ${pageHeader('Applicability assessment', p.title)}
    ${aiRecommendation({
      recommendation: 'Applicable',
      confidence: p.applicabilityConfidence || 89,
      reasoning: `${org.name} provides retail financial products within the scope of the FCA Consumer Duty requirements.`,
      citation: id === 'PUB-001' ? 'FCA PS26/14 §3.12–3.18' : 'Mock handbook reference',
      pubId: id,
    })}
    <div class="ri-panel">
      <h3>Organisation regulatory profile (DEMO)</h3>
      <dl class="ri-dl">
        <dt>Organisation</dt><dd>${esc(org.name)}</dd>
        <dt>Legal entities</dt><dd>${org.entities.join(', ')}</dd>
        <dt>Jurisdictions</dt><dd>${org.jurisdictions.join(', ')}</dd>
        <dt>Regulators</dt><dd>${org.regulators.join(', ')}</dd>
        <dt>Activities</dt><dd>${org.activities.join(', ')}</dd>
      </dl>
    </div>
    <form class="ri-form" id="applicability-form" data-pub-id="${esc(id)}">
      <label>Decision<textarea name="justification" rows="3" placeholder="Justification if overriding…"></textarea></label>
      <div class="ri-form__actions">
        <button type="button" class="ri-btn ri-btn--primary" data-applicability="accept">Accept recommendation</button>
        <button type="button" class="ri-btn ri-btn--ghost" data-applicability="override-applicable">Override: Applicable</button>
        <button type="button" class="ri-btn ri-btn--ghost" data-applicability="override-possible">Override: Possibly Applicable</button>
        <button type="button" class="ri-btn ri-btn--ghost" data-applicability="override-na">Override: Not Applicable</button>
      </div>
    </form>`;
}

function filterAuditEvents(events) {
  const sid = getState().scenarioId;
  if (!sid || sid === 'all') return events;
  const typeGetters = {
    Publication: getPublication,
    'Regulatory Change': getChange,
    Change: getChange,
    'Impact Assessment': getAssessment,
    Obligation: getObligation,
    Risk: getRisk,
    Control: getControl,
    Policy: getPolicy,
    Action: getAction,
    Evidence: getEvidence,
  };
  return events.filter((e) => {
    const g = typeGetters[e.recordType];
    const rec = g?.(e.recordId);
    if (rec?.scenario) return rec.scenario === sid;
    if (e.relatedIds?.length) {
      return e.relatedIds.some((rid) => {
        const p = getPublication(rid);
        if (p) return p.scenario === sid;
        const c = getChange(rid);
        if (c) return c.scenario === sid;
        return false;
      });
    }
    return false;
  });
}

function filterCalendarEvents(events) {
  const s = getState();
  const sid = s.scenarioId;
  if (!sid || sid === 'all') return events;
  const matchId = (e) => {
    const map = {
      Publication: () => getPublication(e.recordId)?.scenario,
      'Impact Assessment': () => getAssessment(e.recordId)?.scenario,
      Obligation: () => getObligation(e.recordId)?.scenario,
      Action: () => getAction(e.recordId)?.scenario,
      Policy: () => getPolicy(e.recordId)?.scenario,
      'Regulatory Change': () => getChange(e.recordId)?.scenario,
    };
    return map[e.recordType]?.();
  };
  return events.filter((ev) => matchId(ev) === sid);
}

function viewAssessments() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const list = connected ? getViewImpactAssessments() : scenarioFilter(s.assessments);
  const rows = list.map(
    (a) => `<tr data-href="#/assessment/${a.id}" class="ri-row-link">
      <td><a href="#/assessment/${a.id}">${esc(a.externalKey || a.id.slice(0, 8))}</a></td>
      <td>${esc(a.title)}</td>
      <td>${a.changeId ? `<a href="#/change/${esc(a.changeId)}">${esc(a.changeTitle || a.changeId.slice(0, 8))}</a>` : '—'}</td>
      <td>${esc(a.ownerLabel || a.owner || '—')}</td>
      <td>${badge(a.materiality)}</td>
      <td>${badge(a.status)}</td>
      <td>${formatDate(a.dueDate)}</td>
    </tr>`,
  );
  return `${pageHeader('Impact Assessments', connected ? 'Tenant impact assessments · connected read-only' : 'DEMO register')}
    ${connected ? connectedCatalogueBanner(s) : ''}
    ${connected ? connectedWorkModeBanner(s) : ''}
    ${rows.length ? dataTable(['ID', 'Title', 'Change', 'Owner', 'Materiality', 'Status', 'Due'], rows) : emptyState('No impact assessments for this organisation')}`;
}

function viewAssessment(id) {
  const s = getState();
  const connectedActive = isConnectedBackendActive(s);
  const a = getAssessment(id);
  if (connectedActive && !a) {
    return `${connectedCatalogueBanner(s)}
      ${connectedWorkModeBanner(s)}
      <p class="ri-muted" data-connected-assessment-loading="true">Loading tenant impact assessment from staging…</p>`;
  }
  if (!a) return notFound('Impact Assessment', id);
  const connected = connectedActive && a._connected;
  const p = a.publicationId ? getPublication(a.publicationId) : null;
  if (connected) {
    return `${connectedCatalogueBanner(s)}
      ${connectedWorkModeBanner(s)}
      ${entityHero(a.id.slice(0, 8), a.title, [
        { label: 'Materiality', value: a.materiality, badge: true },
        { label: 'Status', value: a.status, badge: true },
        { label: 'Owner', value: a.ownerLabel || '—' },
        { label: 'Due', value: formatDate(a.dueDate) },
      ], [
        { label: 'Impact Assessments', href: '#/assessments' },
        { label: a.id.slice(0, 8) },
      ])}
      <p class="ri-muted">Change: ${a.changeId ? linkRecord('Regulatory Change', a.changeId, a.changeTitle || a.changeId) : '—'}</p>
      ${renderConnectedImpactEditPanel(id, a)}
      ${renderConnectedImpactWorkflowPanel(id)}
      <div class="ri-form__actions" hidden aria-hidden="true"></div>`;
  }
  const oblAi = renderIaObligationPanel(id, s);
  return `
    ${entityHero(a.id, a.title, [
      { label: 'Materiality', value: a.materiality, badge: true },
      { label: 'Status', value: a.status, badge: true },
      { label: 'Owner', value: personName(s, a.ownerId) || a.owner },
      { label: 'Due', value: formatDate(a.dueDate) },
      { label: 'Regulator', value: p?.regulator || '—' },
    ], [
      { label: 'Regulatory Intelligence', href: '#/dashboard' },
      { label: 'Impact Assessments', href: '#/assessments' },
      { label: a.id },
    ])}
    <p class="ri-muted">Originating: ${p ? linkRecord('Publication', p.id, p.title) : ''} · Change: ${a.changeId ? linkRecord('Regulatory Change', a.changeId, a.changeId) : '—'}</p>
    ${oblAi}
    <div class="ri-panel">
      <h3>FORGENIQ AI assessment (DEMO)</h3>
      <p>${esc(a.aiSummary)}</p>
      <p>Affected: ${a.policyIds?.length || 0} policies · ${a.controlIds?.length || 0} controls · ${a.riskIds?.length || 0} risks · ${a.processes?.length || 0} processes</p>
    </div>
    <dl class="ri-dl ri-dl--wide">
      <dt>Materiality</dt><dd>${badge(a.materiality)}</dd>
      <dt>Status</dt><dd>${badge(a.status)}</dd>
      <dt>Owner</dt><dd>${esc(a.owner)}</dd>
      <dt>Reviewer</dt><dd>${esc(a.reviewer)}</dd>
      <dt>Approver</dt><dd>${esc(a.approver)}</dd>
      <dt>Entities</dt><dd>${(a.entities || []).join(', ')}</dd>
      <dt>Business units</dt><dd>${(a.businessUnits || []).join(', ')}</dd>
    </dl>
    ${renderAssessmentGovernance(id)}
    <div class="ri-form__actions" data-assessment-id="${esc(id)}">
      <button type="button" class="ri-btn ri-btn--ghost" data-ia-action="draft">Save Draft</button>
      <button type="button" class="ri-btn ri-btn--primary" data-ia-action="review">Submit for Review</button>
      <button type="button" class="ri-btn ri-btn--primary" data-ia-action="approve">Approve</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-ia-action="reject">Reject</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-ia-action="back">Send Back</button>
    </div>
    <section class="ri-subsection"><h3>Linked policies</h3>
      <ul>${(a.policyIds || []).map((pid) => `<li>${linkRecord('Policy', pid, pid)}</li>`).join('')}</ul>
    </section>
    ${renderTraceSection('Impact Assessment', id)}`;
}

function viewObligations() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const obls = connected ? getViewObligations() : scenarioFilter(s.obligations);
  const portfolio = connected ? null : summarizeObligationPortfolio(obls);
  const rows = obls.map((o) => {
    const statement = o.title || o.statement || '';
    const snippet = statement.length > 60 ? `${statement.slice(0, 60)}…` : statement;
    return `<tr class="ri-row-link">
      <td><a href="#/obligation/${o.id}">${esc(o.externalKey || o.id.slice(0, 8))}</a></td>
      <td>${esc(snippet)}</td>
      <td>${o.publicationId ? `<a href="#/publication/${esc(o.publicationId)}">${esc(o.publicationTitle || o.publicationId.slice(0, 8))}</a>` : '—'}</td>
      <td>${esc(o.ownerLabel || o.owner || '—')}</td>
      <td>${badge(o.priority || '—')}</td>
      <td>${formatDate(o.effectiveDate)}</td>
      <td>${connected ? '—' : esc(o.coverage)}</td>
      <td>${badge(o.status)}</td>
    </tr>`;
  });
  return `${pageHeader('Obligations', connected ? 'Tenant obligations · connected read-only' : 'DEMO register')}
    ${connected ? connectedCatalogueBanner(s) : ''}
    ${connected ? connectedWorkModeBanner(s) : ''}
    ${
      connected
        ? ''
        : `<div class="ri-metrics-row">
      <span>Total <strong>${portfolio.counts.TOTAL}</strong></span>
      <span>${UI_LABEL_OPEN_OBLIGATIONS} <strong>${portfolio.counts.ACTIVE}</strong></span>
      <span>Draft <strong>${portfolio.counts.DRAFT}</strong></span>
      <span>In review <strong>${portfolio.counts.REVIEW}</strong></span>
      <span>Overdue (active) <strong>${portfolio.flags.overdueActive}</strong></span>
      <span>High <strong>${obls.filter((o) => o.priority === 'High').length}</strong></span>
    </div>`
    }
    ${rows.length ? dataTable(['ID', 'Statement', 'Source', 'Owner', 'Priority', 'Effective', 'Coverage', 'Status'], rows) : emptyState('No obligations for this organisation')}`;
}

function viewObligation(id) {
  const o = getObligation(id);
  if (!o) return notFound('Obligation', id);
  const s = getState();
  const connected = isConnectedBackendActive(s) && o._connected;
  if (connected) {
    const riskLinks = (o.risks || []).length
      ? o.risks
      : (o.riskIds || []).map((rid) => ({ id: rid, title: rid }));
    const controlLinks = (o.controls || []).length
      ? o.controls
      : (o.controlIds || []).map((cid) => ({ id: cid, name: cid }));
    const riskSection = riskLinks.length
      ? `<section class="ri-panel"><h3>Linked risks</h3><ul>${riskLinks
          .map((x) => `<li><a href="#/risk/${esc(x.id)}">${esc(x.title || x.id.slice(0, 8))}</a></li>`)
          .join('')}</ul></section>`
      : '<section class="ri-panel"><h3>Linked risks</h3><p class="ri-muted">No risks linked yet.</p></section>';
    const controlSection = controlLinks.length
      ? `<section class="ri-panel"><h3>Linked controls</h3><ul>${controlLinks
          .map((x) => `<li><a href="#/control/${esc(x.id)}">${esc(x.name || x.id.slice(0, 8))}</a></li>`)
          .join('')}</ul></section>`
      : '<section class="ri-panel"><h3>Linked controls</h3><p class="ri-muted">No controls linked directly to this obligation.</p></section>';
    return `${connectedCatalogueBanner(s)}
      ${connectedWorkModeBanner(s)}
      ${pageHeader(o.title || o.statement, o.externalKey || o.id.slice(0, 8))}
      <dl class="ri-dl">
        <dt>Status</dt><dd>${badge(o.status)}</dd>
        <dt>Priority</dt><dd>${badge(o.priority || '—')}</dd>
        <dt>Owner</dt><dd>${esc(o.ownerLabel || '—')}</dd>
        <dt>Effective</dt><dd>${formatDate(o.effectiveDate)}</dd>
        <dt>Due</dt><dd>${formatDate(o.dueDate)}</dd>
        <dt>Citation</dt><dd>${esc(o.citation || '—')}</dd>
        <dt>Change</dt><dd>${o.changeId ? linkRecord('Regulatory Change', o.changeId, o.changeTitle || o.changeId) : '—'}</dd>
        <dt>Publication</dt><dd>${o.publicationId ? linkRecord('Publication', o.publicationId, o.publicationTitle || o.publicationId) : '—'}</dd>
      </dl>
      ${riskSection}
      ${controlSection}
      ${renderConnectedObligationEditPanel(id, o)}
      ${renderConnectedObligationLinkPanel(id, o)}
      ${renderConnectedObligationWorkflowPanel(id)}`;
  }
  const lineage = [
    { type: 'Publication', id: o.publicationId, label: o.publicationId },
    { type: 'Obligation', id: o.id, label: o.id },
    ...(o.policyIds || []).map((pid) => ({ type: 'Policy', id: pid, label: pid })),
    ...(o.riskIds || []).map((rid) => ({ type: 'Risk', id: rid, label: rid })),
    ...(o.controlIds || []).map((cid) => ({ type: 'Control', id: cid, label: cid })),
    ...(o.actionIds || []).map((aid) => ({ type: 'Action', id: aid, label: aid })),
    ...(o.evidenceIds || []).map((eid) => ({ type: 'Evidence', id: eid, label: eid })),
  ];
  return `
    ${pageHeader(o.statement, o.id)}
    <dl class="ri-dl">
      <dt>Source</dt><dd>${linkRecord('Publication', o.publicationId, o.publicationId)} · ${esc(o.citation)}</dd>
      <dt>Owner</dt><dd>${esc(o.owner)}</dd>
      <dt>Priority</dt><dd>${badge(o.priority)}</dd>
      <dt>Effective</dt><dd>${formatDate(o.effectiveDate)}</dd>
      <dt>Implementation</dt><dd>${badge(o.status)} · Coverage: ${esc(o.coverage)}</dd>
    </dl>
    <blockquote class="ri-source-quote">${esc(o.sourceText)}</blockquote>
    <h3>Lineage</h3>
    ${traceChain(lineage)}
    <section class="ri-subsection"><h3>Actions</h3>
      <ul>${(o.actionIds || []).map((aid) => `<li>${linkRecord('Action', aid, getAction(aid)?.description || aid)}</li>`).join('')}</ul>
    </section>
    ${renderObligationCoveragePanel(id)}
    ${renderTraceSection('Obligation', id)}`;
}

function viewRisks() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const list = connected ? getViewRisks() : scenarioFilter(s.risks);
  const uatList = connected ? getViewAuthorisedUatRisks() : [];
  const rows = list.map(
    (r) => `<tr><td><a href="#/risk/${r.id}">${esc(r.externalKey || r.id.slice(0, 8))}</a></td><td>${esc(r.title)}</td><td>${esc(r.category || '—')}</td>
      <td>${esc(r.owner || r.ownerLabel || '—')}</td><td>${esc(r.inherentRisk || '—')}</td><td>${esc(r.residualRisk || '—')}</td><td>${badge(r.status)}</td></tr>`,
  );
  const uatRows = uatList.map(
    (r) => `<tr><td><a href="#/risk/${r.id}">${esc(r.externalKey || r.id.slice(0, 8))}</a></td><td>${esc(r.title)}</td><td>${badge(r.dataProvenance || 'uat_authorised')}</td>
      <td>${esc(r.owner || r.ownerLabel || '—')}</td><td>${badge(r.status)}</td></tr>`,
  );
  const uatSection = connected
    ? `<section class="ri-panel"><h2>Authorised UAT risks</h2>
        <p class="ri-muted">Excluded from operational dashboard metrics; open a row to view full detail and audit.</p>
        ${
          uatRows.length
            ? dataTable(['ID', 'Title', 'Provenance', 'Owner', 'Status'], uatRows)
            : '<p class="ri-muted">No authorised UAT risks in this tenant.</p>'
        }</section>`
    : '';
  return `${pageHeader('Risks', connected ? 'Tenant regulatory risks · connected' : 'Regulatory-linked register · DEMO')}
    ${connected ? connectedCatalogueBanner(s) : ''}
    ${connected ? connectedWorkModeBanner(s) : ''}
    ${connected ? renderConnectedRiskCreateBanner() : ''}
    <section class="ri-panel"><h2>Operational risk register</h2>
    ${rows.length ? dataTable(['ID', 'Title', 'Category', 'Owner', 'Inherent', 'Residual', 'Status'], rows) : connected ? connectedRegisterEmpty('risks') : dataTable(['ID', 'Title', 'Category', 'Owner', 'Inherent', 'Residual', 'Status'], rows)}
    </section>
    ${uatSection}`;
}

function viewRisk(id) {
  const r = getRisk(id);
  if (!r) return notFound('Risk', id);
  const s = getState();
  const connected = isConnectedBackendActive(s) && r._connected;
  if (connected) {
    const controls = (r.controlIds || [])
      .map((cid) => {
        const c = getControl(cid);
        const label = c?.name || c?.title || `${String(cid).slice(0, 8)}…`;
        return `<li><a href="#/control/${esc(cid)}">${esc(label)}</a> <span class="ri-muted ri-mono" title="${esc(cid)}">${esc(String(cid).slice(0, 8))}…</span></li>`;
      })
      .join('');
    const obligations = (r.obligationIds || [])
      .map((oid) => `<li><a href="#/obligation/${esc(oid)}">${esc(String(oid).slice(0, 8))}…</a></li>`)
      .join('');
    return `${connectedCatalogueBanner(s)}
      ${connectedWorkModeBanner(s)}
      ${pageHeader(r.title, r.id.slice(0, 8))}
      <p>${esc(r.description || '—')}</p>
      <dl class="ri-dl">
        <dt>Data provenance</dt><dd>${badge(r.dataProvenance || '—')}</dd>
        <dt>Lab class</dt><dd>${esc(r.labClassificationLabel || r.labClassification || '—')}</dd>
        <dt>Category</dt><dd>${esc(r.category || '—')}</dd>
        <dt>Owner</dt><dd>${esc(r.owner || '—')}</dt><dt>Status</dt><dd>${badge(r.status)}</dd>
        <dt>Inherent / residual</dt><dd>${esc(r.inherentRisk || '—')} / ${esc(r.residualRisk || '—')}</dd>
        <dt>Review date</dt><dd>${formatDate(r.reviewDate)}</dd></dl>
      ${renderConnectedRiskEditPanel(id, r)}
      <section><h3>Linked obligations</h3>${obligations ? `<ul>${obligations}</ul>` : '<p class="ri-muted">No linked obligations.</p>'}</section>
      <section class="ri-panel"><h3>Linked controls</h3>${controls ? `<ul>${controls}</ul>` : '<p class="ri-muted">No linked controls.</p>'}</section>
      ${renderConnectedRiskLinkPanel(id)}
      ${renderConnectedRiskWorkflowPanel(id)}`;
  }
  let why = '';
  if (r.originatingChangeId) {
    const ch = getChange(r.originatingChangeId);
    const p = ch ? getPublication(ch.publicationId) : null;
    why = `<h3>Why does this risk exist?</h3><p>${p ? linkRecord('Publication', p.id, p.title) : ''} → ${ch ? linkRecord('Regulatory Change', ch.id, ch.id) : ''} → ${r.originatingObligationId ? linkRecord('Obligation', r.originatingObligationId, r.originatingObligationId) : ''} → ${esc(r.title)}</p>`;
  }
  return `${pageHeader(r.title, r.id)}<p>${esc(r.description)}</p>${why}
    <section><h3>Linked controls</h3><ul>${(r.controlIds || []).map((c) => `<li>${linkRecord('Control', c, c)}</li>`).join('')}</ul></section>
    ${renderTraceSection('Risk', id)}`;
}

function viewControls() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const list = connected ? getViewControls() : scenarioFilter(s.controls);
  const uatList = connected ? getViewAuthorisedUatControls() : [];
  const rows = list.map(
    (c) => `<tr><td><a href="#/control/${c.id}">${esc(c.externalKey || c.id.slice(0, 8))}</a></td><td>${esc(c.name)}</td><td>${esc(c.owner || '—')}</td>
      <td>${esc(c.frequency || '—')}</td><td>${esc(c.effectiveness || '—')}</td><td>${esc(c.testingStatus || '—')}</td></tr>`,
  );
  const uatRows = uatList.map(
    (c) => `<tr><td><a href="#/control/${c.id}">${esc(c.externalKey || c.id.slice(0, 8))}</a></td><td>${esc(c.name)}</td><td>${badge(c.dataProvenance || 'uat_authorised')}</td>
      <td>${esc(c.owner || '—')}</td><td>${esc(c.testingStatus || '—')}</td></tr>`,
  );
  const uatSection = connected
    ? `<section class="ri-panel"><h2>Authorised UAT controls</h2>
        <p class="ri-muted">Excluded from operational dashboard counts when using <code>dataScope=operational</code>.</p>
        ${
          uatRows.length
            ? dataTable(['ID', 'Name', 'Provenance', 'Owner', 'Testing'], uatRows)
            : '<p class="ri-muted">No authorised UAT controls in this tenant.</p>'
        }</section>`
    : '';
  return `${pageHeader('Controls', connected ? 'Tenant controls · connected' : 'Control library · DEMO')}
    ${connected ? connectedCatalogueBanner(s) : ''}
    ${connected ? connectedWorkModeBanner(s) : ''}
    ${connected ? renderConnectedControlCreateBanner() : ''}
    <section class="ri-panel"><h2>Operational control register</h2>
    ${rows.length ? dataTable(['ID', 'Name', 'Owner', 'Frequency', 'Effectiveness', 'Testing'], rows) : connected ? connectedRegisterEmpty('controls') : dataTable(['ID', 'Name', 'Owner', 'Frequency', 'Effectiveness', 'Links'], rows)}
    </section>
    ${uatSection}`;
}

function viewControl(id) {
  const s = getState();
  const c = getControl(id);
  if (!c) return notFound('Control', id);
  const connected = isConnectedBackendActive(s) && c._connected;
  if (connected) {
    const risks = (c.riskIds || [])
      .map((rid) => `<li><a href="#/risk/${esc(rid)}">${esc(String(rid).slice(0, 8))}…</a></li>`)
      .join('');
    const obls = (c.obligationIds || [])
      .map((oid) => `<li><a href="#/obligation/${esc(oid)}">${esc(String(oid).slice(0, 8))}…</a></li>`)
      .join('');
    const evidence = (c.evidenceIds || [])
      .map((eid) => `<li><a href="#/evidence/${esc(eid)}">${esc(String(eid).slice(0, 8))}…</a></li>`)
      .join('');
    return `${connectedCatalogueBanner(s)}
      ${connectedWorkModeBanner(s)}
      ${pageHeader(c.name, c.id.slice(0, 8))}
      <p>${esc(c.description || '—')}</p>
      <dl class="ri-dl">
        <dt>Data provenance</dt><dd>${badge(c.dataProvenance || '—')}</dd>
        <dt>Lab class</dt><dd>${esc(c.labClassificationLabel || c.labClassification || '—')}</dd>
        <dt>Owner</dt><dd>${esc(c.owner || '—')}</dd>
        <dt>Control type</dt><dd>${esc(c.controlType || '—')}</dd>
        <dt>Frequency</dt><dd>${esc(c.frequency || '—')}</dd>
        <dt>Effectiveness</dt><dd>${esc(c.effectiveness || 'Not assessed')}</dd>
        <dt>Testing status</dt><dd>${esc(c.testingStatus || 'Not assessed')}</dd>
        <dt>Status</dt><dd>${badge(c.status)}</dd>
      </dl>
      ${renderConnectedControlEditPanel(id, c)}
      <section><h3>Linked risks</h3>${risks ? `<ul>${risks}</ul>` : '<p class="ri-muted">No linked risks.</p>'}</section>
      <section><h3>Linked obligations</h3>${obls ? `<ul>${obls}</ul>` : '<p class="ri-muted">No linked obligations.</p>'}</section>
      <section><h3>Linked evidence</h3>${evidence ? `<ul>${evidence}</ul>` : '<p class="ri-muted">No linked evidence.</p>'}</section>
      ${renderConnectedControlWorkflowPanel(id)}`;
  }
  const tests = (s.controlTests || []).filter((t) => t.controlId === id);
  const testList = tests.length
    ? `<section><h3>Control tests</h3><ul>${tests.map((t) => `<li><a href="#/control-test/${esc(t.id)}">${esc(t.id)}</a> — ${badge(t.result)} (${esc(t.testPeriod)})</li>`).join('')}</ul></section>`
    : '';
  const govMeta = c.effectivenessStatus
    ? `<p>Effectiveness: ${badge(c.effectivenessStatus)} · Next review: ${formatDate(c.nextReviewDate)}</p>`
    : '';
  return `${pageHeader(c.name, c.id)}<p>${esc(c.description)}</p>${govMeta}
    <h3>Why does this control exist?</h3>
    <p class="ri-muted">Use traceability below to navigate to publication and regulatory change.</p>
    <section><h3>Obligations satisfied</h3><ul>${(c.obligationIds || []).map((o) => `<li>${linkRecord('Obligation', o, o)}</li>`).join('')}</ul></section>
    ${testList}
    ${renderControlAssurancePanel(id)}
    ${renderTraceSection('Control', id)}`;
}

function viewPolicies() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const writes = connected && isConnectedPolicyWritesEnabled(s);
  const list = connected ? getViewPolicies() : scenarioFilter(s.policies);
  const rows = list.map(
    (p) => `<tr><td><a href="#/policy/${p.id}">${esc(p.externalKey || p.id.slice(0, 8))}</a></td><td>${esc(p.name)}</td><td>${esc(p.owner || '—')}</td>
      <td>v${esc(p.version || '—')}</td><td>${badge(p.status)}</td><td>${formatDate(p.nextReviewDate)}</td></tr>`,
  );
  const subtitle = connected
    ? writes
      ? 'Tenant policies · connected read/write when enabled'
      : 'Tenant policies · connected read-only'
    : 'DEMO';
  return `${pageHeader('Policies', subtitle)}
    ${connected ? connectedCatalogueBanner(s) : ''}
    ${connected ? (writes ? connectedWorkModeBanner(s) : connectedReadOnlyGovernanceBanner()) : ''}
    ${writes ? renderConnectedPolicyCreatePanel() : ''}
    ${rows.length ? dataTable(['ID', 'Name', 'Owner', 'Version', 'Status', 'Next review'], rows) : connected ? connectedRegisterEmpty('policies') : dataTable(['ID', 'Name', 'Owner', 'Version', 'Status', 'Alerts'], rows)}`;
}

function viewPolicy(id) {
  const p = getPolicy(id);
  if (!p) return notFound('Policy', id);
  const s = getState();
  const writes = isConnectedBackendActive(s) && isConnectedPolicyWritesEnabled(s);
  if (isConnectedBackendActive(s) && p._connected) {
    return `${connectedCatalogueBanner(s)}
      ${writes ? connectedWorkModeBanner(s) : connectedReadOnlyGovernanceBanner()}
      ${pageHeader(p.name, p.id.slice(0, 8))}
      ${writes ? renderConnectedPolicyEditPanel(p) : ''}
      <dl class="ri-dl"><dt>Owner</dt><dd>${esc(p.owner || '—')}</dd><dt>Version</dt><dd>${esc(p.version || '—')}</dd>
        <dt>Status</dt><dd>${badge(p.status)}</dd><dt>Next review</dt><dd>${formatDate(p.nextReviewDate)}</dd></dl>`;
  }
  const alert = p.reviewRecommended
    ? `<div class="ri-alert">Policy review recommended — ${esc(p.reviewReason)}</div>`
    : '';
  return `${pageHeader(p.name, p.id)}${alert}
    <dl class="ri-dl"><dt>Owner</dt><dd>${esc(p.owner)}</dd><dt>Version</dt><dd>${esc(p.version)}</dd>
    <dt>Next review</dt><dd>${formatDate(p.nextReview)}</dd></dl>
    <h3>Version history (mock)</h3>
    <ul>${(p.versionHistory || []).map((v) => `<li>v${esc(v.version)} — ${formatDate(v.date)} — ${esc(v.author)}</li>`).join('')}</ul>
    ${renderTraceSection('Policy', id)}`;
}

function viewActions() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const writes = connected && isConnectedActionWritesEnabled(s);
  const list = connected ? getViewActions() : scenarioFilter(s.actions);
  const uatList = connected ? getViewAuthorisedUatActions() : [];
  const rows = list.map((a) => {
    const cls = a.overdue || a.status === 'Overdue' ? 'ri-row--danger' : a.status === 'Due Soon' ? 'ri-row--warn' : '';
    const desc = a.description || a.title || '';
    return `<tr class="${cls}"><td><a href="#/action/${a.id}">${esc(a.externalKey || a.id.slice(0, 8))}</a></td><td>${esc(desc)}</td>
      <td>${esc(a.sourceType || '—')}</td><td>${esc(a.owner || '—')}</td><td>${badge(a.priority || '—')}</td>
      <td>${formatDate(a.dueDate)}</td><td>${badge(a.status)}</td></tr>`;
  });
  const uatRows = uatList.map(
    (a) => `<tr><td><a href="#/action/${a.id}">${esc(a.externalKey || a.id.slice(0, 8))}</a></td><td>${esc(a.title || a.description || '')}</td><td>${badge(a.dataProvenance || 'uat_authorised')}</td>
      <td>${esc(a.owner || '—')}</td><td>${formatDate(a.dueDate)}</td><td>${badge(a.status)}</td></tr>`,
  );
  const uatSection = connected
    ? `<section class="ri-panel"><h2>Authorised UAT remediation actions</h2>
        <p class="ri-muted">Excluded from operational governance metrics when <code>dataScope=operational</code>.</p>
        ${
          uatRows.length
            ? dataTable(['ID', 'Title', 'Provenance', 'Owner', 'Due', 'Status'], uatRows)
            : '<p class="ri-muted">No authorised UAT actions in this tenant yet.</p>'
        }</section>`
    : '';
  const subtitle = connected
    ? writes
      ? 'Tenant remediation actions · connected read/write when enabled'
      : 'Tenant remediation actions · connected read-only'
    : 'DEMO';
  return `${pageHeader('Issues & Actions', subtitle)}
    ${connected ? connectedCatalogueBanner(s) : ''}
    ${connected ? (writes ? connectedWorkModeBanner(s) : connectedReadOnlyGovernanceBanner()) : ''}
    ${writes ? renderConnectedActionCreateBanner() : ''}
    <section class="ri-panel"><h2>Operational action register</h2>
    ${rows.length ? dataTable(['ID', 'Description', 'Source', 'Owner', 'Priority', 'Due', 'Status'], rows) : connected ? connectedRegisterEmpty('actions') : dataTable(['ID', 'Description', 'Source', 'Owner', 'Priority', 'Due', 'Status'], rows)}
    </section>
    ${uatSection}`;
}

function viewAction(id) {
  const a = getAction(id);
  if (!a) return notFound('Action', id);
  const s = getState();
  const writes = isConnectedActionWritesEnabled(s);
  if (isConnectedBackendActive(s) && a._connected) {
    const obligations = (a.obligationIds || [])
      .map((oid) => `<li><a href="#/obligation/${esc(oid)}">${esc(String(oid).slice(0, 8))}…</a></li>`)
      .join('');
    const controls = (a.controlIds || [])
      .map((cid) => {
        const c = getControl(cid);
        const label = c?.name || c?.title || `${String(cid).slice(0, 8)}…`;
        return `<li><a href="#/control/${esc(cid)}">${esc(label)}</a></li>`;
      })
      .join('');
    return `${connectedCatalogueBanner(s)}
      ${writes ? connectedWorkModeBanner(s) : connectedReadOnlyGovernanceBanner()}
      ${entityHero(a.id.slice(0, 8), a.title || a.description, [
        { label: 'Status', value: a.status, badge: true },
        { label: 'Priority', value: a.priority || '—', badge: true },
        { label: 'Owner', value: a.owner || '—' },
        { label: 'Due', value: formatDate(a.dueDate) },
        { label: 'Provenance', value: a.dataProvenance || '—', badge: true },
      ])}
      <dl class="ri-dl">
        <dt>Lab class</dt><dd>${esc(a.labClassificationLabel || a.labClassification || '—')}</dd>
        <dt>Description</dt><dd>${esc(a.description || '—')}</dd>
      </dl>
      <section><h3>Linked obligations</h3>${obligations ? `<ul>${obligations}</ul>` : '<p class="ri-muted">No linked obligations.</p>'}</section>
      <section><h3>Linked controls</h3>${controls ? `<ul>${controls}</ul>` : '<p class="ri-muted">No linked controls.</p>'}</section>
      ${writes ? renderConnectedActionEditPanel(id, a) : '<p class="ri-muted">Assignment and status changes are disabled when action writes are off.</p>'}
      ${renderConnectedActionWorkflowPanel(id)}`;
  }
  return `${entityHero(a.id, a.description, [
      { label: 'Status', value: a.status, badge: true },
      { label: 'Priority', value: a.priority, badge: true },
      { label: 'Owner', value: personName(s, a.ownerId) || a.owner },
      { label: 'Due', value: formatDate(a.dueDate) },
    ], [
      { label: 'Regulatory Intelligence', href: '#/dashboard' },
      { label: 'Issues & Actions', href: '#/actions' },
      { label: a.id },
    ])}
    <dl class="ri-dl"><dt>Owner</dt><dd>${esc(personName(s, a.ownerId) || a.owner)}</dd><dt>Source</dt><dd>${esc(a.sourceType)} ${esc(a.sourceId || '')}</dd>
    <dt>Due</dt><dd>${formatDate(a.dueDate)}</dd><dt>Status</dt><dd>${badge(a.status)}</dd></dl>
    <div class="ri-form ri-form--inline" data-action-assign="${esc(id)}">
      <label>Reassign to <select data-action-owner>${(s.people || []).map((p) => `<option value="${esc(p.id)}"${p.id === a.ownerId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>Due date <input type="date" data-action-due value="${esc(a.dueDate || '')}" /></label>
      <button type="button" class="ri-btn ri-btn--sm ri-btn--primary" data-save-action-assign>Save assignment</button>
    </div>
    <label>Update status
      <select id="action-status" data-action-id="${esc(id)}">
        ${['Not Started', 'In Progress', 'Complete', 'Blocked', 'Overdue'].map((st) => `<option${st === a.status ? ' selected' : ''}>${st}</option>`).join('')}
      </select>
    </label>
    <button type="button" class="ri-btn ri-btn--primary" data-save-action-status>Save status</button>
    <section><h3>Evidence</h3><ul>${(a.evidenceIds || []).map((e) => `<li>${linkRecord('Evidence', e, e)}</li>`).join('') || '<li class="ri-muted">None linked</li>'}</ul></section>
    ${renderTraceSection('Action', id)}`;
}

function viewEvidenceList() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const writes = connected && isConnectedEvidenceWritesEnabled(s);
  const list = connected ? getViewEvidence() : scenarioFilter(s.evidence);
  const rows = list.map(
    (e) => `<tr><td><a href="#/evidence/${e.id}">${esc(e.externalKey || e.id.slice(0, 8))}</a></td><td>${esc(e.title || e.fileName || '—')}</td>
      <td>${esc(e.evidenceType || '—')}</td><td>${formatDate(e.createdAt || e.uploadedDate)}</td><td>${connected ? '—' : badge(e.approvalStatus)}</td></tr>`,
  );
  const subtitle = connected
    ? writes
      ? 'Tenant evidence · connected read/write when enabled'
      : 'Tenant evidence · connected read-only'
    : 'DEMO';
  return `${pageHeader('Evidence', subtitle)}
    ${connected ? connectedCatalogueBanner(s) : ''}
    ${connected ? (writes ? connectedWorkModeBanner(s) : connectedReadOnlyGovernanceBanner()) : ''}
    ${writes ? renderConnectedEvidenceCreatePanel() : ''}
    ${rows.length ? dataTable(['ID', 'Title', 'Type', 'Date', 'Status'], rows) : connected ? connectedRegisterEmpty('evidence items') : dataTable(['ID', 'File', 'Type', 'Date', 'Status'], rows)}`;
}

function viewEvidenceDetail(id) {
  const s = getState();
  const connectedActive = isConnectedBackendActive(s);
  const e = getEvidence(id);
  if (connectedActive && !e) {
    return `${connectedCatalogueBanner(s)}
      ${connectedReadOnlyGovernanceBanner(s)}
      <p class="ri-muted" data-connected-evidence-loading="true">Loading tenant evidence from staging…</p>`;
  }
  if (!e) return notFound('Evidence', id);
  if (connectedActive && e._connected) {
    return `${connectedCatalogueBanner(s)}
      ${connectedReadOnlyGovernanceBanner(s)}
      ${pageHeader(e.title || e.id.slice(0, 8), e.id.slice(0, 8))}
      <dl class="ri-dl"><dt>Type</dt><dd>${esc(e.evidenceType)}</dd>
        <dt>Source hash</dt><dd class="ri-mono">${esc(e.sourceHash || '—')}</dd>
        <dt>Recorded</dt><dd>${formatDate(e.createdAt)}</dd></dl>
      ${renderConnectedEvidenceUploadPanel(id)}
      ${renderConnectedEvidenceWorkflowPanel()}`;
  }
  return `${pageHeader(e.fileName, e.id)}
    <p class="ri-muted">DEMO — no real file storage</p>
    <dl class="ri-dl">
      <dt>Type</dt><dd>${esc(e.evidenceType)}</dd>
      <dt>Uploaded by</dt><dd>${esc(e.uploadedBy)}</dd>
      <dt>Control</dt><dd>${e.controlId ? linkRecord('Control', e.controlId, e.controlId) : '—'}</dd>
      <dt>Action</dt><dd>${e.actionId ? linkRecord('Action', e.actionId, e.actionId) : '—'}</dd>
      <dt>Obligation</dt><dd>${e.obligationId ? linkRecord('Obligation', e.obligationId, e.obligationId) : '—'}</dd>
      <dt>Regulation</dt><dd>${e.publicationId ? linkRecord('Publication', e.publicationId, e.publicationId) : '—'}</dd>
    </dl>
    <p>Assurance: ${badge(getEvidenceAssuranceStatus(e))}</p>
    ${renderEvidenceAssurancePanel(id)}
    <div class="ri-form__actions" data-evidence-id="${esc(id)}">
      <button type="button" class="ri-btn ri-btn--primary" data-evidence-accept>Accept evidence</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-evidence-reject>Reject</button>
    </div>
    <button type="button" class="ri-btn ri-btn--ghost" data-proto-toast="Mock preview opened">Preview / Open</button>
    <h3>Supports</h3>
    <p>Evidence → Action → Control → Obligation → Regulation (navigate via links above)</p>
    ${renderTraceSection('Evidence', id)}`;
}

function horizonEventDates(pub) {
  return [pub.consultationDeadline, pub.effectiveDate].filter(Boolean);
}

function pubMatchesHorizonWindow(pub, windowDays) {
  return horizonEventDates(pub).some((d) => isWithinForwardDateWindow(d, windowDays));
}

function viewHorizon() {
  const s = getState();
  if (isConnectedBackendActive(s)) {
    const ready = assertConnectedCatalogueReady(s);
    if (!ready.ok) return ready.html;
    const defaultWindow = 90;
    const upcoming = getViewPublications().filter((p) => pubMatchesHorizonWindow(p, defaultWindow));
    return `${pageHeader('Horizon Scanning', 'Catalogue dates · connected read-only')}
      ${connectedCatalogueBanner(s)}
      <p class="ri-muted">Shows publication consultation and effective dates from the staging catalogue. FORGENIQ Outlook narrative and demo confidence scores are not shown in Connected mode.</p>
      <p class="ri-muted" id="horizon-window-count">${upcoming.length} publication(s) with dates in the next ${defaultWindow} days</p>
      <ul class="ri-list-compact" id="horizon-event-list">
        ${
          upcoming.length
            ? upcoming
                .map((p) => {
                  const dates = horizonEventDates(p).filter((d) => isWithinForwardDateWindow(d, defaultWindow));
                  return `<li data-horizon-item data-horizon-dates="${esc(dates.join(','))}"><a href="#/publication/${p.id}">${esc(p.regulator)} — ${esc(p.title)}</a> · Consultation ${formatDate(p.consultationDeadline)} · Effective ${formatDate(p.effectiveDate)}</li>`;
                })
                .join('')
            : '<li class="ri-muted">No catalogue publications with forward dates in this window.</li>'
        }
      </ul>
      <p><a href="#/library">Publications Library</a></p>`;
  }
  const defaultWindow = 90;
  const upcoming = scenarioFilter(s.publications).filter((p) => pubMatchesHorizonWindow(p, defaultWindow));
  return `${pageHeader('Horizon Scanning', 'Forward-looking regulatory view · DEMO')}
    <div class="ri-panel"><h3>FORGENIQ Outlook</h3><p>${esc(s.horizonOutlook.summary)}</p>
    <p class="ri-muted">Confidence ${s.horizonOutlook.confidence}% · Window from ${formatDate(DEMO_TODAY)}</p></div>
    <div class="ri-toolbar">
      <select class="ri-select" id="horizon-window"><option value="30">30 days</option><option value="90" selected>90 days</option><option value="180">6 months</option><option value="365">12 months</option></select>
      <button type="button" class="ri-btn ri-btn--sm is-active" data-horizon-view="month">Month</button>
      <button type="button" class="ri-btn ri-btn--sm" data-horizon-view="quarter">Quarter</button>
      <button type="button" class="ri-btn ri-btn--sm" data-horizon-view="year">Year</button>
    </div>
    <p class="ri-muted" id="horizon-window-count">${upcoming.length} publication(s) with dates in the next ${defaultWindow} days</p>
    <ul class="ri-list-compact" id="horizon-event-list">
      ${upcoming.map((p) => {
        const dates = horizonEventDates(p).filter((d) => isWithinForwardDateWindow(d, defaultWindow));
        return `<li data-horizon-item data-horizon-dates="${esc(dates.join(','))}"><a href="#/publication/${p.id}">${esc(p.regulator)} — ${esc(p.title)}</a> · Consultation ${formatDate(p.consultationDeadline)} · Effective ${formatDate(p.effectiveDate)}</li>`;
      }).join('')}
    </ul>`;
}

function viewLibrary() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  const rows = getViewPublications().map((p) => {
    const search = libraryPublicationSearchText(p);
    if (connected) {
      const c = connectedLibraryRowCells(p);
      if (!c) {
        return `<tr data-library-row data-search="${esc(search)}"><td colspan="9" class="ri-muted">Missing display mapping for ${esc(p.id)}</td></tr>`;
      }
      return `<tr data-library-row data-search="${esc(search)}"><td>${esc(p.regulator)}</td><td><a href="#/publication/${p.id}">${esc(p.title)}</a>${c.fixtureNote || ''}</td>
      <td>${esc(c.reference)}</td><td>${esc(c.publicationType)}</td><td>${esc(c.topic)}</td>
      <td>${c.published}</td><td>${c.effective}</td>
      <td>${esc(c.version)}</td><td>${esc(c.status)}</td></tr>`;
    }
    return `<tr data-library-row data-search="${esc(search)}"><td>${esc(p.regulator)}</td><td><a href="#/publication/${p.id}">${esc(p.title)}</a></td>
      <td>${esc(p.reference)}</td><td>${esc(p.publicationType)}</td><td>${esc(p.topic)}</td>
      <td>${formatDate(p.publishedDate)}</td><td>${formatDate(p.effectiveDate)}</td>
      <td>1.0</td><td>${p.workflowStatus === 'Complete' ? 'Current' : 'Changed'}</td></tr>`;
  });
  return `${pageHeader('Regulatory Library', connected ? 'Global catalogue · connected read-only' : 'Source of truth · DEMO')}
    ${connected ? connectedCatalogueBanner(s) : ''}
    <input type="search" class="ri-search-full" placeholder="Search title, reference, regulator, topic…" id="library-search" aria-controls="library-table-body" />
    <p class="ri-muted" id="library-search-count" aria-live="polite"></p>
    ${libraryDataTable(['Regulator', 'Publication', 'Reference', 'Type', 'Topic', 'Published', 'Effective', 'Version', 'Status'], rows, connected ? 'No publications in staging catalogue' : 'No publications for this scenario')}`;
}

function libraryDataTable(headers, rows, empty) {
  if (!rows.length) return emptyState(empty);
  return `
    <div class="ri-table-wrap">
      <table class="ri-table">
        <thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody id="library-table-body">${rows.join('')}</tbody>
      </table>
    </div>`;
}

function viewCalendar() {
  const s = getState();
  if (isConnectedBackendActive(s)) {
    return renderConnectedUnavailableView(
      'Regulatory Calendar',
      'Connected read-only',
      `<p class="ri-alert ri-alert--readonly">Tenant regulatory calendar events are not available on the connected lab API.</p>
       <p class="ri-muted">Use Publications Library or Horizon for catalogue publication dates. Demo calendar seed data is hidden in Connected mode.</p>`,
      '<p><a href="#/library">Publications Library</a> · <a href="#/horizon">Horizon</a></p>',
    );
  }
  const defaultWindow = 90;
  const events = [...filterCalendarEvents(s.calendarEvents)]
    .filter((e) => isWithinForwardDateWindow(e.date, defaultWindow))
    .sort((a, b) => a.date.localeCompare(b.date));
  return `${pageHeader('Regulatory Calendar', 'DEMO')}
    <div class="ri-toolbar">
      <select class="ri-select" id="cal-window"><option value="30">30 days</option><option value="90" selected>90 days</option><option value="180">6 months</option><option value="365">12 months</option></select>
      <button type="button" class="ri-btn ri-btn--sm is-active">Month</button>
      <button type="button" class="ri-btn ri-btn--sm">Quarter</button>
      <button type="button" class="ri-btn ri-btn--sm">Year</button>
    </div>
    <p class="ri-muted" id="cal-window-count">${events.length} event(s) in the next ${defaultWindow} days (from ${formatDate(DEMO_TODAY)})</p>
    <ul class="ri-cal-list" id="cal-event-list">
      ${events.map((e) => `<li data-cal-item data-cal-date="${esc(e.date)}"><span class="ri-cal-date">${formatDate(e.date)}</span> <span class="ri-cal-kind">${esc(e.kind)}</span> <a href="${linkHref(e)}">${esc(e.title)}</a></li>`).join('')}
    </ul>`;
}

function viewReports() {
  const s = getState();
  if (isConnectedBackendActive(s)) {
    const pdfUrl = boardPdfExportUrl(s);
    return `${pageHeader('Reports & Audit', 'Connected tenant reporting')}
      ${connectedCatalogueBanner(s)}
      ${connectedReadOnlyGovernanceBanner(s)}
      ${renderConnectedReportingPeriodSelector()}
      <h3>Production report exports</h3>
      <ul class="ri-report-list">
        <li><a href="#/reports/executive"><strong>Executive Summary</strong></a> — tenant metrics JSON via API</li>
        <li><a href="#/reports/board"><strong>Board / Executive Report</strong></a> — connected summary</li>
        <li><a href="${esc(pdfUrl)}" download><strong>Board report PDF</strong></a> — generated from tenant data (not a mock toast)</li>
        <li><a href="#/reports/governance"><strong>Governance &amp; assurance</strong></a> — persisted counts</li>
        <li><a href="#/assurance"><strong>Regulatory Assurance dashboard</strong></a></li>
        <li><a href="#/ai-governance"><strong>AI Governance register</strong></a></li>
        <li><a href="#/audit"><strong>Audit trail</strong></a> — workflow events</li>
      </ul>
      <p class="ri-muted">Pipeline, exposure, implementation, period-change and assurance matrix sub-reports remain Design Lab demonstrations — export buttons are disabled in connected mode.</p>
      <a class="ri-btn ri-btn--ghost" href="#/audit">Open Audit Trail</a>`;
  }
  const reports = [
    'New Regulatory Changes',
    'Applicability',
    'Impact Assessments',
    'Obligations',
    'High-Priority Obligations',
    'Overdue Actions',
    'Implementation Readiness',
    'Control Coverage',
    'Policy Coverage',
    'Upcoming Deadlines',
  ];
  return `${pageHeader('Reports & Audit', 'Mock exports · DEMO')}
    <ul class="ri-report-list">
      ${reports.map((r) => `<li><strong>${esc(r)}</strong>
        <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-export="pdf">PDF</button>
        <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-export="xlsx">Excel</button>
        <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-export="csv">CSV</button>
      </li>`).join('')}
    </ul>
    <p class="ri-muted">Export buttons show prototype toast only.</p>
    <h3>Management reports (live views)</h3>
    <ul class="ri-report-list">
      <li><a href="#/reports/pipeline"><strong>Regulatory Change Pipeline</strong></a></li>
      <li><a href="#/reports/exposure"><strong>Regulatory Exposure</strong></a></li>
      <li><a href="#/reports/implementation"><strong>Implementation Status</strong></a></li>
      <li><a href="#/reports/dates"><strong>Upcoming Regulatory Dates</strong></a></li>
      <li><a href="#/reports/ai-oversight"><strong>AI Recommendation Oversight</strong></a></li>
      <li><a href="#/reports/executive"><strong>Executive Summary</strong></a></li>
      <li><a href="#/reports/board"><strong>Board / Executive Report</strong></a></li>
      <li><a href="#/reports/period-changes"><strong>What changed since last committee?</strong></a></li>
      <li><a href="#/assurance"><strong>Regulatory Assurance dashboard</strong></a></li>
      <li><a href="#/reports/obligation-assurance"><strong>Obligation Assurance</strong></a></li>
      <li><a href="#/reports/control-assurance"><strong>Control Assurance</strong></a></li>
      <li><a href="#/reports/evidence-assurance"><strong>Evidence Assurance</strong></a></li>
      <li><a href="#/reports/findings"><strong>Assurance Findings</strong></a></li>
      <li><a href="#/reports/governance"><strong>Governance &amp; assurance</strong></a></li>
      <li><a href="#/reports/ai-oversight"><strong>AI Oversight</strong></a></li>
      <li><a href="#/ai-governance"><strong>AI Governance register</strong></a></li>
    </ul>
    <a class="ri-btn ri-btn--ghost" href="#/audit">Open Audit Trail</a>`;
}

function viewAudit() {
  const s = getState();
  const connected = isConnectedBackendActive(s);
  if (connected) {
    return `${pageHeader('Audit Trail', 'Production workflow events · connected')}
      ${connectedCatalogueBanner(s)}
      ${connectedReadOnlyGovernanceBanner(s)}
      ${renderConnectedAuditLoadPanel()}
      <p class="ri-muted">Demo audit narrative is hidden. Events load from <code>GET /api/ri-lab/workflow-events</code>.</p>`;
  }
  const rows = filterAuditEvents(getState().auditEvents).map(
    (e) => `<tr>
      <td>${new Date(e.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${esc(e.user)}</td>
      <td>${esc(e.action)}</td>
      <td>${esc(e.recordType)} ${esc(e.recordId)}</td>
      <td>${e.previousValue ? esc(e.previousValue) : '—'} → ${e.newValue ? esc(e.newValue) : '—'}</td>
    </tr>`
  );
  return `${pageHeader('Audit Trail', 'Governed workflow history for regulatory decisions and assignments (mock environment)')} ${dataTable(['Time', 'User', 'Action', 'Record', 'Change'], rows, 'No audit events yet')}`;
}

function viewAdmin() {
  const s = getState();
  if (isConnectedBackendActive(s)) {
    const session = s.platformConfig?.backendSession;
    const perms = session?.permissions || [];
    return `${pageHeader('Administration', 'Authenticated FORGENIQ tenant · connected read-only')}
      ${connectedCatalogueBanner(s)}
      ${connectedReadOnlyOperationsBanner()}
      <section class="ri-panel"><h3>Session</h3>
        <dl class="ri-dl">
          <dt>User</dt><dd class="ri-mono">${esc(session?.userId || s.connectivity?.clerkUserId || '—')}</dd>
          <dt>Organisation</dt><dd>${esc(session?.organisationName || '—')} <span class="ri-mono">${esc(session?.organisationId || s.connectivity?.activeOrganisationId || '')}</span></dd>
          <dt>Role</dt><dd>${esc(session?.role || '—')}</dd>
          <dt>Writes</dt><dd>Disabled (read-only integration)</dd>
        </dl>
      </section>
      <section class="ri-panel"><h3>Permissions (read)</h3>
        <p class="ri-muted">${perms.length ? esc(perms.join(', ')) : '—'}</p>
      </section>
      <section class="ri-panel"><h3>Operations</h3>
        <ul class="ri-list">
          <li><a href="#/admin/sources">Regulatory sources &amp; connectors</a></li>
          <li><a href="#/ingestion">Ingestion Monitor</a></li>
          <li><a href="#/notifications">Attention Centre</a></li>
          <li><a href="#/admin/health">Platform health</a></li>
          <li><a href="#/admin/readiness">Readiness dashboard</a></li>
          <li><a href="#/audit">Audit trail (workflow events)</a></li>
        </ul>
        <p class="ri-muted">User invitations, role changes, organisation profile edits and demo reset are unavailable in connected read-only mode.</p>
      </section>`;
  }
  const org = s.org;
  const demo = getDemoUser();
  return `${pageHeader('Administration', 'Design Lab settings for demonstrations')}
    <section class="ri-panel"><h3>Demo persona</h3>
      <p class="ri-muted">Controls <strong>My Work</strong>, <strong>My Team</strong>, and dashboard work summary. Not a live authentication model.</p>
      <p><strong>${esc(demo?.name)}</strong> — ${esc(demo?.title)}</p>
      <label>Switch demo persona
        <select id="demo-user-select">
          ${(s.people || []).map((p) => `<option value="${esc(p.id)}"${p.id === s.currentDemoUserId ? ' selected' : ''}>${esc(p.name)} — ${esc(p.title)}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="ri-btn ri-btn--sm ri-btn--primary" id="save-demo-user">Apply</button>
    </section>
    <section class="ri-panel"><h3>Organisation profile</h3>
      <p>${esc(org.name)} — ${org.entities.join(', ')}</p>
      <p><a href="#/admin/organisation">View full organisation profile (AI reasoning)</a></p></section>
    <section class="ri-panel"><h3>People & teams (mock)</h3>
      <ul>${(s.people || []).map((u) => `<li>${esc(u.name)} — ${esc(u.title)}</li>`).join('')}</ul></section>
    <p class="ri-muted"><a href="#/demo">Demo Journeys</a> · <a href="#/admin/platform">Platform architecture</a> · <a href="#/admin/health">Platform health</a> · <a href="#/admin/readiness">Readiness dashboard</a> · <a href="#/admin/ai">AI status</a> · <a href="#/admin/sources">Regulatory sources &amp; connectors</a> · <a href="#/ingestion">Ingestion Monitor</a></p>
    <button type="button" class="ri-btn ri-btn--danger" id="admin-reset">Reset demo environment</button>`;
}

function notFound(type, id) {
  return notFoundState(type, id);
}
