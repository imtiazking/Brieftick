import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isActionOverdue } from '@/lib/ri/action-overdue';
import { OBLIGATION_STATUS_GROUPS } from '@/lib/ri/enums';

export type DashboardSummary = {
  publicationsNew30d: number;
  publicationsAwaitingTriage: number;
  changesOpen: number;
  obligationsActive: number;
  obligationsOverdue: number;
  obligationsInReview: number;
  actionsDueSoon: number;
  actionsOverdue: number;
  findingsOpen: number;
  assuranceOpen: number;
  impactsInProgress: number;
  upcomingDeadlines: number;
  sourceHealth?: { healthy: number; degraded: number; failing: number; stale: number };
};

const ACTIVE_OBLIGATION = [...OBLIGATION_STATUS_GROUPS.active];
const CHANGE_OPEN = ['DRAFT', 'OPEN', 'IN_PROGRESS'];
const FINDING_OPEN = ['OPEN', 'IN_PROGRESS'];

export async function getDashboardSummary(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<DashboardSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const inSeven = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [
    pubsNew,
    triagePending,
    changes,
    obligations,
    actions,
    findings,
    assurance,
    impacts,
  ] = await Promise.all([
    supabase
      .from('regulatory_publications')
      .select('id', { count: 'exact', head: true })
      .gte('publication_date', thirtyAgo),
    supabase
      .from('organisation_publications')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .in('triage_status', ['NEW', 'IN_REVIEW']),
    supabase
      .from('regulatory_changes')
      .select('id, status')
      .eq('organisation_id', organisationId),
    supabase
      .from('regulatory_obligations')
      .select('id, status, due_date')
      .eq('organisation_id', organisationId),
    supabase
      .from('actions')
      .select('id, status, due_date')
      .eq('organisation_id', organisationId),
    supabase
      .from('findings')
      .select('id, status')
      .eq('organisation_id', organisationId),
    supabase
      .from('assurance_reviews')
      .select('id, result, next_review_date')
      .eq('organisation_id', organisationId),
    supabase
      .from('impact_assessments')
      .select('id, status, due_date')
      .eq('organisation_id', organisationId),
  ]);

  const oblRows = obligations.data ?? [];
  const activeObl = oblRows.filter((o) => ACTIVE_OBLIGATION.includes(o.status as never));
  const overdueObl = oblRows.filter(
    (o) =>
      o.status === 'OVERDUE' ||
      (ACTIVE_OBLIGATION.includes(o.status as never) && o.due_date && o.due_date < today),
  );
  const inReviewObl = oblRows.filter((o) => o.status === 'IN_REVIEW');

  const actionRows = actions.data ?? [];
  const overdueActions = actionRows.filter((a) => isActionOverdue(a.due_date, a.status));
  const dueSoonActions = actionRows.filter(
    (a) =>
      a.due_date &&
      a.due_date >= today &&
      a.due_date <= inSeven &&
      !isActionOverdue(a.due_date, a.status),
  );

  const openChanges = (changes.data ?? []).filter((c) => CHANGE_OPEN.includes(c.status));
  const openFindings = (findings.data ?? []).filter((f) => FINDING_OPEN.includes(f.status));
  const openAssurance = (assurance.data ?? []).filter(
    (a) => a.result === 'FAIL' || a.result === 'PARTIAL' || a.result === 'OPEN',
  );
  const impactsActive = (impacts.data ?? []).filter((i) =>
    ['DRAFT', 'IN_REVIEW', 'IN_PROGRESS'].includes(i.status),
  );

  let upcomingDeadlines = overdueObl.length + overdueActions.length;
  upcomingDeadlines += (impacts.data ?? []).filter(
    (i) => i.due_date && i.due_date >= today && i.due_date <= inSeven,
  ).length;

  let sourceHealth: DashboardSummary['sourceHealth'];
  const { data: healthRows } = await supabase
    .from('regulatory_source_operations')
    .select('health_status');
  if (healthRows?.length) {
    sourceHealth = { healthy: 0, degraded: 0, failing: 0, stale: 0 };
    for (const r of healthRows) {
      const h = r.health_status as string;
      if (h === 'HEALTHY') sourceHealth.healthy += 1;
      else if (h === 'DEGRADED') sourceHealth.degraded += 1;
      else if (h === 'FAILING') sourceHealth.failing += 1;
      else if (h === 'STALE') sourceHealth.stale += 1;
    }
  }

  return {
    publicationsNew30d: pubsNew.count ?? 0,
    publicationsAwaitingTriage: triagePending.count ?? 0,
    changesOpen: openChanges.length,
    obligationsActive: activeObl.length,
    obligationsOverdue: overdueObl.length,
    obligationsInReview: inReviewObl.length,
    actionsDueSoon: dueSoonActions.length,
    actionsOverdue: overdueActions.length,
    findingsOpen: openFindings.length,
    assuranceOpen: openAssurance.length,
    impactsInProgress: impactsActive.length,
    upcomingDeadlines,
    sourceHealth,
  };
}
