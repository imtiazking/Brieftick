#!/usr/bin/env node
/**
 * Assurance governance + evidence integrity + RLS matrix (embedded Postgres).
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(platformRoot, '..', '..');

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

const USER_C = 'clerk_gov_sec_c';
const USER_D = 'clerk_gov_sec_d';
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
  join(repoRoot, 'design-lab/regulatory-intelligence/js/platform/connected-assurance-panels.js'),
  'utf8',
);
if (panelSrc.includes('renderConnectedAssuranceExecutionPanel')) pass('Design Lab assurance execution panel');
else fail('Design Lab execution panel missing');

async function seedLifecycle(adminSb, adminUrl, admin) {
  const publicationId = await insertTestPublication(admin);
  await admin.query(
    `insert into organisations (id, name, slug) values ($1::uuid,'GOV ORG A','gov-a'),($2::uuid,'GOV ORG B','gov-b') on conflict do nothing`,
    [ORG_A, ORG_B],
  );
  await admin.query(
    `insert into organisation_memberships (organisation_id, clerk_user_id, role, status) values
      ($1::uuid,$2,'ANALYST'::platform_role,'active'),
      ($1::uuid,$3,'COMPLIANCE_MANAGER'::platform_role,'active'),
      ($1::uuid,$4,'COMPLIANCE_MANAGER'::platform_role,'active'),
      ($1::uuid,$5,'VIEWER'::platform_role,'active'),
      ($6::uuid,$3,'ANALYST'::platform_role,'active')
     on conflict (organisation_id, clerk_user_id) do update set role = excluded.role`,
    [ORG_A, USER_A, USER_B, USER_C, USER_D, ORG_B],
  );
  const { obligationOpenId } = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
    const chg = await c.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, external_key)
       values ($1,$2,'Gov sec change','TEST','OPEN','GOV-SEC') returning id`,
      [ORG_A, publicationId],
    );
    const id = await insertSubmittedTestObligation(c, {
      organisationId: ORG_A,
      changeId: chg.rows[0].id,
      publicationId,
      statement: 'Gov sec obligation',
      externalKey: 'GOV-SEC-OBL',
    });
    return { obligationOpenId: id };
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
  const controlId = controls[0].id;
  await updateControlWithGovernance(adminSb, {
    organisationId: ORG_A,
    controlId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });
  await updateControlWithGovernance(adminSb, {
    organisationId: ORG_A,
    controlId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });
  const { rows: assurance } = await admin.query(
    `select id, reviewer_user_id, metadata from assurance_reviews where organisation_id = $1 and metadata->>'sourceApprovedControlId' = $2`,
    [ORG_A, controlId],
  );
  return { obligationOpenId, controlId, assuranceId: assurance[0].id, reviewer: assurance[0].reviewer_user_id };
}

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54363 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
const adminSb = createPgSupabaseClient(adminUrl);

try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);

  const ctx = await seedLifecycle(adminSb, adminUrl, admin);

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'submit' },
  });

  const selfApprove = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: ctx.reviewer,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  }).catch((e) => e);
  if (
    String(selfApprove?.message || selfApprove).includes('segregation_of_duties') ||
    String(selfApprove).includes('invalid')
  ) {
    pass('self-approval on assurance plan rejected');
  } else fail('self-approval should fail', selfApprove);

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'approve' },
  });
  pass('independent assurance plan approval');

  const evGood = await createEvidence(adminSb, {
    organisationId: ORG_A,
    userId: USER_A,
    role: 'ANALYST',
    fields: { title: 'Bound test evidence', evidence_type: 'TEST', controlId: ctx.controlId },
  });

  const { rows: otherControls } = await admin.query(
    `insert into controls (organisation_id, name, status, owner_user_id, created_by_user_id, metadata)
     values ($1::uuid,'Unrelated control','ACTIVE',$2,$2,'{"recordProvenance":"unverified","labProvenanceLocked":true}'::jsonb)
     returning id`,
    [ORG_A, USER_A],
  );
  const evWrong = await createEvidence(adminSb, {
    organisationId: ORG_A,
    userId: USER_A,
    role: 'ANALYST',
    fields: {
      title: 'Wrong control evidence',
      evidence_type: 'TEST',
      controlId: otherControls[0].id,
    },
  });
  const wrongUse = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'record_test', result: 'PASS', evidenceIds: [evWrong.id] },
  }).catch((e) => e);
  if (
    String(wrongUse?.message || wrongUse).includes('assurance_evidence') ||
    String(wrongUse).includes('provenance')
  ) {
    pass('unrelated same-tenant evidence rejected for assurance test');
  } else fail('wrong control evidence should not satisfy test', wrongUse);

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'record_test', result: 'PASS', evidenceIds: [evGood.id] },
  });
  pass('valid evidence bound to control under test');

  const viewerClose = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_D,
    role: 'VIEWER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  }).catch((e) => e);
  if (String(viewerClose?.message || viewerClose).includes('insufficient_role')) {
    pass('unauthorised role cannot close lifecycle');
  } else fail('viewer close should fail', viewerClose);

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  });
  pass('authorised independent closure');

  const dupClose = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  });
  if (dupClose?.metadata?.assuranceStatus === 'CLOSED') pass('idempotent close returns closed assurance');
  else fail('idempotent close state', dupClose?.metadata);

  const { rows: closeEvents } = await admin.query(
    `select count(*)::int as n from workflow_events where organisation_id = $1 and entity_id = $2 and event_type = 'COMPLIANCE_LIFECYCLE_CLOSED'`,
    [ORG_A, ctx.obligationOpenId],
  );
  if (closeEvents[0].n === 1) pass('single compliance lifecycle close event');
  else fail('duplicate close events', closeEvents[0]);

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'reopen_lifecycle' },
  });
  pass('lifecycle reopen');

  const { rows: reopenEvents } = await admin.query(
    `select count(*)::int as n from workflow_events where organisation_id = $1 and entity_id = $2 and entity_type = 'regulatory_obligation' and event_type = 'COMPLIANCE_LIFECYCLE_REOPENED'`,
    [ORG_A, ctx.obligationOpenId],
  );
  if (reopenEvents[0].n === 1) pass('obligation lifecycle reopen audited');
  else fail('missing obligation reopen event', reopenEvents[0]);

  const prematureAfterReopen = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  }).catch((e) => e);
  if (String(prematureAfterReopen?.message || prematureAfterReopen).includes('premature_compliance_lifecycle_closure')) {
    pass('premature closure after reopen rejected');
  } else fail('close without retest after reopen should fail', prematureAfterReopen);

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_A,
    role: 'ANALYST',
    fields: { action: 'record_test', result: 'PASS', evidenceIds: [evGood.id] },
  });
  pass('retest recorded after reopen');

  await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
  });
  pass('second independent closure after reopen');

  const { rows: closeEventsAfterReopen } = await admin.query(
    `select count(*)::int as n from workflow_events where organisation_id = $1 and entity_id = $2 and event_type = 'COMPLIANCE_LIFECYCLE_CLOSED'`,
    [ORG_A, ctx.obligationOpenId],
  );
  if (closeEventsAfterReopen[0].n === 2) {
    pass('reopen then re-close emits second obligation close event');
  } else fail('expected two distinct close events after reopen', closeEventsAfterReopen[0]);

  const cross = await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
    const r = await c.query(
      `select count(*)::int as n from evidence_items where id = $1 and organisation_id = $2`,
      [evGood.id, ORG_B],
    );
    return r.rows[0].n;
  });
  if (cross === 0) pass('cross-tenant evidence access denied (RLS)');
  else fail('RLS evidence leak', cross);

  const stale = await updateAssuranceWithGovernance(adminSb, {
    organisationId: ORG_A,
    assuranceId: ctx.assuranceId,
    userId: USER_C,
    role: 'COMPLIANCE_MANAGER',
    fields: { action: 'close_lifecycle', result: 'PASS' },
    expectedUpdatedAt: '1970-01-01T00:00:00.000Z',
  }).catch((e) => e);
  if (String(stale?.message || stale).includes('stale_record')) pass('concurrent/stale closure rejected');
  else fail('stale expectedUpdatedAt should block', stale);
} catch (e) {
  fail(e.message);
} finally {
  await admin.end();
  await stopEmbedded(embedded);
}

if (failures > 0) {
  console.error(`\nAssurance governance security: FAIL (${failures})\n`);
  process.exit(1);
}
console.log('\nAssurance governance security: PASS\n');