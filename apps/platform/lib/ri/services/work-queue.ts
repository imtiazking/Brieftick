import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isActionOverdue } from '@/lib/ri/action-overdue';
import { OBLIGATION_STATUS_GROUPS } from '@/lib/ri/enums';
import { deriveSlaPresentation } from '@/lib/ri/sla-presentation';
import { AI_REVIEW_STATUS } from '@/lib/ri/ai/enums';
import { AI_USE_CASE_CATALOG } from '@/lib/ri/ai/use-case-catalog';

export type WorkQueueItem = {
  id: string;
  entityType: string;
  recordId: string;
  title: string;
  status: string | null;
  priority: string | null;
  owner: string | null;
  dueDate: string | null;
  overdue: boolean;
  slaState: string;
  source: string | null;
  regulator: string | null;
  href: string;
};

const ACTIVE_OBL = [...OBLIGATION_STATUS_GROUPS.active];

function toItem(params: {
  entityType: string;
  recordId: string;
  title: string;
  status: string | null;
  priority?: string | null;
  owner?: string | null;
  dueDate?: string | null;
  complete?: boolean;
  source?: string | null;
  regulator?: string | null;
  href: string;
}): WorkQueueItem {
  const slaState = deriveSlaPresentation(params.dueDate ?? null, Boolean(params.complete));
  const overdue = slaState === 'Overdue';
  return {
    id: `${params.entityType}-${params.recordId}`,
    entityType: params.entityType,
    recordId: params.recordId,
    title: params.title,
    status: params.status,
    priority: params.priority ?? null,
    owner: params.owner ?? null,
    dueDate: params.dueDate ?? null,
    overdue,
    slaState,
    source: params.source ?? null,
    regulator: params.regulator ?? null,
    href: params.href,
  };
}

export async function buildWorkQueue(
  supabase: SupabaseClient,
  organisationId: string,
  scope: 'all' | 'mine' | 'team',
  userId: string,
): Promise<WorkQueueItem[]> {
  const items: WorkQueueItem[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const assigneeFilter = scope === 'mine' ? userId : undefined;

  const { data: aiReviews } = await supabase
    .from('ai_analysis_runs')
    .select(
      'id, use_case_id, review_status, requested_by, created_at, publication_id, freshness, execution_status',
    )
    .eq('organisation_id', organisationId)
    .eq('review_status', AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED)
    .eq('freshness', 'CURRENT')
    .eq('execution_status', 'COMPLETED');

  for (const run of aiReviews ?? []) {
    if (assigneeFilter && run.requested_by && run.requested_by !== assigneeFilter) continue;
    const uc = AI_USE_CASE_CATALOG.find((u) => u.id === run.use_case_id);
    items.push(
      toItem({
        entityType: 'AI_REVIEW',
        recordId: run.id,
        title: `${uc?.name ?? run.use_case_id} — AI review`,
        status: run.review_status,
        owner: run.requested_by,
        source: uc?.analysisTypes[0] ?? 'AI review',
        href: `/ri/ai/${run.id}`,
      }),
    );
  }

  const { data: orgPubs } = await supabase
    .from('organisation_publications')
    .select(
      'publication_id, triage_status, assigned_to, publication:regulatory_publications(title, regulator_code)',
    )
    .eq('organisation_id', organisationId)
    .in('triage_status', ['NEW', 'IN_REVIEW']);

  for (const row of orgPubs ?? []) {
    if (assigneeFilter && row.assigned_to && row.assigned_to !== assigneeFilter) continue;
    const pub = Array.isArray(row.publication) ? row.publication[0] : row.publication;
    items.push(
      toItem({
        entityType: 'Publication',
        recordId: row.publication_id,
        title: pub?.title ?? 'Publication',
        status: row.triage_status,
        owner: row.assigned_to,
        source: 'Triage',
        regulator: pub?.regulator_code ?? null,
        href: `/ri/publications/${row.publication_id}`,
      }),
    );
  }

  const { data: apps } = await supabase
    .from('applicability_assessments')
    .select('id, publication_id, status, publication:regulatory_publications(title)')
    .eq('organisation_id', organisationId)
    .in('status', ['DRAFT', 'IN_REVIEW']);

  for (const a of apps ?? []) {
    const pub = Array.isArray(a.publication) ? a.publication[0] : a.publication;
    items.push(
      toItem({
        entityType: 'Publication',
        recordId: a.publication_id,
        title: `${pub?.title ?? 'Publication'} — applicability`,
        status: a.status,
        source: 'Applicability review',
        href: `/ri/publications/${a.publication_id}`,
      }),
    );
  }

  const { data: changes } = await supabase
    .from('regulatory_changes')
    .select('id, title, status, materiality, owner_user_id, due_date')
    .eq('organisation_id', organisationId)
    .in('status', ['DRAFT', 'OPEN', 'IN_PROGRESS', 'IN_REVIEW']);

  for (const c of changes ?? []) {
    if (assigneeFilter && c.owner_user_id && c.owner_user_id !== assigneeFilter) continue;
    items.push(
      toItem({
        entityType: 'Regulatory Change',
        recordId: c.id,
        title: c.title,
        status: c.status,
        priority: c.materiality,
        owner: c.owner_user_id,
        dueDate: c.due_date,
        source: 'Change review',
        href: `/ri/changes/${c.id}`,
      }),
    );
  }

  const { data: impacts } = await supabase
    .from('impact_assessments')
    .select('id, status, due_date, owner_user_id, materiality')
    .eq('organisation_id', organisationId)
    .in('status', ['DRAFT', 'IN_REVIEW', 'IN_PROGRESS']);

  for (const i of impacts ?? []) {
    if (assigneeFilter && i.owner_user_id && i.owner_user_id !== assigneeFilter) continue;
    items.push(
      toItem({
        entityType: 'Impact Assessment',
        recordId: i.id,
        title: `Impact assessment (${i.materiality ?? i.status})`,
        status: i.status,
        priority: i.materiality,
        owner: i.owner_user_id,
        dueDate: i.due_date,
        source: 'Assessment',
        href: `/ri/impact-assessments/${i.id}`,
      }),
    );
  }

  const { data: obligations } = await supabase
    .from('regulatory_obligations')
    .select('id, obligation_statement, status, due_date, owner_user_id')
    .eq('organisation_id', organisationId);

  for (const o of obligations ?? []) {
    const isDraft = o.status === 'DRAFT';
    const isClosed = ['COMPLETE', 'HISTORIC', 'CLOSED'].includes(o.status);
    if (isDraft || isClosed) continue;
    const overdue =
      o.status === 'OVERDUE' ||
      (ACTIVE_OBL.includes(o.status as never) && o.due_date && o.due_date < today);
    if (assigneeFilter && o.owner_user_id && o.owner_user_id !== assigneeFilter) continue;
    items.push(
      toItem({
        entityType: 'Obligation',
        recordId: o.id,
        title: o.obligation_statement.slice(0, 120),
        status: o.status,
        owner: o.owner_user_id,
        dueDate: o.due_date,
        source: overdue ? 'Overdue obligation' : 'Obligation review',
        href: `/ri/obligations/${o.id}`,
      }),
    );
  }

  const { data: actions } = await supabase
    .from('actions')
    .select('id, title, status, due_date, owner_user_id, priority')
    .eq('organisation_id', organisationId);

  for (const a of actions ?? []) {
    if (a.status === 'COMPLETE' || a.status === 'CLOSED') continue;
    const overdue = isActionOverdue(a.due_date, a.status);
    const dueSoon =
      a.due_date && a.due_date >= today && !overdue && ['OPEN', 'IN_PROGRESS'].includes(a.status);
    if (!overdue && !dueSoon && !['OPEN', 'IN_PROGRESS'].includes(a.status)) continue;
    if (assigneeFilter && a.owner_user_id && a.owner_user_id !== assigneeFilter) continue;
    items.push(
      toItem({
        entityType: 'Action',
        recordId: a.id,
        title: a.title,
        status: a.status,
        priority: a.priority,
        owner: a.owner_user_id,
        dueDate: a.due_date,
        complete: false,
        source: overdue ? 'Overdue action' : 'Implementation',
        href: `/ri/actions/${a.id}`,
      }),
    );
  }

  const { data: findings } = await supabase
    .from('findings')
    .select('id, title, status, due_date, owner_user_id, severity')
    .eq('organisation_id', organisationId)
    .in('status', ['OPEN', 'IN_PROGRESS']);

  for (const f of findings ?? []) {
    if (assigneeFilter && f.owner_user_id && f.owner_user_id !== assigneeFilter) continue;
    items.push(
      toItem({
        entityType: 'Finding',
        recordId: f.id,
        title: f.title,
        status: f.status,
        priority: f.severity,
        owner: f.owner_user_id,
        dueDate: f.due_date,
        source: 'Finding remediation',
        href: `/ri/findings/${f.id}`,
      }),
    );
  }

  const { data: assurance } = await supabase
    .from('assurance_reviews')
    .select('id, review_type, result, next_review_date, reviewer_user_id, status')
    .eq('organisation_id', organisationId);

  for (const ar of assurance ?? []) {
    if (ar.result === 'PASS') continue;
    if (assigneeFilter && ar.reviewer_user_id && ar.reviewer_user_id !== assigneeFilter) continue;
    items.push(
      toItem({
        entityType: 'Assurance Review',
        recordId: ar.id,
        title: `${ar.review_type} (${ar.result})`,
        status: ar.result ?? ar.status,
        owner: ar.reviewer_user_id,
        dueDate: ar.next_review_date,
        source: 'Assurance',
        href: `/ri/assurance/${ar.id}`,
      }),
    );
  }

  return items.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.title.localeCompare(b.title);
  });
}
