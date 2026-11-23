#!/usr/bin/env node
/** Regression: embedded PG ownership lives outside PGDATA (_registry). */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanupOrphanEmbeddedPgDirs,
  localPgVerifyBase,
  resetAndStartEmbedded,
  resolveEmbeddedDataDirOwner,
  stopEmbedded,
} from './local-db/harness.mjs';

let fail = 0;
const check = (label, ok) => {
  if (!ok) fail += 1;
  console.log(ok ? `PASS: ${label}` : `FAIL: ${label}`);
};

const { embedded, sessionId } = await resetAndStartEmbedded();
const dataDir = embedded.forgeniqDataDir;
const ownerInPgdata = existsSync(join(dataDir, '.forgeniq-embedded-owner.json'));
check('no owner metadata inside PGDATA', !ownerInPgdata);

const regPath = join(localPgVerifyBase(), '_registry', `${sessionId}.json`);
check('registry entry outside PGDATA', existsSync(regPath));
const reg = JSON.parse(readFileSync(regPath, 'utf8'));
check('registry cites dataDir + runId', reg.dataDir === dataDir && typeof reg.runId === 'string');
check('resolveEmbeddedDataDirOwner matches', resolveEmbeddedDataDirOwner(dataDir)?.sessionId === sessionId);

await stopEmbedded(embedded);
const cleanup = cleanupOrphanEmbeddedPgDirs();
check('stop removes data dir', !existsSync(dataDir));
check('registry cleaned for stopped session', !existsSync(regPath));

console.log(fail ? 'FAIL acceptance-embedded-pg-registry' : 'PASS acceptance-embedded-pg-registry');
process.exit(fail ? 1 : 0);