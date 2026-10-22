#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCatalogueIntegrationStatus } from './lib/integration-status-map.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const evidence = JSON.parse(
  readFileSync(join(__dir, '..', 'evidence', 'batch-2-latest.json'), 'utf8'),
);
const MANIFEST = 'integrations/regulatory-sources/manifests/batch-2-verification.json';

for (const r of evidence.results) {
  const s = r.summary;
  const status = toCatalogueIntegrationStatus(s.verificationStatus);
  const host = r.allowedHosts?.[0] || null;
  const contentUrl = r.feedUrl || s.sourceDocumentUrl || s.officialUrl;
  const pub = r.publications?.[0];
  console.log(`  '${r.sourceId}': {`);
  console.log(`    verificationStatus: '${status}',`);
  console.log(`    productionStatus: 'NOT_ENABLED',`);
  console.log(`    verifiedAt: '${s.retrievedAt}',`);
  console.log(`    verificationEvidenceRef: \`\${MANIFEST_BATCH_2}#${r.sourceId}\`,`);
  console.log(`    verifiedRetrievalMethod: '${s.retrievalMethod}',`);
  console.log(`    productionStrategy: '${r.productionStrategy}',`);
  if (contentUrl) console.log(`    canonicalRegulatoryContentUrl: '${contentUrl}',`);
  if (host) console.log(`    canonicalContentHostname: '${host}',`);
  console.log(`    officialSupportingHostnames: ${JSON.stringify(r.allowedHosts)},`);
  if (s.officialUrl) console.log(`    primaryRegulatorSiteUrl: '${s.officialUrl}',`);
  if (s.error) console.log(`    accessNotes: '${s.error.replace(/'/g, "\\'")}',`);
  console.log('  },');
}
