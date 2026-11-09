import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isActionOverdue } from '@/lib/ri/action-overdue';
import { OBLIGATION_STATUS_GROUPS } from '@/lib/ri/enums';
import { listPendingGovernanceItems } from '@/lib/ri/services/governance-queue';
import { countUnreadTenantNotifications } from '@/lib/ri/services/tenant-notifications';
import { filterPendingGovernanceForLabScope } from '@/lib/ri/uat-record-provenance';
import {
  classifyObligationForLab,
  obligationLabProvenanceInputFromRow,
  recordKindForObligationLabClass,
} from '@/lib/ri/lab-api/obligation-lab-provenance';
import {
  classifyImpactForLab,
  impactLabProvenanceInputFromRow,
  recordKindForImpactLabClass,
} from '@/lib/ri/lab-api/impact-lab-provenance';
import {
  partitionAssuranceReviewsForLabScope,
  partitionControlsForLabScope,
  partitionRisksForLabScope,
  assuranceLabProvenanceInputFromRow,
  riskLabProvenanceInputFromRow,
  controlLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';
import {
  isOperationalDashboardProvenance,
  resolveRecordProvenance,
} from '@/lib/ri/record-provenance';

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
  impactsInReview: number;
  pendingApprovals: number;
  risksOpen: number;
  controlsTracked: number;
  unreadNotifications: number;
  upcomingDeadlines: number;
  sourceHealth?: { healthy: number; degraded: number; failing: number; stale: number };
};

const ACTIVE_OBLIGATION = [...OBLIGATION_STATUS_GROUPS.active];
const CHANGE_OPEN = ['DRAFT', 'OPEN', 'IN_PROGRESS'];
const FINDING_OPEN = ['OPEN', 'IN_PROGRESS'];

export async function getDashboardSummary(
  supabase: SupabaseClient,
  organisationId: string,
  userId?: string | null,
  options?: { excludeSyntheticUat?: boolean },
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
    risks,
    controls,
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
      .select('id, status, title, description, external_key, origin, metadata')
      .eq('organisation_id', organisationId),
    supabase
      .from('regulatory_obligations')
      .select(
        'id, status, due_date, obligation_statement, external_key, metadata, regulatory_change_id, change:regulatory_changes(origin, metadata, external_key, title, description, publication_id)',
      )
      .eq('organisation_id', organisationId),
    supabase
      .from('actions')
      .select('id, status, due_date')
      .eq('organisation_id', organisationId),
    supabase
      .from('findings')
      .select('id, status, title')
      .eq('organisation_id', organisationId),
    supabase
      .from('assurance_reviews')
      .select('id, result, next_review_date, review_type, metadata')
      .eq('organisation_id', organisationId),
    supabase
      .from('impact_assessments')
      .select(
        'id, status, due_date, metadata, regulatory_change_id, change:regulatory_changes(title, description, external_key, origin, metadata)',
      )
      .eq('organisation_id', organisationId),
    supabase.from('risks').select('id, status, title, description, metadata').eq('organisation_id', organisationId),
    supabase.from('controls').select('id, status, name, description, metadata').eq('organisation_id', organisationId),
  ]);

  const excludeSynthetic = options?.excludeSyntheticUat === true;
  let changeRows = changes.data ?? [];
  let oblRows = obligations.data ?? [];
  let findingRows = findings.data ?? [];
  let impactRows = impacts.data ?? [];
  let riskRows = risks.data ?? [];
  let controlRows = controls.data ?? [];
  let assuranceRows = assurance.data ?? [];

  if (excludeSynthetic) {
    changeRows = changeRows.filter((c) =>
      isOperationalDashboardProvenance(
        resolveRecordProvenance({
          title: c.title,
          description: c.description,
          externalKey: c.external_key,
          origin: (c as { origin?: string }).origin,
          metadata: (c as { metadata?: Record<string, unknown> }).metadata ?? null,
        }),
      ),
    );
    oblRows = oblRows.filter((o) => {
      const ch = Array.isArray(o.change) ? o.change[0] : o.change;
      const kind = recordKindForObligationLabClass(
        classifyObligationForLab(
          obligationLabProvenanceInputFromRow({
            metadata: (o as { metadata?: Record<string, unknown> }).metadata ?? null,
            change: ch ?? null,
          }),
        ),
      );
      return isOperationalDashboardProvenance(kind);
    });
    findingRows = findingRows.filter((f) =>
      isOperationalDashboardProvenance(resolveRecordProvenance({ title: f.title })),
    );
    impactRows = impactRows.filter((i) => {
      const ch = Array.isArray(i.change) ? i.change[0] : i.change;
      const kind = recordKindForImpactLabClass(
        classifyImpactForLab(
          impactLabProvenanceInputFromRow({
            metadata: (i as { metadata?: Record<string, unknown> }).metadata ?? null,
            change: ch ?? null,
          }),
        ),
      );
      return isOperationalDashboardProvenance(kind);
    });
    riskRows = partitionRisksForLabScope(riskRows, 'operational', (r) =>
      riskLabProvenanceInputFromRow(r),
    ).operational;
    controlRows = partitionControlsForLabScope(controlRows, 'operational', (c) =>
      controlLabProvenanceInputFromRow(c),
    ).operational;
    assuranceRows = partitionAssuranceReviewsForLabScope(
      assuranceRows,
      'operational',
      (a) => assuranceLabProvenanceInputFromRow(a),
    ).operational;
  }

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

  const openChanges = changeRows.filter((c) => CHANGE_OPEN.includes(c.status));
  const openFindings = findingRows.filter((f) => FINDING_OPEN.includes(f.status));
  const openAssurance = assuranceRows.filter(
    (a) => a.result === 'FAIL' || a.result === 'PARTIAL' || a.result === 'OPEN',
  );
  const impactsActive = impactRows.filter((i) =>
    ['DRAFT', 'IN_REVIEW', 'IN_PROGRESS'].includes(i.status),
  );
  const impactsInReview = impactRows.filter((i) => i.status === 'IN_REVIEW');

  let pending = await listPendingGovernanceItems(supabase, organisationId);
  if (excludeSynthetic) {
    pending = filterPendingGovernanceForLabScope(pending, 'operational').items;
  }
  let unreadNotifications = 0;
  if (userId) {
    try {
      unreadNotifications = await countUnreadTenantNotifications(supabase, organisationId, userId);
    } catch {
      unreadNotifications = 0;
    }
  }

  const risksOpen = riskRows.filter((r) => r.status !== 'CLOSED' && r.status !== 'ACCEPTED').length;
  const controlsTracked = controlRows.length;

  let upcomingDeadlines = overdueObl.length + overdueActions.length;
  upcomingDeadlines += impactRows.filter(
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
    impactsInReview: impactsInReview.length,
    pendingApprovals: pending.length,
    risksOpen,
    controlsTracked,
    unreadNotifications,
    upcomingDeadlines,
    sourceHealth,
  };
}