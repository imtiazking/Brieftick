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
  buildWorkQueue,
  getDemoUser,
  personName,
} from './store.js';
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
} from './components.js';
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

export function renderView(route) {
  const [path, ...rest] = route.replace(/^\//, '').split('/').filter(Boolean);
  const id = rest[0];
  switch (path || 'dashboard') {
    case 'change':
      return viewChange(id);
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

function viewDashboard() {
  const s = getState();
  const stats = computeDashboardStats();
  const scopedPubs = scenarioFilter(s.publications);
  const scopedChanges = scenarioFilter(s.changes);
  const materialOpen = scopedChanges.filter((c) => c.materiality === 'High' && c.status !== 'Complete');
  const overdueObl = stats.oblOverdue || 0;
  const headline =
    materialOpen.length > 0
      ? `${materialOpen.length} material change${materialOpen.length === 1 ? '' : 's'} require attention`
      : 'Regulatory implementation remains broadly controlled';
  const feed = scopedPubs
    .filter((p) => p.priority === 'High' || p.workflowStatus === 'Impact Review' || p.workflowStatus === 'Assessment Required')
    .slice(0, 5);
  const traceBlocks = getDashboardTraceBlocks();
  const cal = filterCalendarEvents(s.calendarEvents)
    .filter((e) => e.date >= '2026-10-01' && e.date <= '2026-11-30')
    .slice(0, 6);

  return `
    ${pageHeader({
      eyebrow: `REGULATORY POSITION · ${formatDate(DEMO_TODAY)}`,
      title: headline,
      subtitle: 'Regulatory Intelligence — know what changed, understand what it means, prove what you did.',
      meta: `<span class="ri-mono">Scenario: ${esc(SCENARIOS.find((x) => x.id === s.scenarioId)?.label || s.scenarioId)}</span>`,
      actions: `<a class="ri-btn ri-btn--primary" href="#/intake">Review intake</a><a class="ri-btn ri-btn--ghost" href="#/notifications">Attention centre</a>`,
    })}
    <section class="ri-dashboard-hero">
      <p class="ri-dashboard-hero__narrative">${esc(s.forgeniqRead.summary)}</p>
      <p class="ri-muted">FORGENIQ read · confidence ${s.forgeniqRead.confidence}% · ${s.forgeniqRead.sourcesAnalysed} mock sources analysed</p>
    </section>
    <div class="ri-priority-metrics">
      ${metric('Material changes', `<strong>${materialOpen.length}</strong>`, 'High materiality in flight')}
      ${metric('Awaiting review', `<strong>${stats.awaitingReview}</strong>`, 'Intake & applicability')}
      ${metric('Overdue obligations', `<strong>${overdueObl}</strong>`, 'Implementation risk')}
      ${metric('Upcoming deadlines', `<strong>${stats.upcomingDeadlines}</strong>`, 'Next 30 days')}
    </div>
    ${renderDashboardMySectors(s)}
    <div class="ri-module-grid ri-module-grid--priority">
      ${moduleCard('01', 'New regulatory changes', stats.newChanges, [
        `New today: <strong>${stats.newToday}</strong>`,
        `New this week: <strong>${stats.newWeek}</strong>`,
        `Awaiting review: <strong>${stats.awaitingReview}</strong>`,
      ])}
      ${moduleCard('02', 'Impact assessments', stats.impactAssessments, [
        `Draft: <strong>${stats.iaDraft}</strong>`,
        `Under review: <strong>${stats.iaReview}</strong>`,
        `Awaiting approval: <strong>${stats.iaApproval}</strong>`,
      ])}
    </div>
    ${renderDashboardIngestionSummary()}
    ${renderDashboardGovernanceSummary()}
    ${renderDashboardAiSummary()}
    ${renderDashboardAssuranceSummary()}
    ${sectionHeader('PRIORITY INTELLIGENCE', 'What needs attention now', 'High-signal publications and operational modules for the selected scenario.')}
    <div class="ri-split">
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>05</span> Regulatory intelligence feed</h2>
        <ul class="ri-feed-mini">
          ${feed
            .map(
              (p) => `
            <li><a href="#/publication/${p.id}"><strong>${esc(p.regulator)}</strong> — ${esc(p.title)}</a>
              <span>${badge(p.priority)} ${badge(p.applicabilityRecommendation)} ${badge(p.workflowStatus)}</span></li>`
            )
            .join('')}
        </ul>
      </section>
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>06</span> FORGENIQ Read</h2>
        <blockquote class="ri-read">${esc(s.forgeniqRead.summary)}</blockquote>
        <p class="ri-muted">Confidence ${s.forgeniqRead.confidence}% · ${s.forgeniqRead.sourcesAnalysed} mock sources</p>
      </section>
    </div>
    <div class="ri-split">
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>07</span> Regulatory Calendar</h2>
        <ul class="ri-list-compact">
          ${cal.map((e) => `<li><a href="${linkHref(e)}">${formatDate(e.date)} — ${esc(e.title)}</a></li>`).join('')}
        </ul>
      </section>
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>08</span> Traceability</h2>
        ${traceBlocks
          .map(
            (b) => `
          <div class="ri-dash-trace">
            <p class="ri-muted ri-dash-trace__label">${esc(b.label)}</p>
            ${traceChain(b.chain)}
          </div>`
          )
          .join('')}
        <p class="ri-muted" style="margin-top:12px">Derived from central mock relationships (DEMO)</p>
      </section>
    </div>
    <div class="ri-split">
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>09</span> Governance Coverage</h2>
        <ul class="ri-stats-inline">
          <li>Risks linked <strong>${stats.risksLinked}</strong></li>
          <li>Controls mapped <strong>${stats.controlsMapped}</strong></li>
          <li>Policies impacted <strong>${stats.policiesImpacted}</strong></li>
          <li>Evidence items <strong>${stats.evidenceItems}</strong></li>
        </ul>
      </section>
      <section class="ri-panel">
        <h2 class="ri-panel__title"><span>10</span> Source Health</h2>
        <ul class="ri-source-health">
          ${s.sourceHealth.map((h) => `<li><span>${esc(h.name)}</span><em class="ri-ok">${esc(h.status)}</em></li>`).join('')}
        </ul>
        <p class="ri-muted">Simulation only — no live connectors</p>
      </section>
    </div>
    <div class="ri-module-grid" style="margin-top:16px">
      ${moduleCard('11', 'Regulatory intake', stats.intakeAwaitingTriage, [
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
      ])}
    </div>
    <section class="ri-panel" style="margin-top:16px">
      <h2 class="ri-panel__title"><span>15</span> My work (${esc(getDemoUser()?.name || 'Demo user')})</h2>
      <ul class="ri-list-compact">
        ${buildWorkQueuePreview(s, 5)}
      </ul>
      <p><a href="#/work">Open work queue</a></p>
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

function viewChangesRegister() {
  const rows = scenarioFilter(getState().changes).map(
    (c) => `<tr>
      <td><a href="#/change/${c.id}">${esc(c.id)}</a></td>
      <td>${esc(c.title)}</td>
      <td><a href="#/publication/${c.publicationId}">${esc(c.publicationId)}</a></td>
      <td>${badge(c.materiality)}</td>
      <td>${badge(c.status)}</td>
      <td>${badge(c.applicabilityDecision || c.applicabilityRecommendation)}</td>
    </tr>`
  );
  return `${pageHeader('Regulatory Changes', 'DEMO — first-class change records')}
    ${dataTable(['ID', 'Title', 'Publication', 'Materiality', 'Status', 'Applicability'], rows)}`;
}

function viewVersion(id) {
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
  const p = getPublication(id);
  if (!p) return notFound('Publication', id);
  const s = getState();
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
  const rows = scenarioFilter(s.assessments).map(
    (a) => `<tr data-href="#/assessment/${a.id}" class="ri-row-link">
      <td><a href="#/assessment/${a.id}">${esc(a.id)}</a></td>
      <td>${esc(a.title)}</td>
      <td>${esc(getPublication(a.publicationId)?.regulator || '')}</td>
      <td>${esc(a.owner)}</td>
      <td>${badge(a.materiality)}</td>
      <td>${badge(a.status)}</td>
      <td>${formatDate(a.dueDate)}</td>
    </tr>`
  );
  return `${pageHeader('Impact Assessments', 'DEMO register')}
    ${dataTable(['ID', 'Change', 'Regulator', 'Owner', 'Materiality', 'Status', 'Due'], rows)}`;
}

function viewAssessment(id) {
  const a = getAssessment(id);
  if (!a) return notFound('Impact Assessment', id);
  const p = getPublication(a.publicationId);
  const s = getState();
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
  const obls = scenarioFilter(s.obligations);
  const open = obls.filter((o) => o.status !== 'Complete').length;
  const rows = obls.map(
    (o) => `<tr class="ri-row-link">
      <td><a href="#/obligation/${o.id}">${esc(o.id)}</a></td>
      <td>${esc(o.statement.slice(0, 60))}…</td>
      <td>${esc(o.publicationId)}</td>
      <td>${esc(o.owner)}</td>
      <td>${badge(o.priority)}</td>
      <td>${formatDate(o.effectiveDate)}</td>
      <td>${esc(o.coverage)}</td>
      <td>${badge(o.status)}</td>
    </tr>`
  );
  return `${pageHeader('Obligations', 'DEMO register')}
    <div class="ri-metrics-row">
      <span>Total <strong>${obls.length}</strong></span>
      <span>Open <strong>${open}</strong></span>
      <span>High <strong>${obls.filter((o) => o.priority === 'High').length}</strong></span>
    </div>
    ${dataTable(['ID', 'Statement', 'Source', 'Owner', 'Priority', 'Effective', 'Coverage', 'Status'], rows)}`;
}

function viewObligation(id) {
  const o = getObligation(id);
  if (!o) return notFound('Obligation', id);
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
  const rows = scenarioFilter(s.risks).map(
    (r) => `<tr><td><a href="#/risk/${r.id}">${esc(r.id)}</a></td><td>${esc(r.title)}</td><td>${esc(r.category)}</td>
      <td>${esc(r.owner)}</td><td>${esc(r.inherentRisk)}</td><td>${esc(r.residualRisk)}</td><td>${badge(r.status)}</td></tr>`
  );
  return `${pageHeader('Risks', 'Regulatory-linked register · DEMO')} ${dataTable(['ID', 'Title', 'Category', 'Owner', 'Inherent', 'Residual', 'Status'], rows)}`;
}

function viewRisk(id) {
  const r = getRisk(id);
  if (!r) return notFound('Risk', id);
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
  const rows = scenarioFilter(s.controls).map(
    (c) => `<tr><td><a href="#/control/${c.id}">${esc(c.id)}</a></td><td>${esc(c.name)}</td><td>${esc(c.owner)}</td>
      <td>${esc(c.frequency)}</td><td>${esc(c.effectiveness)}</td><td>${esc((c.obligationIds || []).length)} obls</td></tr>`
  );
  return `${pageHeader('Controls', 'Control library · DEMO')} ${dataTable(['ID', 'Name', 'Owner', 'Frequency', 'Effectiveness', 'Links'], rows)}`;
}

function viewControl(id) {
  const s = getState();
  const c = getControl(id);
  if (!c) return notFound('Control', id);
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
  const rows = scenarioFilter(s.policies).map(
    (p) => `<tr><td><a href="#/policy/${p.id}">${esc(p.id)}</a></td><td>${esc(p.name)}</td><td>${esc(p.owner)}</td>
      <td>v${esc(p.version)}</td><td>${badge(p.status)}</td><td>${p.reviewRecommended ? '⚠ Review' : '—'}</td></tr>`
  );
  return `${pageHeader('Policies', 'DEMO')} ${dataTable(['ID', 'Name', 'Owner', 'Version', 'Status', 'Alerts'], rows)}`;
}

function viewPolicy(id) {
  const p = getPolicy(id);
  if (!p) return notFound('Policy', id);
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
  const rows = scenarioFilter(s.actions).map((a) => {
    const cls = a.status === 'Overdue' ? 'ri-row--danger' : a.status === 'Due Soon' ? 'ri-row--warn' : '';
    return `<tr class="${cls}"><td><a href="#/action/${a.id}">${esc(a.id)}</a></td><td>${esc(a.description)}</td>
      <td>${esc(a.sourceType)}</td><td>${esc(a.owner)}</td><td>${badge(a.priority)}</td>
      <td>${formatDate(a.dueDate)}</td><td>${badge(a.status)}</td></tr>`;
  });
  return `${pageHeader('Issues & Actions', 'DEMO')} ${dataTable(['ID', 'Description', 'Source', 'Owner', 'Priority', 'Due', 'Status'], rows)}`;
}

function viewAction(id) {
  const a = getAction(id);
  if (!a) return notFound('Action', id);
  const s = getState();
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
  const rows = scenarioFilter(s.evidence).map(
    (e) => `<tr><td><a href="#/evidence/${e.id}">${esc(e.id)}</a></td><td>${esc(e.fileName)}</td>
      <td>${esc(e.evidenceType)}</td><td>${formatDate(e.uploadedDate)}</td><td>${badge(e.approvalStatus)}</td></tr>`
  );
  return `${pageHeader('Evidence', 'DEMO')} ${dataTable(['ID', 'File', 'Type', 'Date', 'Status'], rows)}`;
}

function viewEvidenceDetail(id) {
  const e = getEvidence(id);
  if (!e) return notFound('Evidence', id);
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
  const rows = scenarioFilter(s.publications).map(
    (p) => `<tr><td>${esc(p.regulator)}</td><td><a href="#/publication/${p.id}">${esc(p.title)}</a></td>
      <td>${esc(p.reference)}</td><td>${esc(p.publicationType)}</td><td>${esc(p.topic)}</td>
      <td>${formatDate(p.publishedDate)}</td><td>${formatDate(p.effectiveDate)}</td>
      <td>1.0</td><td>${p.workflowStatus === 'Complete' ? 'Current' : 'Changed'}</td></tr>`
  );
  return `${pageHeader('Regulatory Library', 'Source of truth · DEMO')}
    <input type="search" class="ri-search-full" placeholder="Search library…" id="library-search" />
    ${dataTable(['Regulator', 'Publication', 'Reference', 'Type', 'Topic', 'Published', 'Effective', 'Version', 'Status'], rows)}`;
}

function viewCalendar() {
  const s = getState();
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
