import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isActionOverdue } from '@/lib/ri/action-overdue';
import { OBLIGATION_STATUS_GROUPS } from '@/lib/ri/enums';

export type WorkQueueItem = {
  id: string;
  kind: string;
  title: string;
  href: string;
  dueDate: string | null;
  status: string | null;
  assignee: string | null;
};

export async function buildWorkQueue(
  supabase: SupabaseClient,
  organisationId: string,
  scope: 'mine' | 'team',
  userId: string,
): Promise<WorkQueueItem[]> {
  const items: WorkQueueItem[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const activeObl = [...OBLIGATION_STATUS_GROUPS.active];

  const assigneeFilter = scope === 'mine' ? userId : undefined;

  const { data: orgPubs } = await supabase
    .from('organisation_publications')
    .select('publication_id, triage_status, assigned_to, publication:regulatory_publications(title)')
    .eq('organisation_id', organisationId)
    .in('triage_status', ['NEW', 'IN_REVIEW']);

  for (const row of orgPubs ?? []) {
    if (assigneeFilter && row.assigned_to && row.assigned_to !== assigneeFilter) continue;
    const pub = Array.isArray(row.publication) ? row.publication[0] : row.publication;
    items.push({
      id: `triage-${row.publication_id}`,
      kind: 'Publication triage',
      title: pub?.title ?? 'Publication',
      href: `/ri/publications/${row.publication_id}`,
      dueDate: null,
      status: row.triage_status,
      assignee: row.assigned_to,
    });
  }

  const { data: apps } = await supabase
    .from('applicability_assessments')
    .select('id, publication_id, status, recommendation, publication:regulatory_publications(title)')
    .eq('organisation_id', organisationId)
    .in('status', ['DRAFT', 'IN_REVIEW']);

  for (const a of apps ?? []) {
    const pub = Array.isArray(a.publication) ? a.publication[0] : a.publication;
    items.push({
      id: `app-${a.id}`,
      kind: 'Applicability review',
      title: pub?.title ?? 'Applicability',
      href: `/ri/publications/${a.publication_id}`,
      dueDate: null,
      status: a.status,
      assignee: null,
    });
  }

  const { data: impacts } = await supabase
    .from('impact_assessments')
    .select('id, status, due_date, owner_user_id, materiality')
    .eq('organisation_id', organisationId)
    .in('status', ['DRAFT', 'IN_REVIEW', 'IN_PROGRESS']);

  for (const i of impacts ?? []) {
    if (assigneeFilter && i.owner_user_id && i.owner_user_id !== assigneeFilter) continue;
    items.push({
      id: `imp-${i.id}`,
      kind: 'Impact assessment',
      title: `Impact assessment (${i.materiality ?? i.status})`,
      href: `/ri/impact-assessments/${i.id}`,
      dueDate: i.due_date,
      status: i.status,
      assignee: i.owner_user_id,
    });
  }

  const { data: obligations } = await supabase
    .from('regulatory_obligations')
    .select('id, obligation_statement, status, due_date, owner_user_id')
    .eq('organisation_id', organisationId);

  for (const o of obligations ?? []) {
    const needsReview = o.status === 'IN_REVIEW';
    const overdue =
      o.status === 'OVERDUE' ||
      (activeObl.includes(o.status as never) && o.due_date && o.due_date < today);
    if (!needsReview && !overdue && !activeObl.includes(o.status as never)) continue;
    if (assigneeFilter && o.owner_user_id && o.owner_user_id !== assigneeFilter) continue;
    items.push({
      id: `obl-${o.id}`,
      kind: overdue ? 'Overdue obligation' : needsReview ? 'Obligation review' : 'Active obligation',
      title: o.obligation_statement.slice(0, 100),
      href: `/ri/obligations/${o.id}`,
      dueDate: o.due_date,
      status: o.status,
      assignee: o.owner_user_id,
    });
  }

  const { data: actions } = await supabase
    .from('actions')
    .select('id, title, status, due_date, owner_user_id')
    .eq('organisation_id', organisationId);

  for (const a of actions ?? []) {
    const overdue = isActionOverdue(a.due_date, a.status);
    const dueSoon =
      a.due_date && a.due_date >= today && !overdue && ['OPEN', 'IN_PROGRESS'].includes(a.status);
    if (!overdue && !dueSoon) continue;
    if (assigneeFilter && a.owner_user_id && a.owner_user_id !== assigneeFilter) continue;
    items.push({
      id: `act-${a.id}`,
      kind: overdue ? 'Overdue action' : 'Action due',
      title: a.title,
      href: `/ri/actions/${a.id}`,
      dueDate: a.due_date,
      status: a.status,
      assignee: a.owner_user_id,
    });
  }

  const { data: findings } = await supabase
    .from('findings')
    .select('id, title, status, due_date, owner_user_id')
    .eq('organisation_id', organisationId)
    .in('status', ['OPEN', 'IN_PROGRESS']);

  for (const f of findings ?? []) {
    if (assigneeFilter && f.owner_user_id && f.owner_user_id !== assigneeFilter) continue;
    items.push({
      id: `fnd-${f.id}`,
      kind: 'Finding',
      title: f.title,
      href: `/ri/findings/${f.id}`,
      dueDate: f.due_date,
      status: f.status,
      assignee: f.owner_user_id,
    });
  }

  const { data: assurance } = await supabase
    .from('assurance_reviews')
    .select('id, review_type, result, next_review_date, reviewer_user_id')
    .eq('organisation_id', organisationId);

  for (const ar of assurance ?? []) {
    if (ar.result === 'PASS') continue;
    if (assigneeFilter && ar.reviewer_user_id && ar.reviewer_user_id !== assigneeFilter) continue;
    items.push({
      id: `asr-${ar.id}`,
      kind: 'Assurance review',
      title: `${ar.review_type} (${ar.result})`,
      href: `/ri/assurance/${ar.id}`,
      dueDate: ar.next_review_date,
      status: ar.result,
      assignee: ar.reviewer_user_id,
    });
  }

  return items.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}
