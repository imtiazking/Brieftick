#!/usr/bin/env node
/**
 * Phase 8C.1b — source snapshot foundation (embedded Postgres + memory storage).
 */
import pg from 'pg';
import { createHash } from 'node:crypto';
import {
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSession,
} from './local-db/harness.mjs';
import { runSourceIngestion, ingestDocumentsForTest } from '../lib/ri/ingestion/ingest-engine.mjs';
import { buildEvidenceCapture } from '../../../integrations/regulatory-sources/core/evidence-capture.mjs';
import { normaliseHtmlForFingerprint } from '../../../integrations/regulatory-sources/core/fingerprint.mjs';
import {
  createMemorySnapshotStorage,
} from '../lib/ri/ingestion/snapshot/memory-storage.mjs';
import { setSnapshotStorage, resetSnapshotStorage } from '../lib/ri/ingestion/snapshot/runtime.mjs';
import { detectOrphanedSnapshotObjects } from '../lib/ri/ingestion/snapshot/orphan-detect.mjs';
import { uploadSnapshotEvidence } from '../lib/ri/ingestion/snapshot/upload.mjs';
import { buildContentAddressedKey } from '../lib/ri/ingestion/snapshot/paths.mjs';
import { INGESTION_DATA_ORIGIN } from '../lib/ri/ingestion/types.mjs';

const FCA_HTML = `<!doctype html><html><body><article><p>FCA snapshot pilot paragraph one.</p><p>Second paragraph for diff.</p></article></body></html>`;

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

async function buildFcaEvidence(html = FCA_HTML) {
  const body = Buffer.from(html, 'utf8');
  return buildEvidenceCapture({
    body,
    contentType: 'text/html; charset=UTF-8',
    finalUrl: 'https://www.fca.org.uk/publications/multi-firm-reviews/test-snapshot-doc',
    connectorId: 'CONN-LEGACY-FCA',
  });
}

async function main() {
  const storage = createMemorySnapshotStorage();
  setSnapshotStorage(storage);
  const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54331 });
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();

  try {
    await applyAllMigrations(client);
    await ensureAppRole(client);
    await applyReferenceSeed(client);
    await client.query(
      `update regulatory_sources set ingestion_mode = 'TEST_ONLY'::source_ingestion_mode
       where external_key in ('SRC-FCA-PUBLICATIONS-RSS', 'SRC-PSR-UK-RULES')`,
    );

    const evidence1 = await buildFcaEvidence();
    const hash1 = evidence1.fingerprint.hash;

    const fixture1 = {
      publications: [
        {
          regulatorId: 'REG-FCA',
          sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
          externalDocumentId: 'phase8c1-snap-1',
          title: 'FCA snapshot test doc',
          publicationType: 'publication',
          canonicalUrl: 'https://www.fca.org.uk/publications/multi-firm-reviews/test-snapshot-doc',
          publicationDate: '2026-10-26',
          contentHash: hash1,
          retrievedAt: '2026-10-26T12:00:00.000Z',
          dataOrigin: INGESTION_DATA_ORIGIN,
          evidenceCapture: evidence1,
        },
      ],
    };

    const r1 = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: fixture1,
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    if (r1.metrics.new === 1) pass('new publication + snapshot');
    else failMsg(`new ingest: ${JSON.stringify(r1.metrics)}`);

    const snap1 = await client.query(
      `select count(*)::int as n from regulatory_source_snapshots`,
    );
    if (snap1.rows[0].n === 1) pass('one snapshot row');
    else failMsg('snapshot count after new');

    const norm = normaliseHtmlForFingerprint(FCA_HTML);
    const normHash = createHash('sha256').update(norm, 'utf8').digest('hex');
    if (normHash === hash1) pass('fingerprint matches normalised html');
    else failMsg('fingerprint consistency');

    const r2 = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: fixture1,
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    if (r2.metrics.unchanged === 1 && r2.metrics.new === 0) pass('unchanged — no extra snapshot');
    else failMsg('unchanged idempotency');

    const snap2 = await client.query(`select count(*)::int as n from regulatory_source_snapshots`);
    if (snap2.rows[0].n === 1) pass('still one snapshot after unchanged');
    else failMsg('snapshot grew on unchanged');

    let unchangedPuts = 0;
    const boundPut = storage.putObject.bind(storage);
    storage.putObject = async (opts) => {
      unchangedPuts += 1;
      return boundPut(opts);
    };
    const r2b = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: fixture1,
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    storage.putObject = boundPut;
    if (r2b.metrics.unchanged === 1 && unchangedPuts === 0) {
      pass('UNCHANGED ingest performs no new storage writes');
    } else failMsg(`unchanged storage puts=${unchangedPuts} metrics=${JSON.stringify(r2b.metrics)}`);

    const html2 = FCA_HTML.replace('paragraph one', 'paragraph ONE revised');
    const evidence2 = await buildFcaEvidence(html2);
    const fixture2 = {
      publications: [
        {
          ...fixture1.publications[0],
          title: 'FCA snapshot test doc v2',
          contentHash: evidence2.fingerprint.hash,
          evidenceCapture: evidence2,
        },
      ],
    };
    const r3 = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: fixture2,
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    if (r3.metrics.updated === 1) pass('updated version + second snapshot');
    else failMsg(`update ingest: ${JSON.stringify(r3.metrics)}`);

    const snap3 = await client.query(`select count(*)::int as n from regulatory_source_snapshots`);
    if (snap3.rows[0].n === 2) pass('two snapshot rows after update');
    else failMsg('snapshot count after update');

    const ch = await client.query(`select count(*)::int as n from regulatory_changes`);
    if (ch.rows[0].n === 0) pass('no auto regulatory_changes');
    else failMsg('regulatory_changes auto-created');

    const orphans = await detectOrphanedSnapshotObjects(client, storage);
    if (orphans.orphanCount === 0) pass('no orphan objects after happy path');
    else failMsg(`orphans: ${orphans.orphanCount}`);

    const rawKey = (await client.query(`select raw_storage_path from regulatory_source_snapshots limit 1`))
      .rows[0].raw_storage_path;
    const obj = await storage.getObject({ key: rawKey });
    if (obj && obj.sha256) pass('read-back integrity');
    else failMsg('read-back');

    // PSR without evidence — no snapshot
    const psr = await runSourceIngestion(client, {
      sourceId: 'SRC-PSR-UK-RULES',
      fixture: {
        publications: [
          {
            regulatorId: 'REG-PSR-UK',
            sourceId: 'SRC-PSR-UK-RULES',
            externalDocumentId: 'phase8c1-psr',
            title: 'PSR no snapshot',
            publicationType: 'policy_statement',
            canonicalUrl: 'https://www.psr.org.uk/publications/phase8c1-psr',
            contentHash: 'sha256-fixture-psr-v1',
            publicationDate: '2026-01-15',
            retrievedAt: '2026-10-26T12:00:00.000Z',
            dataOrigin: INGESTION_DATA_ORIGIN,
          },
        ],
      },
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    if (psr.metrics.new === 1 && psr.status === 'COMPLETED') pass('PSR ingest without snapshot scope');
    else failMsg(`PSR ingest: ${JSON.stringify(psr)}`);

    const snap4 = await client.query(`select count(*)::int as n from regulatory_source_snapshots`);
    if (snap4.rows[0].n === 2) pass('FCA-only snapshots (PSR did not add)');
    else failMsg('PSR created snapshot');

    // Upload failure simulation
    const failingStorage = createMemorySnapshotStorage();
    const origPut = failingStorage.putObject;
    let putCalls = 0;
    failingStorage.putObject = async (opts) => {
      putCalls += 1;
      if (putCalls === 3) throw new Error('simulated_upload_failure');
      return origPut.call(failingStorage, opts);
    };
    setSnapshotStorage(failingStorage);
    const evidence3 = await buildFcaEvidence(FCA_HTML.replace('Second', 'Third'));
    const failFixture = {
      publications: [
        {
          regulatorId: 'REG-FCA',
          sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
          externalDocumentId: 'phase8c1-fail-upload',
          title: 'FCA upload fail',
          publicationType: 'publication',
          canonicalUrl: 'https://www.fca.org.uk/publications/multi-firm-reviews/upload-fail',
          contentHash: evidence3.fingerprint.hash,
          dataOrigin: INGESTION_DATA_ORIGIN,
          evidenceCapture: evidence3,
        },
      ],
    };
    const rf = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: failFixture,
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    if (rf.metrics.failed >= 1) pass('upload failure fails ingest item');
    else failMsg('upload failure not detected');

    setSnapshotStorage(storage);

    const verMatch = await client.query(
      `select s.source_fingerprint, v.source_hash
       from regulatory_source_snapshots s
       join regulatory_publication_versions v on v.id = s.publication_version_id
       limit 1`,
    );
    if (verMatch.rows[0]?.source_fingerprint === verMatch.rows[0]?.source_hash) {
      pass('snapshot fingerprint matches version source_hash');
    } else failMsg('fingerprint vs version hash');

    const policies = await client.query(
      `select polname from pg_policy p
       join pg_class c on c.oid = p.polrelid
       where c.relname = 'regulatory_source_snapshots'`,
    );
    const polNames = policies.rows.map((r) => r.polname);
    if (polNames.some((n) => n.includes('select')) && !polNames.some((n) => n.includes('update'))) {
      pass('snapshot immutability (no update RLS policy)');
    } else failMsg(`snapshot policies: ${polNames.join(',')}`);

    const tenantRows = await withRlsSession(adminUrl, 'tenant-user-no-operator', async (rls) => {
      const r = await rls.query(`select count(*)::int as n from regulatory_source_snapshots`);
      return r.rows[0].n;
    });
    if (tenantRows === 0) pass('tenant access denial on snapshots (RLS hides rows)');
    else failMsg(`non-operator saw ${tenantRows} snapshot row(s)`);

    const corruptKey = rawKey;
    const dump = storage._dump();
    const entry = dump.get(corruptKey);
    const savedBody = entry ? Buffer.from(entry.body) : null;
    if (entry && savedBody) {
      entry.body = Buffer.from('tampered', 'utf8');
      try {
        await storage.getObject({ key: corruptKey });
        failMsg('corrupt object did not fail integrity');
      } catch {
        pass('corrupted storage object fails read-back');
      }
      entry.body = savedBody;
    }

    const missing = await storage.getObject({ key: 'by-hash/00/missing.bin' });
    if (missing === null) pass('missing object returns null');
    else failMsg('missing object');

    const evidenceRetry = await buildFcaEvidence(
      `${FCA_HTML}<!-- phase8c1-retry-unique-token -->`,
    );
    const retryFixture = {
      publications: [
        {
          regulatorId: 'REG-FCA',
          sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
          externalDocumentId: 'phase8c1-retry',
          title: 'FCA retry after db fail',
          publicationType: 'publication',
          canonicalUrl: 'https://www.fca.org.uk/publications/multi-firm-reviews/retry-doc',
          publicationDate: '2026-10-26',
          contentHash: evidenceRetry.fingerprint.hash,
          retrievedAt: '2026-10-26T13:00:00.000Z',
          dataOrigin: INGESTION_DATA_ORIGIN,
          evidenceCapture: evidenceRetry,
        },
      ],
    };
    const origInsert = client.query.bind(client);
    let blockInsert = true;
    client.query = async (text, values) => {
      if (
        blockInsert &&
        typeof text === 'string' &&
        text.includes('insert into regulatory_source_snapshots')
      ) {
        blockInsert = false;
        throw new Error('simulated_db_failure');
      }
      return origInsert(text, values);
    };
    const rDbFail = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: retryFixture,
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    client.query = origInsert;
    if (rDbFail.metrics.failed >= 1) pass('database failure after upload fails item');
    else failMsg('db failure simulation');

    const pubRetry = await client.query(
      `select id from regulatory_publications where external_document_id = 'phase8c1-retry'`,
    );
    if (pubRetry.rows.length === 0) pass('no publication row after rolled-back db failure');
    else failMsg('publication committed without snapshot');

    const orphanAfterDb = await detectOrphanedSnapshotObjects(client, storage);
    if (orphanAfterDb.orphanCount >= 1) pass('orphan detection after db failure');
    else failMsg('expected orphan keys after db failure');

    const rRetry = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: retryFixture,
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    if (rRetry.metrics.new === 1) pass('retry after partial failure succeeds');
    else failMsg(`retry ingest: ${JSON.stringify(rRetry)}`);

    const prov = await client.query(
      `select provenance::text as p from regulatory_publications where external_document_id = 'phase8c1-snap-1' limit 1`,
    );
    if (!prov.rows[0]?.p?.includes('normalisedArticleHtml')) pass('no document body in publication provenance');
    else failMsg('provenance contains article body');

    const rNewNoEc = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: {
        publications: [
          {
            regulatorId: 'REG-FCA',
            sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
            externalDocumentId: 'phase8c1-no-evidence-new',
            title: 'FCA missing evidence new',
            publicationType: 'publication',
            canonicalUrl: 'https://www.fca.org.uk/publications/multi-firm-reviews/no-evidence-new',
            contentHash: hash1,
            retrievedAt: '2026-10-26T12:00:00.000Z',
            dataOrigin: INGESTION_DATA_ORIGIN,
          },
        ],
      },
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    if (rNewNoEc.metrics.failed === 1 && rNewNoEc.metrics.new === 0) {
      pass('NEW FCA publication without evidenceCapture fails');
    } else failMsg(`NEW no evidence: ${JSON.stringify(rNewNoEc.metrics)}`);

    const altHash = createHash('sha256').update('phase8c1-alt-content', 'utf8').digest('hex');
    const beforeUp = await client.query(
      `select source_hash, title from regulatory_publications where external_document_id = 'phase8c1-snap-1'`,
    );
    const rUpNoEc = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: {
        publications: [
          {
            ...fixture1.publications[0],
            title: 'Should not apply',
            contentHash: altHash,
          },
        ],
      },
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    const afterUp = await client.query(
      `select source_hash, title from regulatory_publications where external_document_id = 'phase8c1-snap-1'`,
    );
    if (
      rUpNoEc.metrics.failed === 1 &&
      rUpNoEc.metrics.updated === 0 &&
      afterUp.rows[0].source_hash === beforeUp.rows[0].source_hash &&
      afterUp.rows[0].title === beforeUp.rows[0].title
    ) {
      pass('UPDATED FCA without evidenceCapture fails and leaves publication unchanged');
    } else failMsg('UPDATED no evidence enforcement');

    const evidenceMismatch = await buildFcaEvidence(FCA_HTML);
    const rFp = await runSourceIngestion(client, {
      sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
      fixture: {
        publications: [
          {
            regulatorId: 'REG-FCA',
            sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
            externalDocumentId: 'phase8c1-fp-mismatch',
            title: 'Fingerprint mismatch',
            publicationType: 'publication',
            canonicalUrl: 'https://www.fca.org.uk/publications/multi-firm-reviews/fp-mismatch',
            contentHash: altHash,
            retrievedAt: '2026-10-26T12:00:00.000Z',
            dataOrigin: INGESTION_DATA_ORIGIN,
            evidenceCapture: evidenceMismatch,
          },
        ],
      },
      runType: 'TEST',
      initiatedBy: 'phase8c1',
    });
    if (rFp.metrics.failed === 1) pass('invalid source fingerprint fails closed');
    else failMsg('fingerprint mismatch not rejected');

    const conflictStorage = createMemorySnapshotStorage();
    const goodEvidence = await buildFcaEvidence('<!-- conflict-test -->' + FCA_HTML);
    const conflictKey = buildContentAddressedKey(goodEvidence.rawSha256, 'raw.html');
    await conflictStorage.putObject({
      key: conflictKey,
      body: Buffer.from('wrong-bytes'),
      contentType: 'text/html',
      sha256: createHash('sha256').update('wrong-bytes').digest('hex'),
    });
    try {
      await uploadSnapshotEvidence(conflictStorage, {
        evidenceCapture: goodEvidence,
        contentHash: goodEvidence.fingerprint.hash,
        connectorId: 'test',
        ingestionRunId: '00000000-0000-0000-0000-000000000099',
      });
      failMsg('hash conflict upload should throw');
    } catch {
      pass('existing-object hash mismatch rejected');
    }
  } finally {
    await client.end();
    await stopEmbedded(embedded);
    resetSnapshotStorage();
  }

  if (fail) {
    console.error(`\nacceptance-phase-8c1-source-snapshots: FAIL (${fail})\n`);
    process.exit(1);
  }
  console.log('\nacceptance-phase-8c1-source-snapshots: PASS\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
