#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATCH_1_CONNECTORS } from '../connectors/batch-1-registry.mjs';
import { toReportStatus } from '../core/contract.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const evidenceDir = join(root, 'evidence');
const rawDir = join(evidenceDir, 'raw');

mkdirSync(rawDir, { recursive: true });

const retrievedAt = new Date().toISOString();
const results = [];

for (const connector of BATCH_1_CONNECTORS) {
  const out = await connector.verify({ liveAllowed: true });
  const rawPaths = [];
  for (let i = 0; i < out.items.length; i++) {
    const item = out.items[i];
    const fname = `${connector.sourceId}-${i + 1}.meta.json`;
    const metaPath = join(rawDir, fname);
    writeFileSync(
      metaPath,
      JSON.stringify(
        {
          sourceDocumentUrl: item.sourceDocumentUrl,
          contentHash: item.contentHash,
          title: item.title,
          publishedAt: item.publishedAt,
          provenance: item.provenance,
        },
        null,
        2,
      ),
    );
    item.rawContentLocation = `integrations/regulatory-sources/evidence/raw/${fname}`;
    rawPaths.push(item.rawContentLocation);
  }

  results.push({
    connectorId: connector.connectorId,
    regulatorId: connector.regulatorId,
    sourceId: connector.sourceId,
    allowedHosts: connector.allowedHosts,
    feedUrl: connector.feedUrl,
    summary: out.summary,
    itemCount: out.items.length,
    publications: out.publications,
    reportStatus: toReportStatus(out.summary.verificationStatus),
  });
}

const payload = {
  batch: 'batch-1',
  retrievedAt,
  origin: 'LIVE_VERIFICATION',
  results,
};

writeFileSync(join(evidenceDir, 'batch-1-latest.json'), JSON.stringify(payload, null, 2));

console.log('Batch 1 live verification complete.');
console.log(`Evidence: integrations/regulatory-sources/evidence/batch-1-latest.json`);
for (const r of results) {
  console.log(
    `${r.sourceId}\t${r.reportStatus}\titems=${r.itemCount}\t${r.summary.error || r.summary.title || ''}`,
  );
}
