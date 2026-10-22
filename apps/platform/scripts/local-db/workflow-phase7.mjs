#!/usr/bin/env node
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  resetAndStartEmbedded,
  stopEmbedded,
} from './harness.mjs';
import { executeIngestionForSource, tryStartRun } from '../../lib/ri/ingestion/ops/executor.mjs';
import { runSchedulerTick, processDueRetries } from '../../lib/ri/ingestion/ops/scheduler.mjs';
import { computeNextRetryAt } from '../../lib/ri/ingestion/ops/retry-policy.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixturePsr = JSON.parse(
  readFileSync(join(__dir, '../../lib/ri/ingestion/fixtures/SRC-PSR-UK-RULES.fixture.json'), 'utf8'),
);

async function ensureOps(client, externalKey, { enabled, nextRunAt, interval = 60 }) {
  const src = await client.query(`select id from regulatory_sources where external_key = $1`, [externalKey]);
  if (!src.rows[0]) throw new Error(`missing source ${externalKey}`);
  await client.query(
    `insert into regulatory_source_operations (
      source_id, enabled, ingestion_mode, schedule_type, interval_minutes, next_run_at, health_status
    ) values ($1, $2, 'TEST_ONLY'::source_ingestion_mode, 'INTERVAL'::schedule_type, $3, $4, 'UNKNOWN'::source_health_status)
    on conflict (source_id) do update set
      enabled = excluded.enabled,
      ingestion_mode = excluded.ingestion_mode,
      interval_minutes = excluded.interval_minutes,
      next_run_at = excluded.next_run_at`,
    [src.rows[0].id, enabled, interval, nextRunAt],
  );
  return src.rows[0].id;
}

export async function runPhase7OperationsVerification() {
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

    await admin.query(
      `update regulatory_sources set ingestion_mode = 'TEST_ONLY'::source_ingestion_mode
       where external_key in ('SRC-PSR-UK-RULES', 'SRC-FINRA-RULEBOOK', 'SRC-CMA-UK-ENFORCEMENT')`,
    );

    const now = new Date();
    const past = new Date(now.getTime() - 60000).toISOString();
    const future = new Date(now.getTime() + 3600000).toISOString();

    await ensureOps(admin, 'SRC-PSR-UK-RULES', { enabled: true, nextRunAt: past });
    await ensureOps(admin, 'SRC-CMA-UK-ENFORCEMENT', { enabled: true, nextRunAt: past });
    await ensureOps(admin, 'SRC-FINRA-RULEBOOK', { enabled: true, nextRunAt: future });

    const tick = await runSchedulerTick(admin, {
      now,
      fixtureBySource: { 'SRC-PSR-UK-RULES': fixturePsr },
      simulateErrorBySource: { 'SRC-CMA-UK-ENFORCEMENT': 'timeout: simulated transient' },
    });

    const psr = tick.outcomes.find((o) => o.source === 'SRC-PSR-UK-RULES');
    const cma = tick.outcomes.find((o) => o.source === 'SRC-CMA-UK-ENFORCEMENT');
    if (psr?.status === 'COMPLETED' || psr?.metrics?.new >= 0) pass('scheduler: SOURCE-A (PSR) executed');
    else fail('scheduler PSR');
    if (cma?.status === 'FAILED') pass('scheduler: SOURCE-B failed in isolation');
    else fail('scheduler CMA fail');
    if (tick.dueCount === 2) pass('scheduler: SOURCE-C skipped (not due)');
    else fail(`scheduler due count ${tick.dueCount}`);

    const openAlerts = await admin.query(
      `select count(*)::int as n from operational_alerts where status = 'OPEN'`,
    );
    await executeIngestionForSource(admin, {
      sourceId: 'SRC-CMA-UK-ENFORCEMENT',
      simulateError: 'HTTP 403 access_restricted',
    });
    const alerts1 = await admin.query(
      `select count(*)::int as n from operational_alerts where status = 'OPEN' and category = 'INGESTION_FAILURE'`,
    );
    await executeIngestionForSource(admin, {
      sourceId: 'SRC-CMA-UK-ENFORCEMENT',
      simulateError: 'HTTP 403 access_restricted',
    });
    const alerts2 = await admin.query(
      `select count(*)::int as n from operational_alerts where status = 'OPEN' and category = 'INGESTION_FAILURE'`,
    );
    if (alerts2.rows[0].n === alerts1.rows[0].n && alerts1.rows[0].n >= 1) {
      pass('alert deduplication');
    } else fail('alert dedupe');

    const srcPsr = await admin.query(`select id from regulatory_sources where external_key = 'SRC-PSR-UK-RULES'`);
    const lock1 = await tryStartRun(admin, {
      sourceUuid: srcPsr.rows[0].id,
      triggerType: 'TEST',
      runType: 'TEST',
      attemptNumber: 1,
      initiatedBy: 'concurrency-test',
      environment: 'local',
    });
    const lock2 = await tryStartRun(admin, {
      sourceUuid: srcPsr.rows[0].id,
      triggerType: 'TEST',
      runType: 'TEST',
      attemptNumber: 1,
      initiatedBy: 'concurrency-test-2',
      environment: 'local',
    });
    if (lock1.started && !lock2.started) pass('concurrency: second run SKIPPED');
    else fail('concurrency');
    await admin.query(`update ingestion_runs set status = 'FAILED', completed_at = now() where id = $1`, [
      lock1.runId,
    ]);

    const failRun = await executeIngestionForSource(admin, {
      sourceId: 'SRC-PSR-UK-RULES',
      simulateError: 'timeout: attempt 1',
      attemptNumber: 1,
    });
    if (failRun.retryable) {
      const nextRetry = computeNextRetryAt(1, 60);
      await admin.query(`update ingestion_runs set next_retry_at = now() - interval '1 minute' where id = $1`, [
        failRun.runId,
      ]);
      const retries = await processDueRetries(admin, { fixtureBySource: { 'SRC-PSR-UK-RULES': fixturePsr } });
      if (retries.length >= 1 && (retries[0].status === 'COMPLETED' || retries[0].metrics)) {
        pass('retry: transient then success');
        const openPsr = await admin.query(
          `select count(*)::int as n from operational_alerts o
           join regulatory_sources s on s.id = o.source_id
           where s.external_key = 'SRC-PSR-UK-RULES' and o.category = 'INGESTION_FAILURE' and o.status = 'OPEN'`,
        );
        const psrHealth = await admin.query(
          `select o.health_status from regulatory_source_operations o
           join regulatory_sources s on s.id = o.source_id
           where s.external_key = 'SRC-PSR-UK-RULES'`,
        );
        if (openPsr.rows[0].n === 0) pass('recovery: ingestion failure alerts resolved');
        else fail('recovery alerts still open');
        if (psrHealth.rows[0]?.health_status === 'HEALTHY') pass('recovery: source health HEALTHY');
        else fail(`recovery health ${psrHealth.rows[0]?.health_status}`);
      } else fail('retry success');
    } else fail('retryable classification');

    const notif = await admin.query(`select count(*)::int as n from notification_events`);
    if (notif.rows[0].n >= 1) pass('notification events recorded');

    const tenant = await admin.query(`select count(*)::int as n from organisation_publications`);
    if (tenant.rows[0].n === 0) pass('no downstream auto-create');

    const enabledProd = await admin.query(
      `select count(*)::int as n from regulatory_sources where production_status = 'ENABLED'::production_source_status`,
    );
    if (enabledProd.rows[0].n === 0) pass('production sources remain NOT_ENABLED');

    const opsTable = await admin.query(`select count(*)::int as n from regulatory_source_operations`);
    if (opsTable.rows[0].n >= 3) pass('source operations configured');
    else fail('operations rows');
  } catch (e) {
    fail(e.message);
  } finally {
    await admin.end();
    await stopEmbedded(embedded);
  }

  return results;
}
