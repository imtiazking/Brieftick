#!/usr/bin/env node
/**
 * Phase 8B — FCA ingestion integration (embedded Postgres).
 * Live FCA fetch when FORGENIQ_LIVE_FCA=1; otherwise fixture with normalised dates.
 */
import pg from 'pg';
import {
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  resetAndStartEmbedded,
  stopEmbedded,
} from './local-db/harness.mjs';
import { runSourceIngestion } from '../lib/ri/ingestion/ingest-engine.mjs';
import { retrieveNormalisedDocuments } from '../lib/ri/ingestion/adapter.mjs';
import { INGESTION_DATA_ORIGIN } from '../lib/ri/ingestion/types.mjs';

const SOURCE = 'SRC-FCA-PUBLICATIONS-RSS';
const live = process.env.FORGENIQ_LIVE_FCA === '1';

let failed = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failed += 1;
  console.error(`FAIL: ${m}`);
};

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54330 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);

  await admin.query(
    `update regulatory_sources set ingestion_mode = 'TEST_ONLY'::source_ingestion_mode
     where external_key = $1`,
    [SOURCE],
  );

  if (live) {
    const docs = await retrieveNormalisedDocuments(SOURCE, { liveAllowed: true, maxItems: 5 });
    if (docs.length > 0 && docs.length <= 5) pass(`live retrieve ${docs.length} document(s)`);
    else fail(`live retrieve count ${docs.length}`);
    for (const d of docs) {
      if (d.regulatorId !== 'REG-FCA') fail('regulator not REG-FCA');
      if (d.sourceId !== SOURCE) fail('source id mismatch');
      if (!d.canonicalUrl?.includes('fca.org.uk')) fail(`canonical url ${d.canonicalUrl}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.publicationDate || '')) {
        fail(`publication_date not ISO: ${d.publicationDate} (${d.title})`);
      }
      if (!d.contentHash) fail('missing contentHash');
      if (d.provenance?.connectorId !== 'CONN-LEGACY-FCA') fail('provenance connector');
    }
    if (docs.length > 0) pass('live metadata shape');

    const r1 = await runSourceIngestion(admin, {
      sourceId: SOURCE,
      liveAllowed: true,
      maxItems: 5,
      runType: 'TEST',
      environment: 'local',
      initiatedBy: 'phase8b-fca-live',
    });
    if (r1.status === 'COMPLETED' && r1.metrics.new >= 1 && r1.metrics.discovered <= 5) {
      pass('live ingestion run completed');
    } else {
      fail(`live ingestion: ${JSON.stringify(r1)}`);
    }

    const r2 = await runSourceIngestion(admin, {
      sourceId: SOURCE,
      liveAllowed: true,
      maxItems: 5,
      runType: 'TEST',
      environment: 'local',
      initiatedBy: 'phase8b-fca-dedupe',
    });
    if (r2.metrics.new === 0) pass('duplicate run created no new publications');
    else fail(`dedupe new rows: ${JSON.stringify(r2.metrics)}`);
    if (r2.metrics.unchanged >= 1 && r2.metrics.updated === 0) {
      pass('second live run unchanged (stable HTML fingerprint)');
    } else if (r2.metrics.updated >= 1 && r2.metrics.new === 0) {
      pass('second live run updated versions only (no duplicate rows)');
    } else {
      fail(`second run metrics: ${JSON.stringify(r2.metrics)}`);
    }

    const pubCount = await admin.query(
      `select count(*)::int as n from regulatory_publications p
       join regulatory_sources s on s.id = p.source_id where s.external_key = $1`,
      [SOURCE],
    );
    if (pubCount.rows[0].n <= 5) pass(`publication count <= 5 (${pubCount.rows[0].n})`);
    else fail(`too many publications ${pubCount.rows[0].n}`);

    const sample = await admin.query(
      `select p.publication_date::text as d, p.data_origin, p.canonical_url
       from regulatory_publications p
       join regulatory_sources s on s.id = p.source_id
       where s.external_key = $1 limit 1`,
      [SOURCE],
    );
    if (sample.rows[0]?.d && /^\d{4}-\d{2}-\d{2}$/.test(sample.rows[0].d)) pass('DB publication_date ISO');
    else fail(`DB date ${sample.rows[0]?.d}`);
    if (sample.rows[0]?.data_origin === INGESTION_DATA_ORIGIN) pass('data_origin regulated-ingestion');
    else fail(`data_origin ${sample.rows[0]?.data_origin}`);
  } else {
    const fixture = {
      publications: [
        {
          regulatorId: 'REG-FCA',
          sourceId: SOURCE,
          title: 'Phase8B FCA fixture doc',
          publicationType: 'publication',
          canonicalUrl: 'https://www.fca.org.uk/publications/phase8b-fixture-doc',
          publicationDate: '2026-10-26',
          contentHash: 'phase8b-fixture-hash-v1',
          provenance: { sourcePublishedAt: 'Monday, October 26, 2026 - 10:58' },
        },
      ],
    };
    const r1 = await runSourceIngestion(admin, {
      sourceId: SOURCE,
      fixture,
      runType: 'TEST',
      initiatedBy: 'phase8b-fca-fixture',
    });
    if (r1.status === 'COMPLETED' && r1.metrics.new === 1) pass('fixture ingestion');
    else fail(`fixture ingestion ${JSON.stringify(r1)}`);

    const r2 = await runSourceIngestion(admin, {
      sourceId: SOURCE,
      fixture,
      runType: 'TEST',
    });
    if (r2.metrics.unchanged === 1) pass('fixture idempotency');
    else fail('fixture idempotency');

    const ver = await admin.query(
      `select count(*)::int as n from regulatory_publication_versions v
       join regulatory_publications p on p.id = v.publication_id
       join regulatory_sources s on s.id = p.source_id where s.external_key = $1`,
      [SOURCE],
    );
    if (ver.rows[0].n >= 1) pass('version row created');
    else fail('versions');
  }

  const orgPub = await admin.query(`select count(*)::int as n from organisation_publications`);
  const obligations = await admin.query(`select count(*)::int as n from regulatory_obligations`);
  const impacts = await admin.query(`select count(*)::int as n from impact_assessments`);
  if (orgPub.rows[0].n === 0) pass('no organisation_publications auto-created');
  else fail(`organisation_publications ${orgPub.rows[0].n}`);
  if (obligations.rows[0].n === 0) pass('no obligations auto-created');
  else fail(`obligations ${obligations.rows[0].n}`);
  if (impacts.rows[0].n === 0) pass('no impact assessments auto-created');
  else fail(`impacts ${impacts.rows[0].n}`);

  const items = await admin.query(
    `select count(*)::int as n from ingestion_items i
     join ingestion_runs r on r.id = i.ingestion_run_id
     join regulatory_sources s on s.id = r.source_id
     where s.external_key = $1`,
    [SOURCE],
  );
  if (items.rows[0].n >= 1) pass('ingestion_items audit rows');
  else fail('ingestion_items');
} finally {
  await admin.end();
  await stopEmbedded(embedded);
}

if (failed) {
  console.error(`\nacceptance-phase-8b-fca-ingestion: FAIL (${failed})\n`);
  process.exit(1);
}
console.log(`\nacceptance-phase-8b-fca-ingestion: PASS (live=${live})\n`);
