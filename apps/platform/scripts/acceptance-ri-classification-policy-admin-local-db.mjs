#!/usr/bin/env node
/**
 * Isolated embedded Postgres (never staging): migration 20261121230000 — classification policy
 * administration (RI-CLS-003). Draft withdrawal, refusal of outdated drafts, operator maker-checker for a
 * new regulator's first policy, read access, audit history and rollback; plus the Design Lab screen's
 * read-only / operator / own-draft rendering and the proposal payload, validated with the shared rules.
 */
import pg from 'pg';
import { join } from 'node:path';
import {
  applyAllMigrations,
  applyReferenceSeed,
  applySqlFile,
  ensureAppRole,
  platformRoot,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSession,
  withRlsSessionCommit,
} from './local-db/harness.mjs';
import {
  MANDATORY_NON_BINDING_PUBLICATION_TYPES,
  validateClassificationPolicy,
} from '../lib/ri/classification/regulatory-classification-policy.mjs';

const MIGRATION = '20261121230000_ri_classification_policy_admin.sql';
const OP1 = 'user_platform_operator_1';
const OP2 = 'user_platform_operator_2';
const MEMBER = 'user_tenant_member';

let failures = 0;
let passes = 0;
const check = (cond, msg, detail) => {
  if (cond) {
    passes += 1;
    console.log(`PASS: ${msg}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${msg}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
};

async function attempt(adminUrl, sub, sql, params = [], commit = false) {
  try {
    const run = commit ? withRlsSessionCommit : withRlsSession;
    const res = await run(adminUrl, sub, (c) => c.query(sql, params));
    return { ok: true, rowCount: res.rowCount, rows: res.rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

const PROPOSE = `select public.ri_propose_classification_policy($1, current_date, array[]::text[], $2::jsonb, $3) as id`;
const ACTIVATE = `select public.ri_activate_classification_policy($1)`;
const WITHDRAW = `select public.ri_withdraw_classification_policy($1, $2)`;

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54359 });
const db = new pg.Client({ connectionString: adminUrl });
await db.connect();

try {
  await applySqlFile(db, join(platformRoot, 'scripts', 'local-db', 'auth-jwt-shim.sql'));
  await db.query(`
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  await applyAllMigrations(db);
  await ensureAppRole(db);
  await db.query(`grant all on all tables in schema public to anon, authenticated; grant authenticated to forgeniq_app;`);
  await applyReferenceSeed(db);
  await db.query(`insert into platform_operators (clerk_user_id, status) values ($1, 'active'), ($2, 'active')`, [OP1, OP2]);

  const grants = (
    await db.query(`select has_function_privilege('anon', 'public.ri_withdraw_classification_policy(uuid, text)', 'execute') anon,
                           has_function_privilege('authenticated', 'public.ri_withdraw_classification_policy(uuid, text)', 'execute') auth`)
  ).rows[0];
  check(grants.anon === false && grants.auth === true, 'withdraw RPC: not callable by anon; callable by signed-in users (operator check inside)', grants);

  const fca = (await db.query(`select id from regulatory_classification_policies where regulator_key = 'REG-FCA' and status = 'ACTIVE'`)).rows[0].id;
  const fcaEntries = (
    await db.query(
      `select code, description, conversion_enabled as "conversionEnabled", destination_queue as "destinationQueue", human_review_required as "humanReviewRequired", supporting_obligation_link_required as "supportingObligationLinkRequired" from regulatory_classification_policy_entries where policy_id = $1`,
      [fca],
    )
  ).rows;

  const v2 = (await attempt(adminUrl, OP1, PROPOSE, ['REG-FCA', JSON.stringify(fcaEntries), 'Draft v2 for administration testing.'], true)).rows?.[0]?.id;
  const v3 = (await attempt(adminUrl, OP1, PROPOSE, ['REG-FCA', JSON.stringify(fcaEntries), 'Draft v3 for administration testing.'], true)).rows?.[0]?.id;
  check(Boolean(v2 && v3), 'operator proposes two FCA drafts (v2, v3)', { v2, v3 });

  const member = await attempt(adminUrl, MEMBER, WITHDRAW, [v2, 'Tenant member attempting withdrawal.'], true);
  check(!member.ok && member.message === 'classification_policy_operator_required', 'tenant member cannot withdraw a draft', member.message);
  const shortReason = await attempt(adminUrl, OP2, WITHDRAW, [v2, 'short'], true);
  check(!shortReason.ok && shortReason.message === 'classification_policy_reason_required', 'withdrawal requires a reason of at least 10 characters', shortReason.message);

  const activate3 = await attempt(adminUrl, OP2, ACTIVATE, [v3], true);
  check(activate3.ok, 'second operator activates v3', activate3.message);
  const stale = await attempt(adminUrl, OP2, ACTIVATE, [v2], true);
  const active = (await db.query(`select policy_version from regulatory_classification_policies where regulator_key = 'REG-FCA' and status = 'ACTIVE'`)).rows;
  check(!stale.ok && stale.message === 'classification_policy_draft_outdated' && active.length === 1 && active[0].policy_version === 3, 'activating the older v2 draft after v3 is refused; v3 stays active', { stale: stale.message, active });

  const withdraw2 = await attempt(adminUrl, OP2, WITHDRAW, [v2, 'Superseded by v3; no longer required.'], true);
  const v2Row = (await db.query(`select status from regulatory_classification_policies where id = $1`, [v2])).rows[0];
  const v2Events = (await db.query(`select event_type, actor, detail from regulatory_classification_policy_events where policy_id = $1 order by created_at, event_type`, [v2])).rows;
  check(withdraw2.ok && v2Row.status === 'WITHDRAWN', 'operator withdraws the v2 draft', { withdraw2: withdraw2.message, v2Row });
  check(
    v2Events.some((e) => e.event_type === 'POLICY_WITHDRAWN' && e.actor === OP2) &&
      v2Events.some((e) => e.event_type === 'POLICY_WITHDRAWAL_REASON' && e.detail.reason === 'Superseded by v3; no longer required.'),
    'withdrawal and its reason are in the append-only audit history, attributed to the operator',
    v2Events.map((e) => e.event_type),
  );
  const again = await attempt(adminUrl, OP2, WITHDRAW, [v2, 'Withdrawing a second time.'], true);
  const activeWithdraw = await attempt(adminUrl, OP2, WITHDRAW, [v3, 'Attempt to withdraw the active policy.'], true);
  check(
    !again.ok && again.message === 'classification_policy_transition_invalid' && !activeWithdraw.ok && activeWithdraw.message === 'classification_policy_transition_invalid',
    'only DRAFT policies can be withdrawn (not a withdrawn or active policy)',
    { again: again.message, active: activeWithdraw.message },
  );
  const reactivate = await attempt(adminUrl, OP1, ACTIVATE, [v2], true);
  check(!reactivate.ok && reactivate.message === 'classification_policy_transition_invalid', 'a withdrawn draft cannot be activated', reactivate.message);
  const editReason = await attempt(adminUrl, OP2, `update regulatory_classification_policy_events set detail = '{}'::jsonb where policy_id = $1`, [v2], true);
  check(!editReason.ok || editReason.rowCount === 0, 'withdrawal reason cannot be edited', editReason.message);

  // First policy for a regulator without one (RI-CLS-001 path): conservative, nothing converts.
  const frcEntries = fcaEntries.map((e) => ({ ...e, conversionEnabled: false, destinationQueue: e.code === 'UNKNOWN' ? 'EXCEPTION_TRIAGE' : 'NON_OBLIGATION_TRIAGE', description: `FRC ${e.code} (test)` }));
  const frc = (await attempt(adminUrl, OP1, PROPOSE, ['REG-FRC', JSON.stringify(frcEntries), 'First FRC policy for administration testing.'], true)).rows?.[0]?.id;
  const frcSelf = await attempt(adminUrl, OP1, ACTIVATE, [frc], true);
  const frcOk = await attempt(adminUrl, OP2, ACTIVATE, [frc], true);
  const frcActive = (await db.query(`select policy_version, status, approved_by_user_id from regulatory_classification_policies where regulator_key = 'REG-FRC'`)).rows;
  check(
    !frcSelf.ok && frcSelf.message === 'segregation_of_duties' && frcOk.ok && frcActive.length === 1 && frcActive[0].status === 'ACTIVE' && frcActive[0].approved_by_user_id === OP2,
    'new regulator policy: proposer cannot activate; a second operator activates FRC v1',
    { self: frcSelf.message, frcActive },
  );

  const memberRead = await attempt(adminUrl, MEMBER, `select count(*)::int n, count(*) filter (where status = 'WITHDRAWN')::int w from regulatory_classification_policies`);
  const memberEvents = await attempt(adminUrl, MEMBER, `select count(*)::int n from regulatory_classification_policy_events`);
  check(memberRead.ok && memberRead.rows[0].n === 4 && memberRead.rows[0].w === 1, 'signed-in members read every version, including withdrawn drafts', memberRead.rows?.[0]);
  check(memberEvents.ok && memberEvents.rows[0].n === 0, 'audit history stays operator-only', memberEvents.rows?.[0]);

  const rollback = await applySqlFile(db, join(platformRoot, 'supabase', 'rollbacks', MIGRATION.replace('.sql', '.down.sql'))).then(() => 'applied', (e) => e.message);
  const fnGone = (await db.query(`select count(*)::int n from pg_proc where proname = 'ri_withdraw_classification_policy'`)).rows[0].n;
  const statesKept = (await db.query(`select string_agg(regulator_key || ' v' || policy_version || ' ' || status, ', ' order by regulator_key, policy_version) s from regulatory_classification_policies`)).rows[0].s;
  check(rollback === 'applied' && fnGone === 0 && /REG-FCA v2 WITHDRAWN/.test(statesKept), 'rollback removes withdrawal and keeps policy history', { rollback, fnGone, statesKept });
} catch (e) {
  failures += 1;
  console.error('FAIL: unexpected error', e);
} finally {
  await db.end().catch(() => {});
  await stopEmbedded(embedded);
}

// Design Lab screen (pure rendering; no browser).
try {
  const ui = await import('../../../design-lab/regulatory-intelligence/js/platform/connected-classification-policy-admin.js');
  const vocabulary = {
    codes: [
      { code: 'R', legalStatus: 'binding' },
      { code: 'E', legalStatus: 'evidential' },
      { code: 'G', legalStatus: 'non_binding' },
      { code: 'UNKNOWN', legalStatus: 'unknown' },
    ],
    convertibleLegalStatuses: ['binding', 'evidential'],
    queues: ['OBLIGATION_TRIAGE', 'NON_OBLIGATION_TRIAGE', 'EXCEPTION_TRIAGE'],
    mandatoryNonBindingPublicationTypes: ['finalised_guidance', 'guidance'],
  };
  const entries = [
    { code: 'R', description: 'Rule', legalStatus: 'binding', conversionEnabled: true, destinationQueue: 'OBLIGATION_TRIAGE', supportingObligationLinkRequired: false },
    { code: 'G', description: 'Guidance', legalStatus: 'non_binding', conversionEnabled: false, destinationQueue: 'NON_OBLIGATION_TRIAGE', supportingObligationLinkRequired: false },
    { code: 'UNKNOWN', description: 'Unknown', legalStatus: 'unknown', conversionEnabled: false, destinationQueue: 'EXCEPTION_TRIAGE', supportingObligationLinkRequired: false },
  ];
  const policy = (id, version, status, createdBy) => ({
    id, regulatorKey: 'REG-FCA', policyVersion: version, effectiveFrom: '2026-11-21', status, nonBindingPublicationTypes: ['guidance'],
    changeReason: 'Test policy', createdBy, approvedBy: null, approvedAt: null, createdAt: '2026-11-21', entries,
  });
  const base = {
    vocabulary,
    regulators: [{ key: 'REG-FCA', name: 'Financial Conduct Authority', acronym: 'FCA' }, { key: 'REG-FRC', name: 'Financial Reporting Council', acronym: 'FRC' }],
    events: [],
    writesEnabled: true,
    viewerUserId: OP1,
  };
  const readOnly = ui.renderClassificationPolicyAdminPanel({ ...base, operator: false, policies: [policy('p1', 1, 'ACTIVE', 'system'), policy('p2', 2, 'DRAFT', OP2)] });
  check(/data-cp-read-only/.test(readOnly) && !/data-cp-new-draft/.test(readOnly) && !/data-cp-activate/.test(readOnly), 'screen: non-operators see policies read-only with no draft or activation controls');
  check(/no policy — fails closed/.test(readOnly) && /Converts to DRAFT obligation/.test(readOnly), 'screen: regulators without a policy are shown as failing closed; conversion eligibility is shown per code');
  const ownDraft = ui.renderClassificationPolicyAdminPanel({ ...base, operator: true, policies: [policy('p2', 2, 'DRAFT', OP1)] });
  check(/data-cp-own-draft/.test(ownDraft) && !/data-cp-activate=/.test(ownDraft) && /data-cp-new-draft/.test(ownDraft), "screen: an operator cannot activate their own draft from the screen");
  const otherDraft = ui.renderClassificationPolicyAdminPanel({ ...base, operator: true, policies: [policy('p2', 2, 'DRAFT', OP2)] });
  check(/data-cp-activate="p2"/.test(otherDraft) && /data-cp-withdraw="p2"/.test(otherDraft), "screen: a different operator can activate or withdraw another operator's draft");
  const disabled = ui.renderClassificationPolicyAdminPanel({ ...base, operator: true, writesEnabled: false, policies: [policy('p2', 2, 'DRAFT', OP2)] });
  check(/data-cp-writes-disabled/.test(disabled) && !/data-cp-activate=/.test(disabled) && !/data-cp-new-draft/.test(disabled), 'screen: no write controls when policy changes are disabled on the environment');

  const payload = ui.proposalPayload({
    regulatorKey: 'REG-FCA',
    effectiveFrom: '2026-11-21',
    nonBindingPublicationTypes: ['dear_ceo_letter'],
    changeReason: '  Route guidance to horizon scanning.  ',
    entries: [...entries.map((e) => ({ ...e, include: true })), { code: 'E', description: 'Evidential', legalStatus: 'evidential', conversionEnabled: true, destinationQueue: 'OBLIGATION_TRIAGE', supportingObligationLinkRequired: true, include: false }],
  });
  check(payload.action === 'propose' && payload.entries.length === 3 && !payload.entries.some((e) => e.code === 'E') && payload.changeReason === 'Route guidance to horizon scanning.', 'screen: proposal payload carries only included codes and a trimmed reason', payload);
  const legalErrors = validateClassificationPolicy({
    regulatorKey: payload.regulatorKey, policyVersion: 1, effectiveFrom: payload.effectiveFrom,
    nonBindingPublicationTypes: [...MANDATORY_NON_BINDING_PUBLICATION_TYPES, ...payload.nonBindingPublicationTypes],
    entries: payload.entries.map((e) => ({ ...e, legalStatus: entries.find((x) => x.code === e.code).legalStatus, humanReviewRequired: true })),
  });
  check(legalErrors.length === 0, 'screen: a proposal built by the screen passes the shared legal validation', legalErrors);
  const unlawful = validateClassificationPolicy({
    regulatorKey: 'REG-FCA', policyVersion: 1, effectiveFrom: '2026-11-21', nonBindingPublicationTypes: [],
    entries: [{ code: 'G', description: 'Guidance', legalStatus: 'non_binding', conversionEnabled: true, destinationQueue: 'OBLIGATION_TRIAGE', humanReviewRequired: true }],
  });
  check(unlawful.includes('conversion_not_permitted:G') && unlawful.includes('unknown_entry_required'), 'shared validation refuses Guidance conversion and a policy without UNKNOWN', unlawful);
} catch (e) {
  failures += 1;
  console.error('FAIL: screen rendering error', e);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
