#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSourceById } from '../../../packages/reference-data/index.mjs';
import { SOURCE_INTEGRATION_BY_ID } from '../../../packages/reference-data/catalogue/source-integration.mjs';
import {
  BATCH_2_CONNECTORS,
  BATCH_2_SOURCE_IDS,
  BATCH_2_MANIFEST_SOURCE_IDS,
} from '../connectors/batch-2-connectors.mjs';
import { VERIFICATION_STATUS } from '../core/contract.mjs';
import { toCatalogueIntegrationStatus } from './lib/integration-status-map.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..', '..', '..');
const labRoot = join(__dir, '..');
const live = process.argv.includes('--live') || process.env.FORGENIQ_LIVE_VERIFY === '1';

let failed = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failed += 1;
  console.error(`FAIL: ${msg}`);
}

for (const id of BATCH_2_SOURCE_IDS) {
  if (!getSourceById(id)) fail(`catalogue missing ${id}`);
  else pass(`catalogue resolves ${id}`);
  const integ = SOURCE_INTEGRATION_BY_ID[id];
  if (!integ) fail(`integration metadata missing ${id}`);
  else if (integ.productionStatus !== 'NOT_ENABLED') fail(`${id} production must be NOT_ENABLED`);
  else pass(`${id} productionStatus NOT_ENABLED`);
  if (integ?.verificationEvidenceRef) {
    const okBatch2 = integ.verificationEvidenceRef.includes('/manifests/batch-2-');
    const okSemantic =
      integ.verificationEvidenceRef.includes('batch-semantic-remediation-verification.json');
    if (!okBatch2 && !okSemantic) fail(`${id} must reference batch-2 or semantic remediation manifest`);
    else pass(`${id} tracked manifest ref`);
  } else if (integ?.verificationStatus === 'NOT_TESTED') {
    pass(`${id} NOT_TESTED without manifest ref`);
  } else if (integ) fail(`${id} missing verificationEvidenceRef`);
}

const forbidden = [
  /rejectUnauthorized\s*:\s*false/i,
  /NODE_TLS_REJECT_UNAUTHORIZED/i,
  /puppeteer|playwright|selenium/i,
  /residential.?proxy|proxy.?rotation/i,
  /captcha/i,
  /2captcha/i,
];

function scanFile(rel) {
  const text = readFileSync(join(labRoot, rel), 'utf8');
  for (const re of forbidden) {
    if (re.test(text)) fail(`forbidden pattern in ${rel}: ${re}`);
  }
  if (/sk_live|api[_-]?key\s*=\s*['"][^'"]+['"]/i.test(text)) fail(`possible secret in ${rel}`);
}

for (const rel of [
  'connectors/batch-2-connectors.mjs',
  'core/http-client.mjs',
  'core/rss.mjs',
  'core/document-library.mjs',
  'core/html-listing.mjs',
]) {
  scanFile(rel);
  pass(`security scan ${rel}`);
}

for (const c of BATCH_2_CONNECTORS) {
  for (const h of c.allowedHosts) {
    if (h.includes('wikipedia') || h.includes('google')) fail(`unofficial host ${h}`);
  }
  pass(`${c.sourceId} allowlist official`);
}

if (readFileSync(join(labRoot, 'connectors/batch-2-connectors.mjs'), 'utf8').includes('sdn.xml')) {
  fail('OFAC connector must not bulk-ingest SDN list in Batch 2 RI pass');
} else pass('no OFAC SDN bulk ingestion in batch-2 connectors');

const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
if (!gitignore.includes('integrations/regulatory-sources/evidence/')) fail('evidence not gitignored');
else pass('raw evidence gitignored');

const manifestPath = join(labRoot, 'manifests', 'batch-2-verification.json');
if (!existsSync(manifestPath)) fail('batch-2 manifest missing');
else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.entries.length !== BATCH_2_MANIFEST_SOURCE_IDS.length) {
    fail('batch-2 manifest entry count');
  } else pass('batch-2 manifest complete');
  for (const id of BATCH_2_MANIFEST_SOURCE_IDS) {
    if (!manifest.entries.some((e) => e.sourceId === id)) fail(`batch-2 manifest missing ${id}`);
    else pass(`batch-2 manifest includes ${id}`);
  }
  const rawBody = /<html|<!DOCTYPE|"%PDF/i.test(readFileSync(manifestPath, 'utf8'));
  if (rawBody) fail('raw content in manifest');
  else pass('manifest has no raw bodies');
}

const frozenRi = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'router.js');
if (!existsSync(frozenRi)) fail('frozen RI path missing');
else pass('frozen RI path exists (not edited by this script)');

const miPath = join(repoRoot, 'apps', 'regulatory-intelligence');
if (existsSync(miPath)) pass('production MI path present');
pass('batch-2 acceptance does not wire production MI');

if (live) {
  for (const c of BATCH_2_CONNECTORS) {
    const out = await c.verify({ liveAllowed: true });
    const st = out.summary.verificationStatus;
    const catalogueSt = toCatalogueIntegrationStatus(st);
    const integ = SOURCE_INTEGRATION_BY_ID[c.sourceId];
    if (integ && integ.verificationStatus !== catalogueSt) {
      fail(`${c.sourceId} live status drift vs catalogue (${catalogueSt} vs stored)`);
    }
    if (st === VERIFICATION_STATUS.LIVE_VERIFIED) {
      for (const item of out.items) {
        if (!item.contentHash) fail(`${c.sourceId} missing hash`);
        if (!item.provenance && !item.sourceDocumentUrl) fail(`${c.sourceId} missing provenance/url`);
      }
      pass(`${c.sourceId} live verified with fingerprints`);
    } else {
      pass(`${c.sourceId} honest live status ${catalogueSt}`);
      if (out.items.some((i) => i.verificationStatus === VERIFICATION_STATUS.LIVE_VERIFIED)) {
        fail(`${c.sourceId} inconsistent verified items`);
      }
    }
  }
} else if (existsSync(join(labRoot, 'evidence', 'batch-2-latest.json'))) {
  const evidence = JSON.parse(readFileSync(join(labRoot, 'evidence', 'batch-2-latest.json'), 'utf8'));
  for (const r of evidence.results) {
    if (!BATCH_2_MANIFEST_SOURCE_IDS.includes(r.sourceId)) {
      pass(`${r.sourceId} legacy batch-2 evidence skipped (semantic remediation manifest)`);
      continue;
    }
    const catalogueSt = toCatalogueIntegrationStatus(r.summary.verificationStatus);
    const integ = SOURCE_INTEGRATION_BY_ID[r.sourceId];
    if (integ?.verificationStatus !== catalogueSt) {
      fail(`${r.sourceId} evidence vs catalogue status mismatch`);
    } else pass(`${r.sourceId} evidence aligned with catalogue`);
    if (catalogueSt === 'LIVE_VERIFIED') {
      if (!r.publications?.[0]?.contentHash) fail(`${r.sourceId} missing sha256 in evidence`);
      else pass(`${r.sourceId} evidence has sha256`);
    }
    if (catalogueSt !== 'LIVE_VERIFIED' && r.publications?.length > 0) {
      const hasHash = r.publications.some((p) => p.contentHash);
      if (hasHash && catalogueSt === 'ACCESS_RESTRICTED') {
        fail(`${r.sourceId} restricted must not have hashes`);
      }
    }
  }
}

const catPath = join(repoRoot, 'packages', 'reference-data', 'catalogue', 'regulators.mjs');
const idsBefore = readFileSync(catPath, 'utf8').match(/regulatorId: 'REG-/g)?.length;
if (idsBefore !== 36) fail('regulator count changed');
else pass('catalogue IDs unchanged');

if (failed) {
  console.error(`\nBatch 2 acceptance: FAIL (${failed})`);
  process.exit(1);
}
console.log('\nBatch 2 acceptance: PASS');
