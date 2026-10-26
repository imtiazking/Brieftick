#!/usr/bin/env node
/**
 * Manual / test regulatory ingestion CLI (server-side only).
 * Usage: npm run ri:ingest -- --source SRC-PSR-UK-RULES --fixture
 */
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSourceIngestion } from '../lib/ri/ingestion/ingest-engine.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

function parseArgs(argv) {
  const out = {
    source: null,
    fixture: false,
    live: false,
    maxItems: null,
    databaseUrl: process.env.FORGENIQ_LOCAL_PG_URL || null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) out.source = argv[++i];
    else if (argv[i] === '--fixture') out.fixture = true;
    else if (argv[i] === '--live') out.live = true;
    else if (argv[i] === '--max-items' && argv[i + 1]) out.maxItems = Number(argv[++i]);
    else if (argv[i] === '--database-url' && argv[i + 1]) out.databaseUrl = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.source) {
  console.error(
    'Usage: npm run ri:ingest -- --source SRC-... [--fixture] [--live] [--max-items N] [--database-url URL]',
  );
  process.exit(1);
}

if (!args.databaseUrl) {
  console.error('FORGENIQ_LOCAL_PG_URL or --database-url required (local embedded harness sets this).');
  process.exit(1);
}

let fixture;
if (args.fixture) {
  const path = join(platformRoot, 'lib', 'ri', 'ingestion', 'fixtures', `${args.source}.fixture.json`);
  if (!existsSync(path)) {
    console.error(`Fixture not found: ${path}`);
    process.exit(1);
  }
  fixture = JSON.parse(readFileSync(path, 'utf8'));
}

const client = new pg.Client({ connectionString: args.databaseUrl });
await client.connect();
try {
  const result = await runSourceIngestion(client, {
    sourceId: args.source,
    fixture,
    liveAllowed: args.live,
    maxItems: args.maxItems ?? undefined,
    runType: args.fixture ? 'TEST' : 'MANUAL',
    initiatedBy: 'ri-ingest-cli',
    environment: process.env.FORGENIQ_INGEST_ENV || 'local',
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'FAILED') process.exit(1);
} finally {
  await client.end();
}
