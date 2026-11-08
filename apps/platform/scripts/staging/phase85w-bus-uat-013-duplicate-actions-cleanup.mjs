#!/usr/bin/env node
/**
 * BUS-UAT-013 — remove duplicate Authorised UAT actions (staging only).
 * Default: --dry-run. Execute only with --execute after explicit approval.
 */
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';

const CANONICAL_ACTION_ID = '12dc0449-84f8-4df1-ad63-bfe7540a2745';
const DUPLICATE_IDS = [
  'd1864aa0-2ab8-4cb9-9269-2a25dd456f7c',
  'ef651318-49e4-4ee2-ae82-de98362492cb',
  '09e2b870-71a9-41e9-964e-f379268c98c3',
  'e8cc3835-4c59-4695-aa40-3b5070e0e98a',
  '4e5ec9f3-e75e-44c9-ae83-b36e78420f1d',
];
const ORG_ID = 'cd25bb17-d575-4109-8432-4b63c75f9617';
const TITLE = 'Complete Quarterly Consumer Duty Fair Value Review';

const execute = process.argv.includes('--execute');
const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function loadAction(id) {
  const { data, error } = await admin
    .from('actions')
    .select('id, title, status, organisation_id, metadata, created_at, owner_user_id, due_date, priority')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function workflowSummary(actionId) {
  const { data, error } = await admin
    .from('workflow_events')
    .select('id, event_type, occurred_at, to_status, metadata')
    .eq('organisation_id', ORG_ID)
    .eq('entity_type', 'action')
    .eq('entity_id', actionId)
    .order('occurred_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function linkCounts(actionId) {
  const obl = await admin
    .from('action_obligation_links')
    .select('id, obligation_id', { count: 'exact', head: false })
    .eq('action_id', actionId);
  const ctrl = await admin
    .from('action_control_gap_links')
    .select('id, control_id', { count: 'exact', head: false })
    .eq('action_id', actionId);
  return {
    obligations: obl.data?.length ?? 0,
    controls: ctrl.data?.length ?? 0,
    obligationIds: (obl.data ?? []).map((r) => r.obligation_id),
    controlIds: (ctrl.data ?? []).map((r) => r.control_id),
  };
}

function assertUatAuthorised(row) {
  const m = row?.metadata || {};
  if (m.recordProvenance !== 'uat_authorised') throw new Error(`not_uat_authorised:${row.id}`);
  if (m.labCreationMode !== 'uat_authorised') throw new Error(`bad_creation_mode:${row.id}`);
  if (m.labProvenanceLocked !== true) throw new Error(`provenance_not_locked:${row.id}`);
}

async function main() {
  const canonical = await loadAction(CANONICAL_ACTION_ID);
  if (!canonical) throw new Error('canonical_missing');
  if (canonical.organisation_id !== ORG_ID) throw new Error('canonical_org_mismatch');
  assertUatAuthorised(canonical);

  const plan = {
    mode: execute ? 'execute' : 'dry-run',
    canonicalActionId: CANONICAL_ACTION_ID,
    organisationId: ORG_ID,
    duplicates: [],
    totals: {
      actionsToDelete: 0,
      obligationLinksToDelete: 0,
      controlLinksToDelete: 0,
      administrativeCorrectionsToInsert: 0,
      actionCreatedEventsPreserved: 0,
    },
  };

  for (const id of DUPLICATE_IDS) {
    if (id === CANONICAL_ACTION_ID) throw new Error('duplicate_list_includes_canonical');
    const row = await loadAction(id);
    if (!row) throw new Error(`duplicate_not_found:${id}`);
    if (row.organisation_id !== ORG_ID) throw new Error(`org_mismatch:${id}`);
    if (row.title !== TITLE) throw new Error(`title_mismatch:${id}`);
    assertUatAuthorised(row);
    const wf = await workflowSummary(id);
    const afterCreated = wf.filter((e) => e.event_type !== 'ACTION_CREATED');
    if (afterCreated.length) throw new Error(`subsequent_workflow_activity:${id}`);
    const links = await linkCounts(id);
    const entry = {
      actionId: id,
      createdAt: row.created_at,
      workflowEvents: wf.length,
      actionCreatedEvents: wf.filter((e) => e.event_type === 'ACTION_CREATED').length,
      ...links,
    };
    plan.duplicates.push(entry);
    plan.totals.actionsToDelete += 1;
    plan.totals.obligationLinksToDelete += links.obligations;
    plan.totals.controlLinksToDelete += links.controls;
    plan.totals.administrativeCorrectionsToInsert += 1;
    plan.totals.actionCreatedEventsPreserved += entry.actionCreatedEvents;
  }

  console.log(JSON.stringify(plan, null, 2));

  if (!execute) {
    console.log('\nDry-run only — no rows modified. Re-run with --execute after approval.\n');
    return;
  }

  for (const id of DUPLICATE_IDS) {
    const row = await loadAction(id);
    const links = await linkCounts(id);
    const snapshot = {
      id: row.id,
      title: row.title,
      status: row.status,
      metadata: row.metadata,
      owner_user_id: row.owner_user_id,
      due_date: row.due_date,
      priority: row.priority,
      obligationIds: links.obligationIds,
      controlIds: links.controlIds,
    };
    const { error: auditErr } = await admin.from('workflow_events').insert({
      organisation_id: ORG_ID,
      entity_type: 'action',
      entity_id: id,
      event_type: 'ADMINISTRATIVE_CORRECTION',
      actor_user_id: null,
      from_status: row.status,
      to_status: 'REMOVED',
      metadata: {
        reason: 'BUS-UAT-013 duplicate Authorised UAT action removal',
        canonicalActionId: CANONICAL_ACTION_ID,
        removedRecordSnapshot: snapshot,
        preserveActionCreatedEvents: true,
      },
    });
    if (auditErr) throw new Error(auditErr.message);

    const { error: delErr } = await admin.from('actions').delete().eq('id', id).eq('organisation_id', ORG_ID);
    if (delErr) throw new Error(delErr.message);
    console.log(`removed duplicate action ${id} (links cascade; ACTION_CREATED preserved)`);
  }

  const remaining = await admin.from('actions').select('id', { count: 'exact', head: true }).eq('title', TITLE);
  console.log(
    JSON.stringify({
      ok: true,
      remainingTitleCount: remaining.count,
      canonicalPresent: true,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
