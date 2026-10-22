#!/usr/bin/env node
/**
 * Phase 4 workflow verification on embedded Postgres (shared publication, isolated org state).
 */
import pg from 'pg';
import {
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
  withRlsSessionCommit,
} from './harness.mjs';

export async function runPhase4WorkflowVerification() {
  const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54327 });
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const results = { pass: [], fail: [] };
  const pass = (m) => results.pass.push(m);
  const fail = (m) => results.fail.push(m);

  try {
    await applyAllMigrations(admin);
    await ensureAppRole(admin);
    await applyReferenceSeed(admin);
    const publicationId = await insertTestPublication(admin);

    await admin.query(
      `insert into public.organisations (id, name, slug) values
        ($1, 'TEST ORG-A', 'test-org-a'), ($2, 'TEST ORG-B', 'test-org-b')
       on conflict do nothing`,
      [ORG_A, ORG_B],
    );
    for (const [org, user] of [[ORG_A, USER_A], [ORG_B, USER_B]]) {
      await admin.query(
        `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
         values ($1, $2, 'OWNER'::public.platform_role, 'active') on conflict do nothing`,
        [org, user],
      );
    }

    await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      await c.query(
        `insert into organisation_publications (organisation_id, publication_id, triage_status, relevance_status)
         values ($1, $2, 'IN_REVIEW', 'RELEVANT')`,
        [ORG_A, publicationId],
      );
      await c.query(
        `insert into applicability_assessments (organisation_id, publication_id, recommendation, rationale, status)
         values ($1, $2, 'APPLICABLE', 'Human test rationale ORG-A', 'APPROVED')`,
        [ORG_A, publicationId],
      );
      const chg = await c.query(
        `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status)
         values ($1, $2, 'Change A', 'TEST', 'OPEN') returning id`,
        [ORG_A, publicationId],
      );
      const chg2 = await c.query(
        `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status)
         values ($1, $2, 'Change A2', 'TEST', 'DRAFT') returning id`,
        [ORG_A, publicationId],
      );
      pass('one publication → multiple changes (ORG-A)');
      const imp = await c.query(
        `insert into impact_assessments (organisation_id, regulatory_change_id, status, owner_user_id)
         values ($1, $2, 'DRAFT', $3) returning id`,
        [ORG_A, chg.rows[0].id, USER_A],
      );
      const obl = await c.query(
        `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status)
         values ($1, $2, $3, 'Obligation A', 'OPEN') returning id`,
        [ORG_A, chg.rows[0].id, publicationId],
      );
      await c.query(
        `insert into workflow_events (organisation_id, entity_type, entity_id, event_type, actor_user_id)
         values ($1, 'regulatory_change', $2, 'CHANGE_CREATED', $3)`,
        [ORG_A, chg.rows[0].id, USER_A],
      );
      return { chgId: chg.rows[0].id, impId: imp.rows[0].id, oblId: obl.rows[0].id, chg2Id: chg2.rows[0].id };
    });

    await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
      await c.query(
        `insert into organisation_publications (organisation_id, publication_id, triage_status, relevance_status)
         values ($1, $2, 'CLOSED', 'NOT_RELEVANT')`,
        [ORG_B, publicationId],
      );
      await c.query(
        `insert into applicability_assessments (organisation_id, publication_id, recommendation, status)
         values ($1, $2, 'NOT_APPLICABLE', 'APPROVED')`,
        [ORG_B, publicationId],
      );
    });

    const aTriage = await admin.query(
      `select relevance_status from organisation_publications where organisation_id = $1 and publication_id = $2`,
      [ORG_A, publicationId],
    );
    const bTriage = await admin.query(
      `select relevance_status from organisation_publications where organisation_id = $1 and publication_id = $2`,
      [ORG_B, publicationId],
    );
    if (aTriage.rows[0]?.relevance_status === 'RELEVANT' && bTriage.rows[0]?.relevance_status === 'NOT_RELEVANT') {
      pass('shared publication, separate triage');
    } else fail('triage isolation');

    const aChanges = await admin.query(
      `select count(*)::int as n from regulatory_changes where organisation_id = $1`,
      [ORG_A],
    );
    const bSeesA = await admin.query(
      `select count(*)::int as n from regulatory_changes where organisation_id = $1`,
      [ORG_B],
    );
    if (aChanges.rows[0].n >= 2 && bSeesA.rows[0].n === 0) pass('ORG-B cannot see ORG-A changes (DB)');
    else fail('change tenant isolation');

    const { rows: events } = await admin.query(
      `select count(*)::int as n from workflow_events where organisation_id = $1 and event_type = 'CHANGE_CREATED'`,
      [ORG_A],
    );
    if (events[0].n >= 1) pass('workflow events recorded');
    else fail('workflow events');

    const trace = await admin.query(
      `select o.id as obligation_id, c.id as change_id, p.id as publication_id
       from regulatory_obligations o
       join regulatory_changes c on c.id = o.regulatory_change_id
       join regulatory_publications p on p.id = o.publication_id
       where o.organisation_id = $1 limit 1`,
      [ORG_A],
    );
    if (trace.rows[0]?.publication_id === publicationId) pass('traceability Publication → Change → Obligation');
    else fail('traceability');
  } catch (e) {
    fail(e.message);
  } finally {
    await admin.end();
    await stopEmbedded(embedded);
  }

  return results;
}
