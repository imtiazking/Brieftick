#!/usr/bin/env node
/**
 * Risk maker cannot approve own IN_REVIEW risk — no status mutation on denial.
 */
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const USER_C = 'clerk_user_c_risk_sod';
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
  withRlsSessionCommit,
} = await import('./local-db/harness.mjs');
const { createPgSupabaseClient } = await import('./local-db/pg-supabase-adapter.mjs');
const { ensureImpactAssessmentFromApprovedObligation } = await import(
  '../lib/ri/services/obligation-impact-downstream.ts'
);
const { updateImpactAssessment } = await import('../lib/ri/services/impact.ts');
const { ensureRiskMappingFromApprovedImpact } = await import('../lib/ri/services/impact-risk-downstream.ts');
const { updateRiskWithGovernance } = await import('../lib/ri/services/risks.ts');

const { adminUrl } = await resetAndStartEmbedded({ port: 54364 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);
  const publicationId = await insertTestPublication(admin);
  await admin.query(
    `insert into public.organisations (id, name, slug) values ($1, 'ORG A SOD', 'org-a-sod'), ($2, 'ORG B SOD', 'org-b-sod') on conflict do nothing`,
    [ORG_A, ORG_B],
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
       values ($1, $2, 'Risk SOD change', 'TEST', 'OPEN', 'RISK-SOD-CHG') returning id`,
      [ORG_A, publicationId],
    );
    const openReviewId = await insertSubmittedTestObligation(c, {
      organisationId: ORG_A,
      changeId: chg.rows[0].id,
      publicationId,
      statement: 'Risk SOD obligation',
      externalKey: 'RISK-SOD-OBL',
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

  const before = await admin.query(`select status from risks where id = $1`, [stage3.riskId]);
  let denied = false;
  try {
    await updateRiskWithGovernance(adminSb, {
      organisationId: ORG_A,
      riskId: stage3.riskId,
      userId: USER_A,
      role: 'COMPLIANCE_MANAGER',
      fields: { action: 'approve' },
    });
  } catch (e) {
    denied = String(e?.message || e).includes('segregation_of_duties');
  }
  const after = await admin.query(`select status from risks where id = $1`, [stage3.riskId]);
  if (!denied) throw new Error('expected_segregation_of_duties');
  if (before.rows[0].status !== after.rows[0].status || after.rows[0].status !== 'IN_REVIEW') {
    throw new Error('risk_status_mutated_on_sod_denial');
  }
  console.log('PASS risk_owner_self_approve — segregation enforced, status remains IN_REVIEW');
} finally {
  await admin.end();
  await stopEmbedded();
}