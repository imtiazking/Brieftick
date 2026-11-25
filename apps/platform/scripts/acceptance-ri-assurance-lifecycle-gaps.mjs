#!/usr/bin/env node
/**
 * Assurance execution: fail → remediation → retest → closure; duplicate events; link recovery.
 */
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
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

const USER_C = 'clerk_user_c_assurance_gaps';
const {
  ORG_A,
  USER_A,
  USER_B,
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  insertTestPublication,
  resetAndStartEmbedded,
  stopEmbedded,
  insertSubmittedTestObligation,
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

async function runLifecycleToAssurance(adminSb, adminUrl, admin) {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);
  const publicationId = await insertTestPublication(admin);
  await admin.query(
    `insert into public.organisations (id, name, slug) values ($1, 'ORG A AG', 'org-a-ag') on conflict do nothing`,
    [ORG_A],
  );
  await admin.query(
    `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status) values
      ($1, $2, 'ANALYST'::public.platform_role, 'active'),
      ($1, $3, 'COMPLIANCE_MANAGER'::public.platform_role, 'active'),
      ($1, $4, 'COMPLIANCE_MANAGER'::public.platform_role, 'active')
     on conflict (organisation_id, clerk_user_id) do update set role = excluded.role`,
    [ORG_A, USER_A, USER_B, USER_C],
  );

  const { obligationOpenId } = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    const chg = await c.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, external_key)
       values ($1, $2, 'Assurance gaps change', 'TEST', 'OPEN', 'AG-CHG') returning id`,
      [ORG_A, publicationId],
    );
    const openReviewId = await insertSubmittedTestObligation(c, {
      organisationId: ORG_A,
      changeId: chg.rows[0].id,
      publicationId,
      statement: 'Assurance gaps obligation',
      externalKey: 'AG-OBL',
    });
    return { obligationOpenId: openReviewId };
  });

  await withRlsSessionCommit(adminUrl, USER_C, async (c) => {
    await c.query(`update regulatory_obligations set owner_user_id = $1, status = 'OPEN' where id = $2`, [
      USER_A,
      obligationOpenId,
    ]);
  });

  const stage2 = await ensureImpactAssessmentFromApprovedObligation(adminSb, {
    organisationId: ORG_A,
    obligationId: obligationOpenId,
    actorUserId: USER_B,
  });
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
  const stage3 = await ensureRiskMappingFromApprovedImpact(adminSb, {
    organisationId: ORG_A,
    impactAssessmentId: stage2.impactAssessmentId,
    actorUserId: USER_B,
  });
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
  const { rows: controls } = await admin.query(
    `select id from controls where organisation_id = $1 and metadata->>'sourceApprovedRiskId' = $2`,
    [ORG_A, stage3.riskId],
  );
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
  const { rows: assurance } = await admin.query(
    `select id from assurance_reviews where organisation_id = $1 and metadata->>'sourceApprovedControlId' = $2`,
    [ORG_A, controls[0].id],
  );
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
  return { obligationOpenId, controlId: controls[0].id, assuranceId: assurance[0].id };
}

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54362 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
const adminSb = createPgSupabaseClient(adminUrl);

try {
  const ctx = await runLifecycleToAssurance(adminSb, adminUrl, admin);

  const noEvidence = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'record_test', result: 'FAIL' },
  }).catch((e) => e);
  if (String(noEvidence?.message || noEvidence).includes('assurance_test_requires_evidence')) {
    pass('record_test requires evidence');
  } else fail('missing evidence guard', noEvidence);

  const ev1 = await createEvidence(adminSb, {
    organisationId: ORG_A,
    userId: USER_A,
    role: 'ANALYST',
    fields: { title: 'Failed test evidence', evidence_type: 'TEST', controlId: ctx.controlId },
  });

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'record_test', result: 'FAIL', evidenceIds: [ev1.id] },
  });
  pass('failed control test recorded');

  const { rows: findings } = await admin.query(
    `select f.id from findings f
     join finding_assurance_review_links l on l.finding_id = f.id
     where l.assurance_review_id = $1`,
    [ctx.assuranceId],
  );
  if (findings.length) pass('finding linked to assurance');
  else fail('finding missing');

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'complete_remediation' },
  });
  pass('remediation completed');

  const ev2 = await createEvidence(adminSb, {
    organisationId: ORG_A,
    userId: USER_A,
    role: 'ANALYST',
    fields: { title: 'Retest evidence', evidence_type: 'TEST', controlId: ctx.controlId },
  });
  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'record_test', result: 'PASS', evidenceIds: [ev2.id], retest: true },
  });
  pass('retest PASS recorded');

  const blocked = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  }).catch((e) => e);
  if (String(blocked?.message || blocked).includes('assurance_closure_blocked')) {
    pass('closure blocked while open findings present');
  } else fail('should block closure with open findings', blocked);

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'accept_exception', findingId: findings[0].id },
  });
  pass('formal finding exception accepted');

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  });
  pass('lifecycle closed after remediation and retest');

  const { rows: dup } = await admin.query(
    `select count(*)::int as n from workflow_events where organisation_id = $1 and entity_id = $2 and event_type = 'COMPLIANCE_LIFECYCLE_CLOSED'`,
    [ORG_A, ctx.obligationOpenId],
  );
  if (dup[0].n === 1) pass('single lifecycle closed event');
  else fail('duplicate lifecycle closure', dup[0]);
} catch (e) {
  fail(e.message);
} finally {
  await admin.end();
  await stopEmbedded(embedded);
}

if (failures > 0) {
  console.error(`\nAssurance lifecycle gaps: FAIL (${failures})\n`);
  process.exit(1);
}
console.log('\nAssurance lifecycle gaps: PASS\n');