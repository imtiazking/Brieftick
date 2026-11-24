import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { deriveSlaPresentation, DUE_SOON_DAYS, daysBetween, parseDateOnly } from '@/lib/ri/sla-presentation';
import { canRi } from '@/lib/ri/permissions';
import { buildWorkQueue, type WorkQueueItem } from '@/lib/ri/services/work-queue';
import { listPendingGovernanceItems } from '@/lib/ri/services/governance-queue';
import { listTriageQueues } from '@/lib/ri/services/triage-queues';
import { WORKFLOW_QUEUES } from '@/lib/ri/triage/regulatory-workflow-queues.mjs';
import {
  paginateMyTasks,
  summariseMyTaskMetrics,
} from '@/lib/ri/tasks/my-tasks-list-pagination.mjs';
import { assessAiObligationTransition } from '@/lib/ri/ai/ai-obligation-workflow.mjs';

export type MyTasksScope = 'mine' | 'team';
export type MyTasksQuery = {
  scope?: MyTasksScope;
  page?: number;
  pageSize?: number;
  viewFilter?: string;
  taskType?: string;
  priority?: string;
  search?: string;
};

export type MyTaskRow = {
  id: string;
  taskTitle: string;
  taskAction: string;
  entityType: string;
  reference: string | null;
  regulator: string | null;
  priority: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  status: string;
  slaState: string;
  overdue: boolean;
  dueSoon: boolean;
  awaitingReview: boolean;
  completed: boolean;
  unassigned: boolean;
  href: string;
  recordId: string;
};

const WORKFLOW_SEGMENT: Record<string, string> = {
  AI_FINDINGS: 'ai-findings',
  VERIFIED_OBLIGATIONS: 'verified-obligations',
  NON_OBLIGATIONS: 'non-obligations',
  REJECTED_FINDINGS: 'rejected',
  EXCEPTIONS: 'exceptions',
  NOT_APPLICABLE: 'not-applicable',
};

function labHrefForWorkItem(item: WorkQueueItem): string {
  const map: Record<string, string> = {
    AI_REVIEW: `#/ai-analysis/${item.recordId}`,
    Publication: `#/publication/${item.recordId}`,
    'Regulatory Change': `#/change/${item.recordId}`,
    'Impact Assessment': `#/assessment/${item.recordId}`,
    Obligation: `#/obligation/${item.recordId}`,
    Action: `#/action/${item.recordId}`,
    Finding: `#/finding/${item.recordId}`,
    'Assurance Review': `#/assurance/${item.recordId}`,
  };
  if (map[item.entityType]) return map[item.entityType];
  return item.href.startsWith('#') ? item.href : `#/dashboard`;
}

function workItemToTask(item: WorkQueueItem): MyTaskRow {
  const assignedTo = item.owner ?? null;
  const unassigned = !assignedTo;
  const complete = item.slaState === 'Complete';
  const dueSoon =
    !complete &&
    Boolean(item.dueDate) &&
    item.slaState === 'Due Soon';
  const awaitingReview =
    ['IN_REVIEW', 'HUMAN_REVIEW_REQUIRED', 'Review Required'].includes(String(item.status || '')) ||
    item.entityType === 'AI_REVIEW';
  return {
    id: item.id,
    taskTitle: item.title,
    taskAction: item.source ?? `Complete ${item.entityType}`,
    entityType: item.entityType,
    reference: item.recordId.slice(0, 8),
    regulator: item.regulator,
    priority: item.priority,
    assignedTo,
    dueDate: item.dueDate,
    status: item.status ?? 'OPEN',
    slaState: item.slaState,
    overdue: item.overdue,
    dueSoon,
    awaitingReview,
    completed: complete,
    unassigned,
    href: labHrefForWorkItem(item),
    recordId: item.recordId,
  };
}

function passesScope(task: MyTaskRow, scope: MyTasksScope, userId: string): boolean {
  if (scope === 'mine') {
    if (task.unassigned) return false;
    return task.assignedTo === userId;
  }
  if (task.assignedTo === userId) return true;
  if (task.unassigned) return true;
  return false;
}

async function obligationTasks(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  role: PlatformRole,
): Promise<MyTaskRow[]> {
  const { data: rows } = await supabase
    .from('regulatory_obligations')
    .select(
      'id, obligation_statement, status, due_date, owner_user_id, priority, origin, created_by_user_id, ai_submitted_by_user_id, metadata, citation',
    )
    .eq('organisation_id', organisationId);
  const tasks: MyTaskRow[] = [];
  const actorCanReview = canRi(role, 'obligation:review');
  const today = new Date().toISOString().slice(0, 10);

  for (const o of rows ?? []) {
    const governed =
      o.origin === 'AI_ASSISTED' ||
      (o.metadata && typeof o.metadata === 'object' && (o.metadata as { governed?: boolean }).governed === true);
    if (o.status === 'DRAFT') {
      const assignedTo = o.owner_user_id ?? o.created_by_user_id ?? null;
      const slaState = deriveSlaPresentation(o.due_date, false);
      tasks.push({
        id: `obligation-draft-${o.id}`,
        taskTitle: String(o.obligation_statement || 'Draft obligation').slice(0, 120),
        taskAction: 'Complete draft obligation',
        entityType: 'Obligation',
        reference: o.citation || o.id.slice(0, 8),
        regulator: null,
        priority: o.priority,
        assignedTo,
        dueDate: o.due_date,
        status: o.status,
        slaState,
        overdue: slaState === 'Overdue',
        dueSoon: slaState === 'Due Soon',
        awaitingReview: false,
        completed: false,
        unassigned: !assignedTo,
        href: `#/obligation/${o.id}`,
        recordId: o.id,
      });
      continue;
    }
    if (o.status !== 'IN_REVIEW' || !governed) continue;
    const transitionOk = assessAiObligationTransition({
      from: 'IN_REVIEW',
      to: 'OPEN',
      actorUserId: userId,
      actorCanReview,
      requestedByUserId: null,
      acceptedByUserId: o.created_by_user_id,
      submittedByUserId: o.ai_submitted_by_user_id,
    });
    if (transitionOk.ok) {
      const slaState = deriveSlaPresentation(o.due_date, false);
      tasks.push({
        id: `obligation-approval-${o.id}`,
        taskTitle: String(o.obligation_statement || 'Obligation').slice(0, 120),
        taskAction: 'Approve or return submitted obligation',
        entityType: 'Obligation approval',
        reference: o.citation || o.id.slice(0, 8),
        regulator: null,
        priority: o.priority,
        assignedTo: null,
        dueDate: o.due_date,
        status: o.status,
        slaState,
        overdue: slaState === 'Overdue',
        dueSoon: slaState === 'Due Soon',
        awaitingReview: true,
        completed: false,
        unassigned: true,
        href: `#/obligation/${o.id}`,
        recordId: o.id,
      });
    }
    if (o.ai_submitted_by_user_id === userId) {
      tasks.push({
        id: `obligation-submitted-${o.id}`,
        taskTitle: String(o.obligation_statement || 'Obligation').slice(0, 120),
        taskAction: 'Awaiting independent checker approval',
        entityType: 'Obligation',
        reference: o.citation || o.id.slice(0, 8),
        regulator: null,
        priority: o.priority,
        assignedTo: userId,
        dueDate: o.due_date,
        status: o.status,
        slaState: 'On Track',
        overdue: false,
        dueSoon: Boolean(o.due_date && daysBetween(today, parseDateOnly(o.due_date)!) <= DUE_SOON_DAYS),
        awaitingReview: false,
        completed: false,
        unassigned: false,
        href: `#/obligation/${o.id}`,
        recordId: o.id,
      });
    }
  }
  return tasks;
}

async function governanceTasks(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  role: PlatformRole,
): Promise<MyTaskRow[]> {
  const pending = await listPendingGovernanceItems(supabase, organisationId);
  const tasks: MyTaskRow[] = [];
  for (const p of pending) {
    const canApproveImpact = p.kind === 'impact_assessment' && canRi(role, 'impact:approve');
    const canApproveApp = p.kind === 'applicability_assessment' && canRi(role, 'impact:review');
    if (!canApproveImpact && !canApproveApp) continue;
    if (p.ownerUserId === userId) continue;
    const href =
      p.kind === 'impact_assessment'
        ? `#/assessment/${p.id}`
        : `#/applicability/${p.publicationId ?? p.id}`;
    tasks.push({
      id: `governance-${p.kind}-${p.id}`,
      taskTitle: p.title,
      taskAction: p.kind === 'impact_assessment' ? 'Review impact assessment submission' : 'Review applicability submission',
      entityType: p.kind === 'impact_assessment' ? 'Impact assessment' : 'Applicability',
      reference: p.id.slice(0, 8),
      regulator: null,
      priority: null,
      assignedTo: null,
      dueDate: null,
      status: p.status,
      slaState: 'On Track',
      overdue: false,
      dueSoon: false,
      awaitingReview: true,
      completed: false,
      unassigned: true,
      href,
      recordId: p.id,
    });
  }
  return tasks;
}

async function triageActionTasks(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  role: PlatformRole,
): Promise<MyTaskRow[]> {
  if (!canRi(role, 'ai:review')) return [];
  const result = await listTriageQueues(supabase, organisationId, WORKFLOW_QUEUES.ALL_FINDINGS, {
    page: 1,
    pageSize: 500,
    verificationFilter: 'ALL',
  });
  const tasks: MyTaskRow[] = [];
  for (const row of result.items as Array<Record<string, unknown>>) {
    const humanVerification = String(row.humanVerification || '');
    const workflowQueue = String(row.workflowQueue || '');
    const hasDecision = row.hasPersistedDecision === true;
    const canFirstReview = row.canFirstReview === true;
    const canReassess = row.canReassess === true;
    const approvalStatus = String(row.approvalStatus || 'NONE');
    const findingId = String(row.findingId || '');
    const runId = String(row.runId || '');
    const segment = WORKFLOW_SEGMENT[workflowQueue] || 'all';

    let taskAction: string | null = null;
    if (canFirstReview && workflowQueue === WORKFLOW_QUEUES.AI_FINDINGS) {
      taskAction = 'Verify AI finding';
    } else if (
      (humanVerification === 'NEEDS_REVIEW' || humanVerification === 'RE_VERIFICATION_REQUIRED') &&
      workflowQueue === WORKFLOW_QUEUES.EXCEPTIONS
    ) {
      taskAction = 'Investigate exception finding';
    } else if (canReassess && humanVerification === 'RE_VERIFICATION_REQUIRED') {
      taskAction = 'Reassess finding after source change';
    } else if (approvalStatus === 'AWAITING_APPROVAL' && canRi(role, 'obligation:review')) {
      taskAction = 'Approve obligation from verified finding';
    }
    if (!taskAction) continue;

    const reviewerUserId = (row.verificationRecord as { reviewerUserId?: string } | undefined)?.reviewerUserId;
    const assignedTo = reviewerUserId ?? null;
    if (assignedTo && assignedTo !== userId) continue;

    tasks.push({
      id: `triage-${runId}-${findingId}`,
      taskTitle: String(row.regulatoryFinding || row.quotation || 'AI finding').slice(0, 120),
      taskAction,
      entityType: 'AI finding',
      reference: String(row.provisionReference || findingId.slice(0, 8)),
      regulator: (row.regulator as string) ?? null,
      priority: null,
      assignedTo,
      dueDate: null,
      status: humanVerification || (hasDecision ? 'VERIFIED' : 'UNVERIFIED'),
      slaState: 'On Track',
      overdue: false,
      dueSoon: false,
      awaitingReview: true,
      completed: false,
      unassigned: !assignedTo,
      href: `#/triage/${segment}`,
      recordId: findingId,
    });
  }
  return tasks;
}

function dedupeTasks(tasks: MyTaskRow[]): MyTaskRow[] {
  const map = new Map<string, MyTaskRow>();
  for (const t of tasks) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return [...map.values()];
}

export async function buildMyTasks(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  role: PlatformRole,
  query: MyTasksQuery = {},
) {
  const scope: MyTasksScope = query.scope === 'team' ? 'team' : 'mine';
  const workScope = scope === 'mine' ? 'mine' : 'all';
  const [workItems, obligationRows, governanceRows, triageRows] = await Promise.all([
    buildWorkQueue(supabase, organisationId, workScope, userId),
    obligationTasks(supabase, organisationId, userId, role),
    governanceTasks(supabase, organisationId, userId, role),
    scope === 'team' ? triageActionTasks(supabase, organisationId, userId, role) : Promise.resolve([]),
  ]);

  let tasks = [
    ...workItems.map((w) => workItemToTask(w)),
    ...obligationRows,
    ...governanceRows,
    ...triageRows,
  ];

  tasks = dedupeTasks(tasks).filter((t) => passesScope(t, scope, userId));

  if (scope === 'mine') {
    tasks = tasks.filter((t) => {
      if (t.id.startsWith('obligation-approval-')) return false;
      return true;
    });
  }

  const metrics = summariseMyTaskMetrics(tasks, userId);
  const pageResult = paginateMyTasks(tasks, query);

  return {
    scope,
    metrics,
    items: pageResult.items as MyTaskRow[],
    filteredTotal: pageResult.pagination.totalItems,
    pagination: pageResult.pagination,
    activeFilters: {
      viewFilter: pageResult.viewFilter,
      taskType: pageResult.taskType,
      priority: pageResult.priority,
      search: pageResult.search,
    },
    role,
    userId,
    note: 'Tasks are derived from persisted workflow records. Unassigned regulatory findings appear under team scope only — not as falsely assigned work.',
  };
}