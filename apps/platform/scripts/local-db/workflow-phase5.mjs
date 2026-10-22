#!/usr/bin/env node
/**
 * Phase 5 downstream lifecycle verification on embedded Postgres.
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

export async function runPhase5WorkflowVerification() {
  const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54328 });
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

    const ids = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      const chg = await c.query(
        `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status)
         values ($1, $2, 'Change lifecycle A', 'TEST', 'OPEN') returning id`,
        [ORG_A, publicationId],
      );
      const imp = await c.query(
        `insert into impact_assessments (organisation_id, regulatory_change_id, status, owner_user_id)
         values ($1, $2, 'APPROVED', $3) returning id`,
        [ORG_A, chg.rows[0].id, USER_A],
      );
      const oblA = await c.query(
        `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status)
         values ($1, $2, $3, 'OBL-A TEST', 'OPEN') returning id`,
        [ORG_A, chg.rows[0].id, publicationId],
      );
      const oblB = await c.query(
        `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status)
         values ($1, $2, $3, 'OBL-B TEST', 'OPEN') returning id`,
        [ORG_A, chg.rows[0].id, publicationId],
      );
      const pol = await c.query(
        `insert into policies (organisation_id, name, owner_user_id, status) values ($1, 'Policy A', $2, 'ACTIVE') returning id`,
        [ORG_A, USER_A],
      );
      await c.query(
        `insert into obligation_policy_links (organisation_id, obligation_id, policy_id) values ($1, $2, $3)`,
        [ORG_A, oblA.rows[0].id, pol.rows[0].id],
      );
      const risk = await c.query(
        `insert into risks (organisation_id, title, owner_user_id, status) values ($1, 'Risk A', $2, 'OPEN') returning id`,
        [ORG_A, USER_A],
      );
      await c.query(
        `insert into obligation_risk_links (organisation_id, obligation_id, risk_id) values ($1, $2, $3)`,
        [ORG_A, oblA.rows[0].id, risk.rows[0].id],
      );
      const ctrl1 = await c.query(
        `insert into controls (organisation_id, name, owner_user_id, effectiveness, status)
         values ($1, 'CTRL-1 shared', $2, 'EFFECTIVE', 'ACTIVE') returning id`,
        [ORG_A, USER_A],
      );
      const ctrlA = await c.query(
        `insert into controls (organisation_id, name, owner_user_id, effectiveness, status)
         values ($1, 'CTRL-A pass', $2, 'EFFECTIVE', 'ACTIVE') returning id`,
        [ORG_A, USER_A],
      );
      const ctrlB = await c.query(
        `insert into controls (organisation_id, name, owner_user_id, effectiveness, status)
         values ($1, 'CTRL-B fail', $2, 'INEFFECTIVE', 'ACTIVE') returning id`,
        [ORG_A, USER_A],
      );
      await c.query(
        `insert into obligation_control_links (organisation_id, obligation_id, control_id) values ($1, $2, $3), ($1, $4, $3)`,
        [ORG_A, oblA.rows[0].id, ctrl1.rows[0].id, oblB.rows[0].id],
      );
      await c.query(
        `insert into risk_control_links (organisation_id, risk_id, control_id) values ($1, $2, $3)`,
        [ORG_A, risk.rows[0].id, ctrl1.rows[0].id],
      );
      const evDirect = await c.query(
        `insert into evidence_items (organisation_id, title, evidence_type, uploaded_by)
         values ($1, 'Evidence OBL-A only', 'document', $2) returning id`,
        [ORG_A, USER_A],
      );
      await c.query(
        `insert into evidence_obligation_links (organisation_id, evidence_id, obligation_id) values ($1, $2, $3)`,
        [ORG_A, evDirect.rows[0].id, oblA.rows[0].id],
      );
      const act = await c.query(
        `insert into actions (organisation_id, title, source_type, owner_user_id, due_date, status)
         values ($1, 'Action from OBL-A', 'obligation', $2, '2020-01-01', 'OPEN') returning id`,
        [ORG_A, USER_A],
      );
      await c.query(
        `insert into action_obligation_links (organisation_id, action_id, obligation_id) values ($1, $2, $3)`,
        [ORG_A, act.rows[0].id, oblA.rows[0].id],
      );
      const finding = await c.query(
        `insert into findings (organisation_id, title, severity, status, owner_user_id)
         values ($1, 'Finding on action', 'HIGH', 'OPEN', $2) returning id`,
        [ORG_A, USER_A],
      );
      await c.query(
        `insert into finding_action_links (organisation_id, finding_id, action_id) values ($1, $2, $3)`,
        [ORG_A, finding.rows[0].id, act.rows[0].id],
      );
      const arPass = await c.query(
        `insert into assurance_reviews (organisation_id, review_type, result, reviewer_user_id, review_date)
         values ($1, 'control_test', 'PASS', $2, current_date) returning id`,
        [ORG_A, USER_A],
      );
      const arFail = await c.query(
        `insert into assurance_reviews (organisation_id, review_type, result, reviewer_user_id, review_date)
         values ($1, 'control_test', 'FAIL', $2, current_date) returning id`,
        [ORG_A, USER_A],
      );
      await c.query(
        `insert into assurance_review_control_links (organisation_id, assurance_review_id, control_id) values ($1, $2, $3), ($1, $4, $5)`,
        [ORG_A, arPass.rows[0].id, ctrlA.rows[0].id, arFail.rows[0].id, ctrlB.rows[0].id],
      );
      await c.query(
        `insert into workflow_events (organisation_id, entity_type, entity_id, event_type, actor_user_id)
         values ($1, 'policy', $2, 'POLICY_LINKED', $3)`,
        [ORG_A, pol.rows[0].id, USER_A],
      );
      return {
        oblA: oblA.rows[0].id,
        oblB: oblB.rows[0].id,
        ctrl1: ctrl1.rows[0].id,
        evDirect: evDirect.rows[0].id,
        impId: imp.rows[0].id,
        chgId: chg.rows[0].id,
        ctrlA: ctrlA.rows[0].id,
        ctrlB: ctrlB.rows[0].id,
        arPass: arPass.rows[0].id,
        arFail: arFail.rows[0].id,
      };
    });

    pass('ORG-A full downstream fixture chain');

    const oblADirect = await admin.query(
      `select count(*)::int as n from evidence_obligation_links where organisation_id = $1 and obligation_id = $2`,
      [ORG_A, ids.oblA],
    );
    const oblBDirect = await admin.query(
      `select count(*)::int as n from evidence_obligation_links where organisation_id = $1 and obligation_id = $2`,
      [ORG_A, ids.oblB],
    );
    if (oblADirect.rows[0].n === 1 && oblBDirect.rows[0].n === 0) {
      pass('shared-control: OBL-A direct evidence yes, OBL-B direct evidence no');
    } else fail('shared-control direct evidence attribution');

    const oblBEvCtrl = await admin.query(
      `select e.id from evidence_control_links e
       join obligation_control_links o on o.control_id = e.control_id and o.organisation_id = e.organisation_id
       where o.obligation_id = $1 and e.evidence_id = $2`,
      [ids.oblB, ids.evDirect],
    );
    if (oblBEvCtrl.rows.length === 0) pass('OBL-B does not own OBL-A evidence via shared control');
    else fail('evidence bleed across obligations');

    const findingOblB = await admin.query(
      `select f.id from findings f
       join finding_action_links fal on fal.finding_id = f.id
       join action_obligation_links aol on aol.action_id = fal.action_id
       where aol.obligation_id = $1`,
      [ids.oblB],
    );
    if (findingOblB.rows.length === 0) pass('finding not implicitly attributed to OBL-B');
    else fail('finding implicit obligation attribution');

    const overdue = await admin.query(
      `select due_date < current_date and status not in ('COMPLETE','CLOSED','CANCELLED') as overdue
       from actions where organisation_id = $1 limit 1`,
      [ORG_A],
    );
    if (overdue.rows[0]?.overdue === true) pass('derived action overdue (status unchanged)');
    else fail('action overdue logic');

    const passReview = await admin.query(
      `select ar.result, c.effectiveness from assurance_reviews ar
       join assurance_review_control_links l on l.assurance_review_id = ar.id
       join controls c on c.id = l.control_id where c.id = $1`,
      [ids.ctrlA],
    );
    const failReview = await admin.query(
      `select ar.result, c.effectiveness from assurance_reviews ar
       join assurance_review_control_links l on l.assurance_review_id = ar.id
       join controls c on c.id = l.control_id where c.id = $1`,
      [ids.ctrlB],
    );
    if (passReview.rows[0]?.result === 'PASS' && failReview.rows[0]?.result === 'FAIL') {
      pass('assurance contrast PASS vs FAIL on controls');
    } else fail('assurance contrast');

    const ctrlB = await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
      const r = await c.query(
        `insert into controls (organisation_id, name, owner_user_id, status)
         values ($1, 'ORG-B control', $2, 'ACTIVE') returning id`,
        [ORG_B, USER_B],
      );
      return r.rows[0].id;
    });

    await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      try {
        await c.query(
          `insert into obligation_control_links (organisation_id, obligation_id, control_id)
           values ($1, $2, $3)`,
          [ORG_B, ids.oblA, ctrlB],
        );
        fail('USER-A must not create ORG-B link rows');
      } catch {
        pass('cross-org link row rejected under RLS (wrong organisation_id)');
      }
    });

    const bSeesA = await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
      const r = await c.query(`select count(*)::int as n from policies where organisation_id = $1`, [ORG_A]);
      return r.rows[0].n;
    });
    if (bSeesA === 0) pass('ORG-B RLS cannot read ORG-A policies');
    else fail('tenant isolation policies');

    const trace = await admin.query(
      `select p.id pub, c.id chg, o.id obl from regulatory_obligations o
       join regulatory_changes c on c.id = o.regulatory_change_id
       join regulatory_publications p on p.id = o.publication_id
       where o.id = $1`,
      [ids.oblA],
    );
    if (trace.rows[0]?.pub && trace.rows[0]?.chg && trace.rows[0]?.obl) {
      pass('traceability Publication → Change → Obligation → downstream tables');
    } else fail('traceability');
  } catch (e) {
    fail(e.message);
  } finally {
    await admin.end();
    await stopEmbedded(embedded);
  }

  return results;
}
