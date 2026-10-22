#!/usr/bin/env node
import pg from 'pg';
import {
  ORG_A,
  USER_A,
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSessionCommit,
} from './harness.mjs';
import { runSourceIngestion } from '../../lib/ri/ingestion/ingest-engine.mjs';
import { INGESTION_DATA_ORIGIN } from '../../lib/ri/ingestion/types.mjs';

const TEST_SOURCES = [
  'SRC-PSR-UK-RULES',
  'SRC-CMA-UK-ENFORCEMENT',
  'SRC-OFSI-SANCTIONS-GUIDANCE',
  'SRC-FINRA-RULEBOOK',
  'SRC-CMA-SA-RULES',
];

export async function runPhase6IngestionVerification() {
  const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54329 });
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const results = { pass: [], fail: [] };
  const pass = (m) => results.pass.push(m);
  const fail = (m) => results.fail.push(m);

  try {
    await applyAllMigrations(admin);
    await ensureAppRole(admin);
    await applyReferenceSeed(admin);

    await admin.query(
      `update regulatory_sources set ingestion_mode = 'TEST_ONLY'::source_ingestion_mode
       where external_key = any($1::text[])`,
      [TEST_SOURCES],
    );

    const fixture = {
      publications: [
        {
          regulatorId: 'REG-PSR-UK',
          sourceId: 'SRC-PSR-UK-RULES',
          externalDocumentId: 'phase6-doc-1',
          title: 'Phase6 PSR doc',
          publicationType: 'policy_statement',
          canonicalUrl: 'https://www.psr.org.uk/publications/phase6-doc-1',
          publicationDate: '2026-02-01',
          contentHash: 'hash-phase6-v1',
          dataOrigin: INGESTION_DATA_ORIGIN,
        },
      ],
    };

    const r1 = await runSourceIngestion(admin, {
      sourceId: 'SRC-PSR-UK-RULES',
      fixture,
      runType: 'TEST',
      initiatedBy: 'phase6-harness',
    });
    if (r1.status === 'COMPLETED' && r1.metrics.new >= 1) pass('A. first ingestion creates publication');
    else fail(`A first ingestion: ${JSON.stringify(r1)}`);

    const pubCount1 = await admin.query(
      `select count(*)::int as n from regulatory_publications p
       join regulatory_sources s on s.id = p.source_id where s.external_key = 'SRC-PSR-UK-RULES'`,
    );
    if (pubCount1.rows[0].n === 1) pass('A. single global publication row');
    else fail('A publication count');

    const r2 = await runSourceIngestion(admin, {
      sourceId: 'SRC-PSR-UK-RULES',
      fixture,
      runType: 'TEST',
      initiatedBy: 'phase6-harness',
    });
    if (r2.metrics.unchanged >= 1 && r2.metrics.new === 0) pass('B. repeat ingestion unchanged');
    else fail('B idempotency');

    const pubCount2 = await admin.query(
      `select count(*)::int as n from regulatory_publications p
       join regulatory_sources s on s.id = p.source_id where s.external_key = 'SRC-PSR-UK-RULES'`,
    );
    if (pubCount2.rows[0].n === 1) pass('B. still one publication');
    else fail('B duplicate publications');

    const v2fixture = {
      publications: [
        {
          regulatorId: 'REG-PSR-UK',
          sourceId: 'SRC-PSR-UK-RULES',
          externalDocumentId: 'phase6-doc-1',
          title: 'Phase6 PSR doc v2',
          publicationType: 'policy_statement',
          canonicalUrl: 'https://www.psr.org.uk/publications/phase6-doc-1',
          publicationDate: '2026-02-01',
          contentHash: 'hash-phase6-v2',
          dataOrigin: INGESTION_DATA_ORIGIN,
        },
      ],
    };
    const r3 = await runSourceIngestion(admin, {
      sourceId: 'SRC-PSR-UK-RULES',
      fixture: v2fixture,
      runType: 'TEST',
    });
    if (r3.metrics.updated >= 1) pass('C. new version detected');
    else fail('C version');

    const versions = await admin.query(
      `select count(*)::int as n from regulatory_publication_versions v
       join regulatory_publications p on p.id = v.publication_id
       join regulatory_sources s on s.id = p.source_id
       where s.external_key = 'SRC-PSR-UK-RULES'`,
    );
    if (versions.rows[0].n >= 2) pass('C. historical versions retained');
    else fail('C version history');

    const bad = await runSourceIngestion(admin, {
      sourceId: 'SRC-NOT-REAL',
      fixture: { publications: [] },
      runType: 'TEST',
    });
    if (bad.status === 'FAILED') pass('D. invalid source fails');
    else fail('D invalid source');

    const ofacFail = await runSourceIngestion(admin, {
      sourceId: 'SRC-OFAC-SDN-LISTS',
      fixture: {
        publications: [
          {
            regulatorId: 'REG-OFAC',
            sourceId: 'SRC-OFAC-SDN-LISTS',
            externalDocumentId: 'sdn-1',
            title: 'SDN',
            canonicalUrl: 'https://example.com/sdn',
            contentHash: 'x',
            publicationType: 'sanctions_data',
            contentClasses: ['SANCTIONS_DATA'],
          },
        ],
      },
      runType: 'TEST',
    });
    if (ofacFail.status === 'FAILED' || ofacFail.eligibility?.eligible === false) {
      pass('E. OFAC SANCTIONS_DATA ineligible for RI');
    } else fail('E sanctions data');

    const pubBefore = await admin.query(`select count(*)::int as n from organisation_publications`);
    const changesBefore = await admin.query(`select count(*)::int as n from regulatory_changes`);
    if (pubBefore.rows[0].n === 0 && changesBefore.rows[0].n === 0) {
      pass('F/G. ingestion did not auto-create tenant workflow');
    } else fail('downstream auto-create');

    await admin.query(
      `insert into organisations (id, name, slug) values ($1, 'ORG-A', 'org-a') on conflict do nothing`,
      [ORG_A],
    );
    await admin.query(
      `insert into organisation_memberships (organisation_id, clerk_user_id, role, status)
       values ($1, $2, 'OWNER'::platform_role, 'active') on conflict do nothing`,
      [ORG_A, USER_A],
    );

    const globalPub = await admin.query(
      `select p.id from regulatory_publications p
       join regulatory_sources s on s.id = p.source_id where s.external_key = 'SRC-PSR-UK-RULES' limit 1`,
    );
    const visible = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      const r = await c.query(`select count(*)::int as n from regulatory_publications where id = $1`, [
        globalPub.rows[0].id,
      ]);
      return r.rows[0].n;
    });
    if (visible === 1) pass('F. global publication visible to tenant session');
    else fail('F tenant visibility');

    const prodEnabled = await admin.query(
      `select count(*)::int as n from regulatory_sources where production_status = 'ENABLED'::production_source_status`,
    );
    if (prodEnabled.rows[0].n === 0) pass('production sources remain NOT_ENABLED');
    else fail('production enabled');

    const runs = await admin.query(`select count(*)::int as n from ingestion_runs`);
    if (runs.rows[0].n >= 2) pass('ingestion runs recorded');
    else fail('ingestion runs');

    const pubId = globalPub.rows[0].id;
    await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      await c.query(
        `insert into organisation_publications (organisation_id, publication_id, triage_status, relevance_status)
         values ($1, $2, 'NEW', 'RELEVANT')`,
        [ORG_A, pubId],
      );
      const chg = await c.query(
        `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status)
         values ($1, $2, 'Manual change from ingested pub', 'TEST', 'OPEN') returning id`,
        [ORG_A, pubId],
      );
      await c.query(
        `insert into regulatory_obligations (organisation_id, regulatory_change_id, publication_id, obligation_statement, status)
         values ($1, $2, $3, 'Human obligation after ingestion', 'OPEN')`,
        [ORG_A, chg.rows[0].id, pubId],
      );
    });
    pass('downstream workflow regression: manual Publication → Change → Obligation');
  } catch (e) {
    fail(e.message);
  } finally {
    await admin.end();
    await stopEmbedded(embedded);
  }

  return results;
}
