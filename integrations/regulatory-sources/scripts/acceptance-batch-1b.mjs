#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSourceById } from '../../../packages/reference-data/index.mjs';
import { BATCH_1B_CONNECTORS, BATCH_1B_SOURCE_IDS } from '../connectors/batch-1b-connectors.mjs';
import { VERIFICATION_STATUS } from '../core/contract.mjs';

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

for (const id of BATCH_1B_SOURCE_IDS) {
  if (!getSourceById(id)) fail(`catalogue missing ${id}`);
  else pass(`catalogue resolves ${id}`);
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
  'connectors/batch-1b-connectors.mjs',
  'core/http-client.mjs',
  'core/pattern-html-connector.mjs',
  'core/document-library-connector.mjs',
]) {
  scanFile(rel);
  pass(`security scan ${rel}`);
}

for (const c of BATCH_1B_CONNECTORS) {
  for (const h of c.allowedHosts) {
    if (h.includes('wikipedia') || h.includes('google')) fail(`unofficial host ${h}`);
  }
  pass(`${c.sourceId} allowlist official`);
}

const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
if (!gitignore.includes('integrations/regulatory-sources/evidence/')) fail('evidence not gitignored');
else pass('evidence gitignored');

const catPath = join(repoRoot, 'packages', 'reference-data', 'catalogue', 'regulators.mjs');
const catBefore = readFileSync(catPath, 'utf8');
pass('catalogue readable (unchanged by this script)');

let results = [];
if (live) {
  for (const c of BATCH_1B_CONNECTORS) {
    const out = await c.verify({ liveAllowed: true });
    results.push({ connector: c, out });
    const st = out.summary.verificationStatus;
    if (st === VERIFICATION_STATUS.LIVE_VERIFIED) {
      if (out.items.length === 0) fail(`${c.sourceId} LIVE_VERIFIED without items`);
      for (const item of out.items) {
        if (!item.contentHash) fail(`${c.sourceId} missing hash`);
        if (!item.sourceDocumentUrl) fail(`${c.sourceId} missing canonical URL`);
      }
      pass(`${c.sourceId} verified with provenance`);
    } else {
      pass(`${c.sourceId} honest status ${st}`);
      if (out.items.some((i) => i.verificationStatus === VERIFICATION_STATUS.LIVE_VERIFIED)) {
        fail(`${c.sourceId} inconsistent verified items`);
      }
    }
  }
} else if (existsSync(join(labRoot, 'evidence', 'batch-1b-latest.json'))) {
  pass('batch-1b evidence present');
}

const catAfter = readFileSync(catPath, 'utf8');
if (catBefore !== catAfter) fail('catalogue modified during acceptance');
else pass('catalogue IDs unchanged');

if (failed) {
  console.error(`\nBatch 1B acceptance: FAIL (${failed})`);
  process.exit(1);
}
console.log('\nBatch 1B acceptance: PASS');
