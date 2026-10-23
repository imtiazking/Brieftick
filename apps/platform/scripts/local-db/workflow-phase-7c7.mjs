#!/usr/bin/env node
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
import { buildAskRiStateFromClient } from '../../lib/ri/ask-ri/production-state.mjs';
import { runAskRiDeterministic } from '../../lib/ri/ask-ri/run-ask-ri.mjs';

export async function runPhase7c7WorkflowVerification() {
  const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54330 });
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
      `insert into organisations (id, name, slug) values ($1,'A','a'),($2,'B','b') on conflict do nothing`,
      [ORG_A, ORG_B],
    );
    for (const [org, user] of [[ORG_A, USER_A], [ORG_B, USER_B]]) {
      await admin.query(
        `insert into organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1,$2,'OWNER','active') on conflict do nothing`,
        [org, user],
      );
    }

    const chgA = await admin.query(
      `insert into regulatory_changes (organisation_id, publication_id, external_key, title, change_type, status)
       values ($1,$2,'CHG-A1','Org A change','POLICY','OPEN') returning id`,
      [ORG_A, publicationId],
    );
    await admin.query(
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, external_key, obligation_statement, status)
       values ($1,$2,$3,'OBL-A1','Org A obligation','OPEN')`,
      [ORG_A, chgA.rows[0].id, publicationId],
    );
    const chgB = await admin.query(
      `insert into regulatory_changes (organisation_id, publication_id, external_key, title, change_type, status)
       values ($1,$2,'CHG-B1','Org B change','POLICY','OPEN') returning id`,
      [ORG_B, publicationId],
    );
    await admin.query(
      `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, external_key, obligation_statement, status)
       values ($1,$2,$3,'OBL-B1','Org B obligation','OPEN')`,
      [ORG_B, chgB.rows[0].id, publicationId],
    );

    const stateA = await buildAskRiStateFromClient(admin, ORG_A);
    const ansA = runAskRiDeterministic(stateA, 'How many open obligations are there?');
    if (ansA.records.some((r) => r.id === 'OBL-A1') && !ansA.records.some((r) => r.id === 'OBL-B1')) {
      pass('A/B: ORG-A obligations scoped');
    } else fail('A/B: ORG-A scope');

    const stateB = await buildAskRiStateFromClient(admin, ORG_B);
    const ansB = runAskRiDeterministic(stateB, 'How many open obligations are there?');
    if (ansB.records.some((r) => r.id === 'OBL-B1') && !ansB.records.some((r) => r.id === 'OBL-A1')) {
      pass('B: ORG-B obligations scoped');
    } else fail('B: ORG-B scope');

    const blocked = runAskRiDeterministic(stateA, 'What does FINMA require for capital?');
    const blockedSafe =
      blocked.status !== 'ANSWERED' &&
      (blocked.records?.length ?? 0) === 0 &&
      (blocked.status === 'UNRESOLVED' ||
        blocked.status === 'INSUFFICIENT_EVIDENCE' ||
        blocked.execution.resultState === 'UNRESOLVED_QUERY_SEMANTICS' ||
        blocked.execution.resultState === 'INSUFFICIENT_EVIDENCE');
    if (blockedSafe) pass('G: unsupported regulator blocked safely');
    else fail('G: FINMA false answer');

    const zero = runAskRiDeterministic(
      stateA,
      'Which obligations are linked to cryptoassets-only-special-sector-xyz regulatory changes?',
    );
    const zeroSafe =
      zero.status !== 'ANSWERED' &&
      (zero.records?.length ?? 0) === 0 &&
      ['ZERO_RESULTS', 'UNRESOLVED', 'INSUFFICIENT_EVIDENCE'].includes(zero.status);
    if (zeroSafe) pass('F: zero/unresolved not false answer');
    else fail('F: zero handling');

    const cross = await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
      const r = await c.query(`select id from regulatory_obligations where external_key = 'OBL-A1'`);
      return r.rows.length;
    });
    if (cross === 0) pass('J: ORG-B cannot read ORG-A obligation via RLS');
    else fail('J: cross-tenant read');
  } finally {
    await admin.end();
    await stopEmbedded(embedded);
  }
  return results;
}
