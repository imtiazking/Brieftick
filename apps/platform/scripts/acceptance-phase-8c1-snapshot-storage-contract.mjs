#!/usr/bin/env node
/**
 * Storage contract tests (memory adapter) — idempotent put + integrity.
 */
import { createHash } from 'node:crypto';
import { buildEvidenceCapture } from '../../../integrations/regulatory-sources/core/evidence-capture.mjs';
import { createMemorySnapshotStorage } from '../lib/ri/ingestion/snapshot/memory-storage.mjs';
import { uploadSnapshotEvidence } from '../lib/ri/ingestion/snapshot/upload.mjs';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const storage = createMemorySnapshotStorage();
const body = Buffer.from('<html><body><p>contract</p></body></html>', 'utf8');
const evidence = await buildEvidenceCapture({
  body,
  contentType: 'text/html; charset=UTF-8',
  finalUrl: 'https://example.test/doc',
  connectorId: 'test',
});

async function main() {
  const uploadParams = {
    evidenceCapture: evidence,
    contentHash: evidence.fingerprint.hash,
    connectorId: 'test',
    ingestionRunId: '00000000-0000-0000-0000-000000000001',
  };
  const up1 = await uploadSnapshotEvidence(storage, uploadParams);
  const up2 = await uploadSnapshotEvidence(storage, uploadParams);
  if (up1.paths.raw === up2.paths.raw) pass('content-addressed stable paths');
  else failMsg('path drift');

  const keys = await storage.listKeys({ prefix: 'by-hash/' });
  if (keys.length === 4) pass('four objects uploaded');
  else failMsg(`object count ${keys.length}`);

  try {
    await storage.putObject({
      key: up1.paths.raw,
      body: Buffer.from('other'),
      contentType: 'text/html',
      sha256: createHash('sha256').update('other').digest('hex'),
    });
    failMsg('conflicting put should throw');
  } catch {
    pass('integrity on conflicting re-upload');
  }

  if (!fail) console.log('\nacceptance-phase-8c1-snapshot-storage-contract: PASS\n');
  else {
    console.error(`\nacceptance-phase-8c1-snapshot-storage-contract: FAIL (${fail})\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
