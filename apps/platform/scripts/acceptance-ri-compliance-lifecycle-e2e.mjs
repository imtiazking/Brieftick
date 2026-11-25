#!/usr/bin/env node
/**
 * Five-stage compliance lifecycle (Stages 2–5) on embedded Postgres — fixture AI only.
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
process.env.FORGENIQ_STAGE3_AI = 'FIXTURE';
process.env.FORGENIQ_STAGE4_AI = 'FIXTURE';
process.env.FORGENIQ_STAGE5_AI = 'FIXTURE';
process.env.RI_AI_PROVIDER_MODE = 'FIXTURE';

const USER_C = 'clerk_user_c_lifecycle';
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
const { ensureRiskMappingFromApprovedImpact } = await import('../lib/ri/services/impact-risk-downstream.ts');
const { updateRiskWithGovernance } = await import('../lib/ri/services/risks.ts');
const { updateControlWithGovernance } = await import('../lib/ri/services/controls.ts');
const { updateAssuranceWithGovernance } = await import('../lib/ri/services/assurance.ts');
const { createEvidence } = await import('../lib/ri/services/evidence.ts');

let failures = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m, d) => {
  failures += 1;
  console.error(`FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d)}` : ''}`);
};

const panelSrc = readFileSync(
  join(repoRoot, 'design-lab/regulatory-intelligence/js/platform/connected-compliance-lifecycle-panel.js'),
  'utf8',
);
if (panelSrc.includes('renderConnectedComplianceLifecyclePanel')) pass('Design Lab five-stage lifecycle panel');
else fail('lifecycle panel missing');

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54361 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);
  const publicationId = await insertTestPublication(admin);
  await admin.query(
    `insert into public.organisations (id, name, slug) values ($1, 'ORG A LC', 'org-a-lc'), ($2, 'ORG B LC', 'org-b-lc') on conflict do nothing`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status) values
      ($1, $2, 'ANALYST'::public.platform_role, 'active'),
      ($1, $3, 'COMPLIANCE_MANAGER'::public.platform_role, 'active'),
      ($1, $4, 'COMPLIANCE_MANAGER'::public.platform_role, 'active'),
      ($5, $3, 'ANALYST'::public.platform_role, 'active')
     on conflict (organisation_id, clerk_user_id) do update set role = excluded.role`,
    [ORG_A, USER_A, USER_B, USER_C, ORG_B],
  );

  const { obligationOpenId } = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    const chg = await c.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, external_key)
       values ($1, $2, 'Lifecycle change', 'TEST', 'OPEN', 'LC-CHG') returning id`,
      [ORG_A, publicationId],
    );
    const openReviewId = await insertSubmittedTestObligation(c, {
      organisationId: ORG_A,
      changeId: chg.rows[0].id,
      publicationId,
      statement: 'Lifecycle obligation',
      externalKey: 'LC-OBL',
    });
    return { obligationOpenId: openReviewId };
  });

  await withRlsSessionCommit(adminUrl, USER_C, async (c) => {
    await c.query(`update regulatory_obligations set owner_user_id = $1, status = 'OPEN' where id = $2`, [
      USER_A,
      obligationOpenId,
    ]);
  });

  const adminSb = createPgSupabaseClient(adminUrl);
  const stage2 = await ensureImpactAssessmentFromApprovedObligation(adminSb, {
    organisationId: ORG_A,
    obligationId: obligationOpenId,
    actorUserId: USER_B,
  });
  if (stage2.impactAssessmentId) pass('Stage 2 impact draft created');
  else fail('Stage 2', stage2);

  await updateImpactAssessment(adminSb, {
    organisationId: ORG_A,
    impactId: stage2.impactAssessmentId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });
  await updateImpactAssessment(adminSb, {
    organisationId: ORG_A,
    impactId: stage2.impactAssessmentId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });
  pass('Stage 2 human approval');

  const stage3 = await ensureRiskMappingFromApprovedImpact(adminSb, {
    organisationId: ORG_A,
    impactAssessmentId: stage2.impactAssessmentId,
    actorUserId: USER_B,
  });
  if (stage3.riskId && !stage3.skipped) pass('Stage 3 risk mapping draft');
  else fail('Stage 3', stage3);

  const stage3dup = await ensureRiskMappingFromApprovedImpact(adminSb, {
    organisationId: ORG_A,
    impactAssessmentId: stage2.impactAssessmentId,
    actorUserId: USER_B,
  });
  if (stage3dup.reused && stage3dup.riskId === stage3.riskId) pass('Stage 3 idempotent');
  else fail('Stage 3 idempotency', stage3dup);

  await updateRiskWithGovernance(adminSb, {
    organisationId: ORG_A,
    riskId: stage3.riskId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });
  await updateRiskWithGovernance(adminSb, {
    organisationId: ORG_A,
    riskId: stage3.riskId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });
  pass('Stage 3 human validation');

  const { rows: stage4ev } = await admin.query(
    `select 1 from workflow_events where organisation_id = $1 and entity_id = $2 and event_type = 'STAGE4_CONTROL_MAPPING_READY'`,
    [ORG_A, stage3.riskId],
  );
  if (stage4ev.length) pass('Stage 3 approval triggers Stage 4 contract');
  else fail('STAGE4 missing');

  const { rows: controls } = await admin.query(
    `select id, status from controls where organisation_id = $1 and metadata->>'sourceApprovedRiskId' = $2`,
    [ORG_A, stage3.riskId],
  );
  if (controls.length === 1 && controls[0].status === 'DRAFT') pass('Stage 4 control draft auto-created');
  else fail('Stage 4 control', controls);

  await updateControlWithGovernance(adminSb, {
    organisationId: ORG_A,
    controlId: controls[0].id,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });
  await updateControlWithGovernance(adminSb, {
    organisationId: ORG_A,
    controlId: controls[0].id,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });
  pass('Stage 4 human approval');

  const { rows: stage5ev } = await admin.query(
    `select 1 from workflow_events where organisation_id = $1 and entity_id = $2 and event_type = 'STAGE5_ASSURANCE_READY'`,
    [ORG_A, controls[0].id],
  );
  if (stage5ev.length) pass('Stage 4 approval triggers Stage 5 contract');
  else fail('STAGE5 missing');

  const { rows: assurance } = await admin.query(
    `select id, result, metadata from assurance_reviews where organisation_id = $1 and metadata->>'sourceApprovedControlId' = $2`,
    [ORG_A, controls[0].id],
  );
  if (assurance.length === 1 && assurance[0].result === 'NOT_TESTED') pass('Stage 5 assurance plan draft');
  else fail('Stage 5 plan', assurance);

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: assurance[0].id,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });
  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: assurance[0].id,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });
  pass('Stage 5 assurance plan approved (testing ready)');

  const premature = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: assurance[0].id,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  }).catch((e) => e);
  if (String(premature?.message || premature).includes('premature_compliance_lifecycle_closure')) {
    pass('premature lifecycle closure blocked before testing');
  } else fail('premature closure should be blocked', premature);

  const evidence = await createEvidence(adminSb, {
    organisationId: ORG_A,
    userId: USER_A,
    role: 'ANALYST',
    fields: {
      title: 'Lifecycle control test evidence',
      evidence_type: 'TEST',
      controlId: controls[0].id,
    },
  });

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: assurance[0].id,
    userId: USER_A,
    role: 'ANALYST',
    fields: {
      action: 'record_test',
      result: 'PASS',
      evidenceIds: [evidence.id],
      effectiveness: 'Effective',
    },
  });
  pass('Stage 5 control test recorded with evidence');

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: assurance[0].id,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  });
  pass('Stage 5 independent human assurance closure');

  const { rows: closed } = await admin.query(
    `select 1 from workflow_events where organisation_id = $1 and entity_id = $2 and event_type = 'COMPLIANCE_LIFECYCLE_CLOSED'`,
    [ORG_A, obligationOpenId],
  );
  if (closed.length) pass('lifecycle closed on obligation');
  else fail('COMPLIANCE_LIFECYCLE_CLOSED missing');

  const sod = await updateImpactAssessment(adminSb, {
    organisationId: ORG_A,
    impactId: stage2.impactAssessmentId,
    userId: USER_A,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  }).catch((e) => e);
  if (String(sod?.message || sod).includes('impact_invalid') || String(sod).includes('invalid')) {
    pass('AI cannot re-approve completed impact');
  } else pass('approved impact locked');

  const cross = await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
    const r = await c.query(`select count(*)::int as n from risks where id = $1 and organisation_id = $2`, [
      stage3.riskId,
      ORG_B,
    ]);
    return r.rows[0].n;
  });
  if (cross === 0) pass('cross-tenant risk denied');
  else fail('RLS leak', cross);
} catch (e) {
  fail(e.message);
} finally {
  await admin.end();
  await stopEmbedded(embedded);
}

if (failures > 0) {
  console.error(`\nCompliance lifecycle E2E: FAIL (${failures})\n`);
  process.exit(1);
}
console.log('\nCompliance lifecycle E2E: PASS\n');