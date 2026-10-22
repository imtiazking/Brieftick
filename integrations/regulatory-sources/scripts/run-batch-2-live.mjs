#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATCH_2_CONNECTORS } from '../connectors/batch-2-connectors.mjs';
import { toReportStatus } from '../core/contract.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const evidenceDir = join(root, 'evidence');
const rawDir = join(evidenceDir, 'raw');

mkdirSync(rawDir, { recursive: true });

const retrievedAt = new Date().toISOString();
const results = [];

for (const connector of BATCH_2_CONNECTORS) {
  const out = await connector.verify({ liveAllowed: true });
  for (let i = 0; i < out.items.length; i++) {
    const item = out.items[i];
    const fname = `${connector.sourceId}-b2-${i + 1}.meta.json`;
    writeFileSync(
      join(rawDir, fname),
      JSON.stringify(
        {
          sourceDocumentUrl: item.sourceDocumentUrl,
          contentHash: item.contentHash,
          title: item.title,
          provenance: item.provenance,
        },
        null,
        2,
      ),
    );
    item.rawContentLocation = `integrations/regulatory-sources/evidence/raw/${fname}`;
  }

  results.push({
    connectorId: connector.connectorId,
    regulatorId: connector.regulatorId,
    sourceId: connector.sourceId,
    productionStrategy: connector.productionStrategy || null,
    allowedHosts: connector.allowedHosts,
    feedUrl: connector.feedUrl || connector.listingUrl || connector.indexUrl || null,
    summary: out.summary,
    itemCount: out.items.length,
    publications: out.publications,
    reportStatus: toReportStatus(out.summary.verificationStatus),
  });
}

writeFileSync(
  join(evidenceDir, 'batch-2-latest.json'),
  JSON.stringify({ batch: 'batch-2', retrievedAt, results }, null, 2),
);

for (const r of results) {
  console.log(
    `${r.sourceId}\t${r.reportStatus}\titems=${r.itemCount}\t${r.summary.error || r.summary.title || ''}`,
  );
}
