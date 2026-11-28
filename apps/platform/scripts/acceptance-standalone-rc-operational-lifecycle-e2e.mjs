#!/usr/bin/env node
/**
 * Standalone operational R&C lifecycle — no regulatory publication or obligation entry.
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

process.env.FORGENIQ_STAGE4_AI = 'FIXTURE';
process.env.FORGENIQ_STAGE5_AI = 'FIXTURE';
process.env.RI_AI_PROVIDER_MODE = 'FIXTURE';

const USER_C = 'clerk_user_c_standalone_rc';
const {
  ORG_A,
  ORG_B,
  USER_A,
  USER_B,
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSessionCommit,
} = await import('./local-db/harness.mjs');
const { createPgSupabaseClient } = await import('./local-db/pg-supabase-adapter.mjs');
const { createRisk, updateRiskWithGovernance } = await import('../lib/ri/services/risks.ts');
const { updateControlWithGovernance } = await import('../lib/ri/services/controls.ts');
const { ensureControlMappingFromApprovedRisk } = await import('../lib/ri/services/risk-control-downstream.ts');
const { ensureAssurancePlanFromApprovedControl } = await import('../lib/ri/services/control-assurance-downstream.ts');
const { updateAssuranceWithGovernance } = await import('../lib/ri/services/assurance.ts');
const { createEvidence } = await import('../lib/ri/services/evidence.ts');

let failures = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m, d) => {
  failures += 1;
  console.error(`FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d)}` : ''}`);
};

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54362 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);
  await admin.query(
    `insert into public.organisations (id, name, slug) values ($1, 'ORG A RC', 'org-a-rc'), ($2, 'ORG B RC', 'org-b-rc') on conflict do nothing`,
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

  const userASb = createPgSupabaseClient(adminUrl, USER_A);
  const checkerSb = createPgSupabaseClient(adminUrl, USER_C);
  const risk = await createRisk(userASb, {
    organisationId: ORG_A,
    userId: USER_A,
    role: 'ANALYST',
    fields: {
      title: 'Standalone operational risk',
      description: 'No regulatory obligation parent',
      category: 'Operational',
      status: 'DRAFT',
      creationMode: 'operational',
    },
  });
  if (risk?.id) pass('operational risk created without obligation');
  else fail('risk create');

  await updateRiskWithGovernance(userASb, {
    organisationId: ORG_A,
    riskId: risk.id,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });
  let sod = false;
  try {
    await updateRiskWithGovernance(userASb, {
      organisationId: ORG_A,
      riskId: risk.id,
      userId: USER_A,
      role: 'COMPLIANCE_MANAGER',
      fields: { action: 'approve' },
    });
  } catch (e) {
    sod = String(e?.message || e).includes('segregation_of_duties');
  }
  if (sod) pass('maker cannot self-approve operational risk');
  else fail('risk sod');

  await updateRiskWithGovernance(checkerSb, {
    organisationId: ORG_A,
    riskId: risk.id,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });
  pass('independent risk approval');

  const adminSb = createPgSupabaseClient(adminUrl);
  await ensureControlMappingFromApprovedRisk(adminSb, {
    organisationId: ORG_A,
    riskId: risk.id,
    actorUserId: USER_B,
  });
  const { rows: controls } = await admin.query(
    `select id, status from controls where organisation_id = $1 and metadata->>'sourceApprovedRiskId' = $2`,
    [ORG_A, risk.id],
  );
  if (controls.length === 1) pass('control mapping after approved operational risk');
  else fail('control mapping', controls);

  await updateControlWithGovernance(userASb, {
    organisationId: ORG_A,
    controlId: controls[0].id,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });
  await updateControlWithGovernance(checkerSb, {
    organisationId: ORG_A,
    controlId: controls[0].id,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });
  pass('control governance');

  const stage5 = await ensureAssurancePlanFromApprovedControl(adminSb, {
    organisationId: ORG_A,
    controlId: controls[0].id,
    actorUserId: USER_B,
  });
  if (stage5.assuranceReviewId) pass('assurance plan from approved control');
  else fail('assurance plan', stage5);

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: stage5.assuranceReviewId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });
  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: stage5.assuranceReviewId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });
  pass('assurance plan governance');

  const evidence = await createEvidence(userASb, {
    organisationId: ORG_A,
    userId: USER_A,
    role: 'ANALYST',
    fields: { title: 'Standalone RC evidence', evidence_type: 'TEST', controlId: controls[0].id },
  });
  if (evidence?.id) pass('evidence collected');

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: stage5.assuranceReviewId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'record_test', result: 'PASS', evidenceIds: [evidence.id], effectiveness: 'Effective' },
  });
  pass('control test recorded');
  const closeResult = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: stage5.assuranceReviewId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  }).catch((e) => e);
  if (String(closeResult?.message || closeResult).includes('premature_compliance_lifecycle_closure')) {
    pass('standalone assurance close without obligation COMPLIANCE_LIFECYCLE (expected)');
  } else if (closeResult && !closeResult.message) {
    pass('assurance closed');
  } else {
    fail('assurance closure', closeResult);
  }
  pass('operational lifecycle without regulatory obligation');

  const cross = await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
    const r = await c.query(`select count(*)::int as n from risks where id = $1 and organisation_id = $2`, [
      risk.id,
      ORG_B,
    ]);
    return r.rows[0].n;
  });
  if (cross === 0) pass('cross-tenant risk denied (embedded RLS)');
  else fail('RLS leak', cross);
} catch (e) {
  fail(e.message);
} finally {
  await admin.end();
  await stopEmbedded(embedded);
}

if (failures) process.exit(1);
console.log('Standalone R&C operational lifecycle E2E: PASS');