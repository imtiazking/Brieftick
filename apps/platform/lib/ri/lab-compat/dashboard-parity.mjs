/**
 * Golden-master dashboard counters from a Design Lab-shaped fixture state (in-memory).
 * Mirrors Design Lab `computeDashboardStats()` (golden master store module).
 */
import { summarizeObligationPortfolio } from './obligation-portfolio.mjs';

const DEMO_TODAY = '2026-10-07';
const WEEK_START = '2026-10-01';
const IN_30_END = '2026-11-06';

function filterByScenario(items, scenarioId) {
  if (!scenarioId || scenarioId === 'all') return items || [];
  return (items || []).filter((i) => i.scenario === scenarioId);
}

function isIntakeCandidate(p) {
  return p && (p.triageStatus || p.workflowStatus);
}

/**
 * @param {object} state Design Lab seed state (createFreshState)
 */
export function computeDashboardParityFromLabState(state) {
  const scenarioId = state.scenarioId;
  const pubs = filterByScenario(state.publications, scenarioId);
  const newToday = pubs.filter((p) => p.publishedDate === DEMO_TODAY).length;
  const newWeek = pubs.filter((p) => p.publishedDate >= WEEK_START).length;
  const awaitingReview = pubs.filter(
    (p) => p.unreviewed || p.workflowStatus === 'Awaiting Review' || p.workflowStatus === 'New',
  ).length;

  const ias = filterByScenario(state.assessments, scenarioId);
  const iaDraft = ias.filter((a) => a.status === 'Draft').length;
  const iaReview = ias.filter((a) => a.status === 'Review' || a.status === 'Under Review').length;
  const iaApproval = ias.filter((a) => a.status === 'Awaiting Approval').length;

  const oblAll = filterByScenario(state.obligations, scenarioId);
  const oblPortfolio = summarizeObligationPortfolio(oblAll);

  const calEvents = filterByScenario(state.calendarEvents, scenarioId);
  const upcomingDeadlines = calEvents.filter((e) => e.date >= DEMO_TODAY && e.date <= IN_30_END).length;

  const actions = filterByScenario(state.actions, scenarioId);
  const actionsOpen = actions.filter((a) => a.status !== 'Complete').length;
  const actionsOverdue = actions.filter((a) => a.status === 'Overdue').length;

  const newChanges = pubs.filter(
    (p) => !['Closed', 'Historic', 'Complete'].includes(p.workflowStatus),
  ).length;

  return {
    openObligations: oblPortfolio.counts.ACTIVE,
    oblOverdue: oblPortfolio.flags.overdueActive,
    oblInReview: oblPortfolio.counts.REVIEW,
    oblDraft: oblPortfolio.counts.DRAFT,
    upcomingDeadlines,
    actionsOpen,
    actionsOverdue,
    iaDraft,
    iaReview,
    iaApproval,
    awaitingReview,
    newToday,
    newWeek,
    newChanges,
    impactAssessmentsInFlight: ias.filter((a) => !['Complete', 'Approved'].includes(a.status)).length,
  };
}

/**
 * Map production DB obligation rows (UPPER_SNAKE) to lab portfolio buckets for tenant parity checks.
 */
export function summarizeProductionObligationRows(rows) {
  const normalized = (rows || []).map((r) => ({
    status: String(r.status || '').replaceAll('_', ' '),
  }));
  return summarizeObligationPortfolio(normalized);
}
