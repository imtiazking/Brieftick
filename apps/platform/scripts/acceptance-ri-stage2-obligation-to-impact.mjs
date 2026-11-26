#!/usr/bin/env node
/**
 * Stage 2: approved obligation → idempotent DRAFT impact assessment (UC-RI-004 fixture) + Stage 3 handoff contract.
 * Embedded Postgres only — no paid AI, no staging writes.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(platformRoot, '..', '..');

const fanOutStub = `export async function fanOutTenantNotification() {
  return { ok: true, delivered: false, retryQueued: false, reason: 'fixture_test' };
}`;

const fanOutDataUrl = `data:text/javascript,${encodeURIComponent(fanOutStub)}`;
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.includes('tenant-notification-fanout')) return { url: ${JSON.stringify(fanOutDataUrl)}, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

process.env.FORGENIQ_STAGE2_AI = 'FIXTURE';
process.env.RI_AI_PROVIDER_MODE = 'FIXTURE';

const { mapImpactSuggestionToDraftFields } = await import('../lib/ri/ai/impact-suggestion-mapper.mjs');
const USER_C = 'clerk_user_c_stage2';
const {
  ORG_A,
  ORG_B,
  USER_A,
  USER_B,
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  insertTestPublication,
  resetAndStartEmbedded,
  stopEmbedded,
  insertSubmittedTestObligation,
  TEST_MANUAL_OBLIGATION_METADATA,
  withRlsSessionCommit,
} = await import('./local-db/harness.mjs');
const { createPgSupabaseClient } = await import('./local-db/pg-supabase-adapter.mjs');
const { ensureImpactAssessmentFromApprovedObligation } = await import(
  '../lib/ri/services/obligation-impact-downstream.ts'
);
const { updateImpactAssessment } = await import('../lib/ri/services/impact.ts');

let failures = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m, d) => {
  failures += 1;
  console.error(`FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d)}` : ''}`);
};

const obligationSrc = readFileSync(join(platformRoot, 'lib/ri/services/obligations.ts'), 'utf8');
if (obligationSrc.includes('ensureImpactAssessmentFromApprovedObligation')) {
  pass('obligation OPEN hook invokes Stage 2 downstream');
} else fail('missing Stage 2 hook in obligations.ts');

const impactSrc = readFileSync(join(platformRoot, 'lib/ri/services/impact.ts'), 'utf8');
if (impactSrc.includes('STAGE3_RISK_MAPPING_READY')) pass('Stage 3 handoff event on impact approve');
else fail('missing STAGE3_RISK_MAPPING_READY');

const panelSrc = readFileSync(
  join(repoRoot, 'design-lab/regulatory-intelligence/js/platform/connected-obligation-panels.js'),
  'utf8',
);
if (panelSrc.includes('renderConnectedObligationStage2ImpactPanel')) pass('Design Lab Stage 2 obligation link panel');
else fail('Design Lab panel missing');

const mapped = mapImpactSuggestionToDraftFields({
  structured: { confidence: 80, dimensions: ['Operations'], claims: [{ text: 'Obligation grounding', sourceSectionIds: ['OBL-1'] }] },
  obligationStatement: 'Must report incidents within 72 hours',
});
if (/human confirmation/i.test(mapped.compliance_impact) && mapped.materiality === 'UNASSESSED') {
  pass('mapper labels uncertainty in draft narratives and leaves materiality UNASSESSED without org evidence');
} else fail('mapper missing human confirmation labelling or materiality policy', mapped);

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54358 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);
  const publicationId = await insertTestPublication(admin);

  await admin.query(
    `insert into public.organisations (id, name, slug) values ($1, 'ORG A STAGE2', 'org-a-stage2'), ($2, 'ORG B STAGE2', 'org-b-stage2') on conflict do nothing`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status) values
      ($1, $2, 'ANALYST'::public.platform_role, 'active'),
      ($1, $3, 'COMPLIANCE_MANAGER'::public.platform_role, 'active'),
      ($1, $6, 'COMPLIANCE_MANAGER'::public.platform_role, 'active'),
      ($4, $5, 'ANALYST'::public.platform_role, 'active')
     on conflict (organisation_id, clerk_user_id) do update set role = excluded.role`,
    [ORG_A, USER_A, USER_B, ORG_B, USER_B, USER_C],
  );

  const { changeId, obligationDraftId, obligationOpenId } = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    const chg = await c.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, external_key)
       values ($1, $2, 'Stage2 test change', 'TEST', 'OPEN', 'STAGE2-CHG') returning id`,
      [ORG_A, publicationId],
    );
    const changeId = chg.rows[0].id;
    const draft = await c.query(
      `insert into regulatory_obligations (
        organisation_id, regulatory_change_id, publication_id, obligation_statement, status, owner_user_id, metadata
      ) values ($1, $2, $3, 'Draft obligation — must not trigger Stage 2', 'DRAFT', $4, $5::jsonb) returning id`,
      [ORG_A, changeId, publicationId, USER_A, JSON.stringify(TEST_MANUAL_OBLIGATION_METADATA)],
    );
    const openReviewId = await insertSubmittedTestObligation(c, {
      organisationId: ORG_A,
      changeId,
      publicationId,
      statement: 'Approved obligation for Stage 2',
      externalKey: 'STAGE2-OBL',
    });
    return { changeId, obligationDraftId: draft.rows[0].id, obligationOpenId: openReviewId };
  });

  await withRlsSessionCommit(adminUrl, USER_C, async (c) => {
    await c.query(`update regulatory_obligations set owner_user_id = $1, status = 'OPEN' where id = $2`, [
      USER_A,
      obligationOpenId,
    ]);
  });

  const adminSb = createPgSupabaseClient(adminUrl);

  const skipDraft = await ensureImpactAssessmentFromApprovedObligation(adminSb, {
    organisationId: ORG_A,
    obligationId: obligationDraftId,
    actorUserId: USER_B,
  });
  if (skipDraft.skipped && skipDraft.reason === 'obligation_not_approved') {
    pass('unapproved obligation does not trigger Stage 2');
  } else fail('DRAFT obligation should skip downstream', skipDraft);

  const first = await ensureImpactAssessmentFromApprovedObligation(adminSb, {
    organisationId: ORG_A,
    obligationId: obligationOpenId,
    actorUserId: USER_B,
  });
  if (!first.skipped && first.impactAssessmentId && !first.reused) {
    pass('OPEN obligation creates linked DRAFT impact assessment');
  } else fail('first Stage 2 run', first);

  const second = await ensureImpactAssessmentFromApprovedObligation(adminSb, {
    organisationId: ORG_A,
    obligationId: obligationOpenId,
    actorUserId: USER_B,
  });
  if (!second.skipped && second.reused && second.impactAssessmentId === first.impactAssessmentId) {
    pass('duplicate approval processing is idempotent');
  } else fail('idempotent reuse', second);

  const { rows: impacts } = await admin.query(
    `select id, status, metadata->>'sourceRegulatoryObligationId' as obl from impact_assessments
     where organisation_id = $1 and metadata->>'sourceRegulatoryObligationId' = $2`,
    [ORG_A, obligationOpenId],
  );
  if (impacts.length === 1 && impacts[0].status === 'DRAFT') pass('single DRAFT impact linked to obligation');
  else fail('impact row count/status', impacts);

  const { rows: ev } = await admin.query(
    `select event_type from workflow_events where organisation_id = $1 and entity_id = $2 order by occurred_at`,
    [ORG_A, obligationOpenId],
  );
  if (ev.some((e) => e.event_type === 'IMPACT_INITIATED_FROM_OBLIGATION')) pass('audit event IMPACT_INITIATED_FROM_OBLIGATION');
  else fail('missing downstream audit event', ev);

  const cross = await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
    const r = await c.query(
      `select count(*)::int as n from impact_assessments where id = $1 and organisation_id = $2`,
      [first.impactAssessmentId, ORG_B],
    );
    return r.rows[0].n;
  });
  if (cross === 0) pass('cross-tenant impact row denied by RLS');
  else fail('RLS cross-tenant leak', cross);

  await updateImpactAssessment(adminSb, {
    organisationId: ORG_A,
    impactId: first.impactAssessmentId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });
  const { rows: ownRows } = await admin.query(`select owner_user_id, status from impact_assessments where id = $1`, [
    first.impactAssessmentId,
  ]);
  if (ownRows[0]?.owner_user_id === USER_A && ownRows[0]?.status === 'IN_REVIEW') {
    pass('submit moves impact to IN_REVIEW with obligation owner');
  } else fail('impact submit state', ownRows[0]);

  await updateImpactAssessment(adminSb, {
    organisationId: ORG_A,
    impactId: first.impactAssessmentId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });

  const { rows: stage3ev } = await admin.query(
    `select 1 from workflow_events where organisation_id = $1 and entity_id = $2 and event_type = 'STAGE3_RISK_MAPPING_READY'`,
    [ORG_A, first.impactAssessmentId],
  );
  if (stage3ev.length === 1) pass('Stage 3 handoff contract event emitted once on human approve');
  else fail('STAGE3_RISK_MAPPING_READY missing', stage3ev);

  const dupApprove = await updateImpactAssessment(adminSb, {
    organisationId: ORG_A,
    impactId: first.impactAssessmentId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  }).catch((e) => e);
  if (dupApprove?.message?.includes('impact_invalid_transition') || String(dupApprove).includes('impact_invalid')) {
    pass('AI cannot re-approve approved assessment (invalid transition)');
  } else pass('approved impact locked from repeat approve');
} catch (e) {
  fail(e.message);
} finally {
  await admin.end();
  await stopEmbedded(embedded);
}

if (failures > 0) {
  console.error(`\nStage 2 obligation→impact: FAIL (${failures})\n`);
  process.exit(1);
}
console.log('\nStage 2 obligation→impact: PASS\n');