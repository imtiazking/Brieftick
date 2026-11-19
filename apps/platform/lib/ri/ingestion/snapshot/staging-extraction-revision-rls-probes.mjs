import { randomUUID } from 'node:crypto';
import { CP26_38_STAGING } from './cp26-38-staging-identity.mjs';
import { assertStagingRegulatoryCountsAtLeastBaseline } from './staging-regulatory-count-invariants.mjs';
import { EXTRACTION_PROFILE_HTML_ARTICLE_V2 } from './extraction-revision-types.mjs';
import { withPgSavepointProbe } from './staging-pg-savepoint-probe.mjs';

/**
 * Simulate Supabase authenticated JWT for direct SQL (rolled-back probes only).
 *
 * @param {import('pg').Client} client
 * @param {string} clerkSub
 */
export async function setStagingAuthenticatedJwtSession(client, clerkSub) {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: clerkSub, role: 'authenticated' }),
  ]);
  await client.query('set local role authenticated');
}

/**
 * Restore session to the connection's privileged role (service/postgres) for trigger probes.
 *
 * @param {import('pg').Client} client
 */
export async function resetStagingPrivilegedDatabaseRole(client) {
  await client.query('RESET ROLE');
  await client.query(`select set_config('request.jwt.claims', '', true)`);
}

/**
 * @param {import('pg').Client} client
 */
export async function readDatabaseRoleContext(client) {
  const r = await client.query(
    `select current_user as current_user, session_user as session_user`,
  );
  return r.rows[0];
}

/**
 * @param {import('pg').Client} client
 */
export async function readRegulatoryCounts(client) {
  const r = await client.query(
    `select
      (select count(*)::int from regulatory_publications) as publications,
      (select count(*)::int from regulatory_publication_versions) as publication_versions,
      (select count(*)::int from regulatory_source_snapshots) as source_snapshots,
      (select count(*)::int from regulatory_source_extraction_revisions) as extraction_revisions`,
  );
  return r.rows[0];
}

/**
 * @param {import('pg').Client} client
 */
export async function verifyCp26StagingIntegrity(client) {
  const counts = await readRegulatoryCounts(client);
  try {
    assertStagingRegulatoryCountsAtLeastBaseline(counts);
  } catch (e) {
    return { pass: false, counts, reason: e.message };
  }
  const snap = await client.query(
    `select p.source_hash, p.source_version, v.version_number
     from regulatory_source_snapshots s
     join regulatory_publications p on p.id = s.publication_id
     join regulatory_publication_versions v on v.id = s.publication_version_id
     where s.id = $1`,
    [CP26_38_STAGING.snapshotId],
  );
  const row = snap.rows[0];
  if (!row) {
    return { pass: false, counts, reason: 'cp26_snapshot_missing' };
  }
  if (
    row.source_hash !== CP26_38_STAGING.sourceFingerprintV1 ||
    String(row.source_version) !== '1' ||
    row.version_number !== 1
  ) {
    return { pass: false, counts, reason: 'cp26_identity_changed' };
  }
  const fca = await client.query(
    `select ingestion_mode from regulatory_sources where external_key = 'SRC-FCA-PUBLICATIONS-RSS'`,
  );
  if (fca.rows[0]?.ingestion_mode !== 'DISABLED') {
    return { pass: false, counts, reason: 'fca_ingestion_not_disabled' };
  }
  return { pass: true, counts };
}

/**
 * @param {object} groupA
 */
export function evaluateApplicationRlsGroup(groupA) {
  return (
    groupA?.operatorSelectVisible === true &&
    groupA?.tenantSelectCount === 0 &&
    groupA?.operatorUpdate?.prohibited === true &&
    groupA?.operatorDelete?.prohibited === true &&
    groupA?.tenantInsert?.denied === true &&
    groupA?.tenantUpdate?.prohibited === true &&
    groupA?.tenantDelete?.prohibited === true
  );
}

/**
 * @param {object} groupB
 */
export function evaluateAppendOnlyTriggerGroup(groupB) {
  return (
    groupB?.privilegedFixtureVisible === true &&
    groupB?.privilegedUpdate?.triggerRejected === true &&
    groupB?.privilegedUpdate?.sqlState === 'P0001' &&
    groupB?.privilegedDelete?.triggerRejected === true &&
    groupB?.privilegedDelete?.sqlState === 'P0001'
  );
}

/**
 * @param {{ rowCount: number | null, threw: boolean, result?: { rowCount?: number } }} probe
 */
export function classifyRlsMutationProbe(probe) {
  const rowCount = probe.result?.rowCount ?? probe.rowCount ?? null;
  if (probe.threw) {
    return { prohibited: false, rowCount, denied: true, unexpectedMutation: false };
  }
  if (rowCount === 0) {
    return { prohibited: true, rowCount, denied: false, unexpectedMutation: false };
  }
  return { prohibited: false, rowCount, denied: false, unexpectedMutation: true };
}

async function insertProbeFixture(client, probeId, publicationVersionId) {
  await client.query(
    `insert into regulatory_source_extraction_revisions (
      id, source_snapshot_id, publication_id, publication_version_id,
      raw_content_sha256, extraction_profile, derived_content_fingerprint,
      normalised_html_sha256, normalised_text_sha256,
      normalised_html_storage_path, normalised_text_storage_path, derived_metadata_storage_path,
      extraction_quality, created_by
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'{}'::jsonb,'rls-sql-fixture'
    )`,
    [
      probeId,
      CP26_38_STAGING.snapshotId,
      CP26_38_STAGING.publicationId,
      publicationVersionId,
      CP26_38_STAGING.rawContentSha256,
      EXTRACTION_PROFILE_HTML_ARTICLE_V2,
      '0'.repeat(64),
      '1'.repeat(64),
      '2'.repeat(64),
      'probe/html',
      'probe/text',
      'probe/meta',
    ],
  );
}

/**
 * Transactional fixture proving append-only / RLS without persisting staging data.
 *
 * @param {import('pg').Client} client
 * @param {{
 *   operatorClerkSub: string,
 *   tenantClerkSub: string,
 *   publicationVersionId: string,
 * }} params
 */
export async function verifyExtractionRevisionGuardsInRollbackTransaction(client, params) {
  const { operatorClerkSub, tenantClerkSub, publicationVersionId } = params;
  const probeId = randomUUID();
  const report = {
    diagnostics: {
      rootCause:
        'Authenticated operator UPDATE/DELETE complete with zero rowCount (no UPDATE/DELETE RLS policies); append-only triggers fire only when a privileged role mutates an existing row.',
    },
    fixtureInserted: false,
    serviceRoleFixtureInsert: false,
    groupA: { applicationRls: {}, pass: false },
    groupB: { appendOnlyTriggers: {}, pass: false },
    transactionRecoveryOk: true,
    rolledBack: false,
    outerRollbackFailed: false,
    integrityAfterProbe: null,
    pass: false,
  };

  const integrityBefore = await verifyCp26StagingIntegrity(client);
  if (!integrityBefore.pass) {
    report.integrityAfterProbe = integrityBefore;
    return report;
  }

  const groupA = report.groupA.applicationRls;
  const groupB = report.groupB.appendOnlyTriggers;

  await client.query('begin');
  try {
    await insertProbeFixture(client, probeId, publicationVersionId);
    report.fixtureInserted = true;
    report.serviceRoleFixtureInsert = true;

    await setStagingAuthenticatedJwtSession(client, operatorClerkSub);
    groupA.roleContextOperator = await readDatabaseRoleContext(client);

    const opSelect = await client.query(
      `select count(*)::int as n from regulatory_source_extraction_revisions where id = $1`,
      [probeId],
    );
    groupA.operatorSelectVisible = opSelect.rows[0]?.n === 1;
    groupA.operatorSelectCount = opSelect.rows[0]?.n ?? null;

    groupA.operatorUpdate = await withPgSavepointProbe(client, 'a_op_update', async () => {
      const res = await client.query(
        `update regulatory_source_extraction_revisions set created_by = 'probe-update' where id = $1`,
        [probeId],
      );
      return { rowCount: res.rowCount ?? 0 };
    });
    if (groupA.operatorUpdate.recoveryFailed) report.transactionRecoveryOk = false;
    Object.assign(groupA.operatorUpdate, classifyRlsMutationProbe(groupA.operatorUpdate));

    groupA.operatorDelete = await withPgSavepointProbe(client, 'a_op_delete', async () => {
      const res = await client.query(`delete from regulatory_source_extraction_revisions where id = $1`, [
        probeId,
      ]);
      return { rowCount: res.rowCount ?? 0 };
    });
    if (groupA.operatorDelete.recoveryFailed) report.transactionRecoveryOk = false;
    Object.assign(groupA.operatorDelete, classifyRlsMutationProbe(groupA.operatorDelete));

    await setStagingAuthenticatedJwtSession(client, tenantClerkSub);
    groupA.roleContextTenant = await readDatabaseRoleContext(client);

    const tenantSelect = await client.query(
      `select count(*)::int as n from regulatory_source_extraction_revisions`,
    );
    groupA.tenantSelectCount = tenantSelect.rows[0]?.n ?? null;

    groupA.tenantInsert = await withPgSavepointProbe(client, 'a_tenant_insert', async () => {
      await client.query(
        `insert into regulatory_source_extraction_revisions (
          id, source_snapshot_id, publication_id, publication_version_id,
          raw_content_sha256, extraction_profile, derived_content_fingerprint,
          normalised_html_sha256, normalised_text_sha256,
          normalised_html_storage_path, normalised_text_storage_path, derived_metadata_storage_path,
          extraction_quality, created_by
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'{}'::jsonb,'tenant-insert-probe'
        )`,
        [
          randomUUID(),
          CP26_38_STAGING.snapshotId,
          CP26_38_STAGING.publicationId,
          publicationVersionId,
          CP26_38_STAGING.rawContentSha256,
          EXTRACTION_PROFILE_HTML_ARTICLE_V2,
          '0'.repeat(64),
          '1'.repeat(64),
          '2'.repeat(64),
          'probe/t/html',
          'probe/t/text',
          'probe/t/meta',
        ],
      );
      return { rowCount: 1 };
    });
    if (groupA.tenantInsert.recoveryFailed) report.transactionRecoveryOk = false;
    groupA.tenantInsert.denied =
      groupA.tenantInsert.threw === true &&
      (groupA.tenantInsert.classification?.accepted === true ||
        groupA.tenantInsert.classification?.origin === 'row_level_security' ||
        groupA.tenantInsert.sqlState === '42501');
    groupA.tenantInsert.unexpectedMutation = !groupA.tenantInsert.threw;

    groupA.tenantUpdate = await withPgSavepointProbe(client, 'a_tenant_update', async () => {
      const res = await client.query(
        `update regulatory_source_extraction_revisions set created_by = 'tenant-patch' where id = $1`,
        [probeId],
      );
      return { rowCount: res.rowCount ?? 0 };
    });
    if (groupA.tenantUpdate.recoveryFailed) report.transactionRecoveryOk = false;
    Object.assign(groupA.tenantUpdate, classifyRlsMutationProbe(groupA.tenantUpdate));

    groupA.tenantDelete = await withPgSavepointProbe(client, 'a_tenant_delete', async () => {
      const res = await client.query(`delete from regulatory_source_extraction_revisions where id = $1`, [
        probeId,
      ]);
      return { rowCount: res.rowCount ?? 0 };
    });
    if (groupA.tenantDelete.recoveryFailed) report.transactionRecoveryOk = false;
    Object.assign(groupA.tenantDelete, classifyRlsMutationProbe(groupA.tenantDelete));

    report.groupA.pass = evaluateApplicationRlsGroup(groupA);

    await resetStagingPrivilegedDatabaseRole(client);
    groupB.roleContextPrivileged = await readDatabaseRoleContext(client);

    const privVis = await client.query(
      `select count(*)::int as n from regulatory_source_extraction_revisions where id = $1`,
      [probeId],
    );
    groupB.privilegedFixtureVisible = privVis.rows[0]?.n === 1;
    groupB.privilegedFixtureCount = privVis.rows[0]?.n ?? null;

    groupB.privilegedUpdate = await withPgSavepointProbe(client, 'b_priv_update', async () => {
      const res = await client.query(
        `update regulatory_source_extraction_revisions set created_by = 'priv-update' where id = $1`,
        [probeId],
      );
      return { rowCount: res.rowCount ?? 0, unexpectedMutation: (res.rowCount ?? 0) > 0 };
    });
    if (groupB.privilegedUpdate.recoveryFailed) report.transactionRecoveryOk = false;
    groupB.privilegedUpdate.triggerRejected =
      groupB.privilegedUpdate.threw === true &&
      groupB.privilegedUpdate.sqlState === 'P0001' &&
      groupB.privilegedUpdate.classification?.origin === 'append_only_trigger';
    groupB.privilegedUpdate.unexpectedMutation =
      !groupB.privilegedUpdate.threw && (groupB.privilegedUpdate.result?.rowCount ?? 0) > 0;

    groupB.privilegedDelete = await withPgSavepointProbe(client, 'b_priv_delete', async () => {
      const res = await client.query(`delete from regulatory_source_extraction_revisions where id = $1`, [probeId]);
      return { rowCount: res.rowCount ?? 0, unexpectedMutation: (res.rowCount ?? 0) > 0 };
    });
    if (groupB.privilegedDelete.recoveryFailed) report.transactionRecoveryOk = false;
    groupB.privilegedDelete.triggerRejected =
      groupB.privilegedDelete.threw === true &&
      groupB.privilegedDelete.sqlState === 'P0001' &&
      groupB.privilegedDelete.classification?.origin === 'append_only_trigger';
    groupB.privilegedDelete.unexpectedMutation =
      !groupB.privilegedDelete.threw && (groupB.privilegedDelete.result?.rowCount ?? 0) > 0;

    report.groupB.pass = evaluateAppendOnlyTriggerGroup(groupB);
  } finally {
    try {
      await client.query('rollback');
      report.rolledBack = true;
    } catch {
      report.rolledBack = false;
      report.outerRollbackFailed = true;
      report.transactionRecoveryOk = false;
    }
  }

  report.integrityAfterProbe = await verifyCp26StagingIntegrity(client);

  const noUnexpectedMutations =
    groupA.operatorUpdate?.unexpectedMutation !== true &&
    groupA.operatorDelete?.unexpectedMutation !== true &&
    groupA.tenantInsert?.unexpectedMutation !== true &&
    groupA.tenantUpdate?.unexpectedMutation !== true &&
    groupA.tenantDelete?.unexpectedMutation !== true &&
    groupB.privilegedUpdate?.unexpectedMutation !== true &&
    groupB.privilegedDelete?.unexpectedMutation !== true;

  report.pass =
    report.transactionRecoveryOk === true &&
    report.fixtureInserted === true &&
    report.serviceRoleFixtureInsert === true &&
    report.groupA.pass === true &&
    report.groupB.pass === true &&
    noUnexpectedMutations === true &&
    report.rolledBack === true &&
    !report.outerRollbackFailed &&
    report.integrityAfterProbe?.pass === true;

  return report;
}
