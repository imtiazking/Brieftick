#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMANTIC_REMEDIATION_CONNECTORS } from '../connectors/semantic-remediation-connectors.mjs';
import { BATCH_2_CONNECTORS } from '../connectors/batch-2-connectors.mjs';
import { samaRulebookConnector } from '../connectors/batch-1b-connectors.mjs';
import { toReportStatus } from '../core/contract.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const evidenceDir = join(root, 'evidence');
const rawDir = join(evidenceDir, 'raw');
mkdirSync(rawDir, { recursive: true });

const REMEDIATE_SOURCE_IDS = new Set([
  'SRC-OFAC-REGULATORY-UPDATES',
  'SRC-VARA-REGULATORY-UPDATES',
  'SRC-CFPB-REGULATORY-UPDATES',
  'SRC-CFPB-RULES',
  'SRC-FDIC-GUIDANCE',
  'SRC-OCC-BULLETINS',
  'SRC-SEC-RULEMAKING',
  'SRC-CFTC-RULEMAKING',
  'SRC-VARA-RULEBOOK',
  'SRC-SAMA-RULEBOOK',
  'SRC-IA-SA-REGULATIONS',
]);

const connectors = [
  ...SEMANTIC_REMEDIATION_CONNECTORS,
  samaRulebookConnector,
  ...BATCH_2_CONNECTORS.filter((c) => REMEDIATE_SOURCE_IDS.has(c.sourceId)),
];

const retrievedAt = new Date().toISOString();
const results = [];

for (const connector of connectors) {
  const out = await connector.verify({ liveAllowed: true });
  for (let i = 0; i < out.items.length; i++) {
    const item = out.items[i];
    const fname = `${connector.sourceId}-sem-${i + 1}.meta.json`;
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
  console.log(`${connector.sourceId}\t${toReportStatus(out.summary.verificationStatus)}\titems=${out.items.length}`);
}

writeFileSync(
  join(evidenceDir, 'batch-semantic-remediation-latest.json'),
  JSON.stringify({ batch: 'semantic-remediation', retrievedAt, results }, null, 2),
);
