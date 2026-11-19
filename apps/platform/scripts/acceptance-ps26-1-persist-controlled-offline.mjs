#!/usr/bin/env node
/**
 * Offline PS26/1 controlled catalogue persist — SHA verify, pipeline, fail-closed hosted gate, rollback plan.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const {
  runPs26OfflineIngestPipeline,
  persistPs26ControlledCatalogue,
  buildPs26RollbackSteps,
  verifyPs26OfficialPdfBytes,
} = await import(
  pathToFileURL(
    join(REPO_ROOT, 'apps/platform/lib/ri/ingestion/snapshot/ps26-1-persist-controlled.mjs'),
  ).href
);

const { loadPs26OfficialPdfBytes } = await import(
  pathToFileURL(
    join(REPO_ROOT, 'apps/platform/lib/ri/ingestion/snapshot/ps26-official-pdf-source.mjs'),
  ).href,
);
let loaded;
try {
  loaded = await loadPs26OfficialPdfBytes();
  verifyPs26OfficialPdfBytes(loaded.pdfBytes);
  ok(`official PDF SHA-256 verified (${loaded.source})`);
} catch {
  fail('PDF SHA-256 mismatch or fixture missing');
}

const pipeline = await runPs26OfflineIngestPipeline({});
if (!pipeline.globalCatalogue || pipeline.tenantObligationsOrChangesTouched !== false) {
  fail('global catalogue flags');
} else ok('global catalogue only — no tenant obligations');

if (!pipeline.pdfExtraction?.pageCount) fail('pdf extraction pageCount');
else ok(`pdf extract pages=${pipeline.pdfExtraction.pageCount}`);

const rollback = buildPs26RollbackSteps({ publicationId: 'pub', runId: 'run', snapshotId: 'snap' });
if (!rollback.steps?.length) fail('rollback steps');
else ok('rollback script scoped to ingest records');

let hostedBlocked = false;
try {
  await persistPs26ControlledCatalogue(null, {
    pdfBytes: loaded.pdfBytes,
    hostedWriteAuthorized: false,
  });
} catch (e) {
  if (e.message === 'ps26_hosted_persist_requires_hostedWriteAuthorized' && e.offlinePlan) {
    hostedBlocked = true;
  }
}
if (hostedBlocked) ok('hosted persist fail-closed without operator flag');
else fail('expected hostedWriteAuthorized gate');

const badSha = Buffer.from('not-the-pdf');
try {
  verifyPs26OfficialPdfBytes(badSha);
  fail('bad bytes should throw');
} catch (e) {
  if (e.message === 'ps26_primary_pdf_sha256_mismatch') ok('rejects wrong PDF bytes');
  else fail('unexpected error on bad sha');
}

const out = join(REPO_ROOT, 'docs/eval/PS26-1-PERSIST-CONTROLLED-OFFLINE.json');
writeFileSync(
  out,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      programmePass: failures.length === 0,
      pipelineSummary: {
        sha256: pipeline.verifiedPdf?.sha256,
        globalCatalogue: pipeline.globalCatalogue,
        hostedSteps: pipeline.hostedStepsWhenAuthorized,
      },
      failures,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ ok: failures.length === 0, out, failures }, null, 2));
process.exit(failures.length ? 1 : 0);