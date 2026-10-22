#!/usr/bin/env node
/**
 * Offline clean-clone simulation: catalogue + tracked manifests only (no evidence/).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGULATORY_SOURCES, getSourceById } from '../index.mjs';
import { SOURCE_INTEGRATION_BY_ID } from '../catalogue/source-integration.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..', '..', '..');

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

const evidencePath = join(repoRoot, 'integrations', 'regulatory-sources', 'evidence', 'batch-1-latest.json');
if (existsSync(evidencePath)) {
  pass('raw evidence may exist locally; this test does not depend on it');
} else {
  pass('raw evidence absent (clean-clone shape)');
}

function loadManifestEntry(ref) {
  const [filePart, sourceId] = ref.split('#');
  const manifestPath = join(repoRoot, filePart);
  if (!existsSync(manifestPath)) {
    failMsg(`missing tracked manifest ${filePart}`);
    return null;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = manifest.entries.find((e) => e.sourceId === sourceId);
  if (!entry) failMsg(`manifest entry missing ${sourceId} in ${filePart}`);
  return entry;
}

if (REGULATORY_SOURCES.length !== 41) failMsg('catalogue source count');
else pass('catalogue loads (41 sources)');

let liveVerified = 0;
let accessRestricted = 0;

for (const sourceId of Object.keys(SOURCE_INTEGRATION_BY_ID)) {
  const integration = SOURCE_INTEGRATION_BY_ID[sourceId];
  if (!getSourceById(sourceId)) failMsg(`catalogue missing ${sourceId}`);
  else pass(`catalogue has ${sourceId}`);

  const ref = integration.verificationEvidenceRef || '';
  if (!ref) {
    if (integration.verificationStatus === 'NOT_TESTED') {
      pass(`${sourceId} NOT_TESTED without manifest (honest)`);
      continue;
    }
    failMsg(`${sourceId} must reference tracked manifest`);
    continue;
  }
  if (!ref.includes('/manifests/')) failMsg(`${sourceId} must reference tracked manifest`);
  else pass(`${sourceId} references tracked manifest`);
  if (ref.includes('/evidence/')) failMsg(`${sourceId} must not reference gitignored evidence`);

  const entry = loadManifestEntry(ref);
  if (!entry) continue;
  if (entry.sourceId !== sourceId) failMsg(`manifest sourceId mismatch for ${sourceId}`);
  else pass(`${sourceId} manifest sourceId matches`);

  if (integration.verificationStatus !== entry.verificationStatus) {
    failMsg(`${sourceId} catalogue vs manifest verificationStatus mismatch`);
  } else pass(`${sourceId} verificationStatus aligned`);

  if (entry.verificationStatus === 'LIVE_VERIFIED') {
    liveVerified += 1;
    if (!entry.representativeDocuments?.[0]?.sha256) failMsg(`${sourceId} manifest missing sha256`);
    else pass(`${sourceId} manifest has sha256`);
    if (!entry.representativeDocuments?.[0]?.representativeDocumentUrl) {
      failMsg(`${sourceId} manifest missing representative URL`);
    } else pass(`${sourceId} manifest has representative URL`);
  }
  if (entry.verificationStatus === 'ACCESS_RESTRICTED') {
    accessRestricted += 1;
  }
}

const expectedLive = Object.values(SOURCE_INTEGRATION_BY_ID).filter(
  (i) => i.verificationStatus === 'LIVE_VERIFIED',
).length;
if (liveVerified !== expectedLive) {
  failMsg(`expected ${expectedLive} LIVE_VERIFIED manifest entries, got ${liveVerified}`);
} else pass(`${expectedLive} LIVE_VERIFIED sources provable from manifests`);

if (accessRestricted !== 3) failMsg(`expected 3 ACCESS_RESTRICTED, got ${accessRestricted}`);
else pass('3 ACCESS_RESTRICTED (CBUAE, Tadawul, FSRA)');

if (getSourceById('SRC-CBUAE-DIGITAL-RULEBOOK')?.integration?.verificationStatus !== 'ACCESS_RESTRICTED') {
  failMsg('CBUAE not ACCESS_RESTRICTED in catalogue');
} else pass('CBUAE remains ACCESS_RESTRICTED in catalogue');

if (fail) {
  console.error(`\nClean-clone catalogue acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nClean-clone catalogue acceptance: PASS');
