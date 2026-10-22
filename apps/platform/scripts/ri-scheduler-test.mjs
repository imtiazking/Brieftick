#!/usr/bin/env node
/**
 * One scheduler tick (TEST_ONLY due sources). Requires FORGENIQ_LOCAL_PG_URL.
 */
import pg from 'pg';
import { runSchedulerTick, processDueRetries } from '../lib/ri/ingestion/ops/scheduler.mjs';

const databaseUrl = process.env.FORGENIQ_LOCAL_PG_URL;
if (!databaseUrl) {
  console.error('FORGENIQ_LOCAL_PG_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const tick = await runSchedulerTick(client, {});
  const retries = await processDueRetries(client, {});
  console.log(JSON.stringify({ tick, retries }, null, 2));
} finally {
  await client.end();
}
