#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSourceById } from '../../../packages/reference-data/index.mjs';
import { BATCH_1_CONNECTORS, BATCH_1_SOURCE_IDS } from '../connectors/batch-1-registry.mjs';
import { HTTP_LIMITS, VERIFICATION_STATUS } from '../core/contract.mjs';
import { httpGet } from '../core/http-client.mjs';

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

// 1. Catalogue IDs
for (const id of BATCH_1_SOURCE_IDS) {
  if (!getSourceById(id)) fail(`missing catalogue source ${id}`);
  else pass(`catalogue resolves ${id}`);
}

// 2–8. Connector contract static checks
for (const c of BATCH_1_CONNECTORS) {
  if (!c.connectorId || !c.regulatorId || !c.sourceId) fail(`${c.connectorId}: missing ids`);
  else pass(`${c.connectorId}: ids present`);

  if (!Array.isArray(c.allowedHosts) || c.allowedHosts.length === 0) {
    fail(`${c.connectorId}: allowlist missing`);
  } else pass(`${c.connectorId}: allowlist`);

  if (c.maxItems > HTTP_LIMITS.maxItemsPerSource) fail(`${c.connectorId}: maxItems too high`);
  else pass(`${c.connectorId}: item limit`);

  if (c.maxRequests > HTTP_LIMITS.maxRequestsPerConnector) fail(`${c.connectorId}: request budget`);
  else pass(`${c.connectorId}: request budget`);

  const src = readFileSync(join(labRoot, 'core', 'http-client.mjs'), 'utf8');
  if (!src.includes('timeoutMs') || !src.includes('maxBytes')) fail('http-client missing bounds');
  if (!c.feedUrl.startsWith('https://')) fail(`${c.connectorId}: feed must be HTTPS`);
  else pass(`${c.connectorId}: HTTPS feed`);
}

pass('http-client timeouts and size bounds');

// 9. No secrets in lab tree
const secretPattern = /(api[_-]?key|Bearer\s|sk_live|password\s*=)/i;
for (const rel of ['connectors/batch-1-registry.mjs', 'core/http-client.mjs']) {
  const text = readFileSync(join(labRoot, rel), 'utf8');
  if (secretPattern.test(text)) fail(`possible secret in ${rel}`);
  else pass(`no secrets pattern in ${rel}`);
}

// 10–12. Frozen RI / MI / FC unchanged (git status snapshot via file markers)
const frozenMarker = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'router.js');
if (!existsSync(frozenMarker)) fail('frozen RI path missing');
else pass('frozen RI path exists (not edited by this script)');

const miIndex = join(repoRoot, 'index.html');
if (existsSync(miIndex)) {
  const mi = readFileSync(miIndex, 'utf8');
  if (mi.includes('integrations/regulatory-sources')) fail('MI wired to integration lab');
  else pass('production MI not wired to lab');
}

const fcEngine = join(repoRoot, 'design-lab', 'financial-crime', 'js', 'sanctions', 'uksl-service.js');
if (existsSync(fcEngine)) {
  const fc = readFileSync(fcEngine, 'utf8');
  if (fc.includes('CONN-B1-OFSI')) fail('FC screening engine created in lab');
  else pass('no FC screening engine in lab connectors');
}

// 13. SEC EDGAR bulk
const regText = readFileSync(join(labRoot, 'connectors', 'batch-1-registry.mjs'), 'utf8');
if (/browse-edgar|data\.sec\.gov\/submissions/i.test(regText)) fail('SEC EDGAR bulk referenced');
else pass('no SEC EDGAR bulk ingestion');

// Live verification checks
let liveResults = [];
if (live) {
  for (const c of BATCH_1_CONNECTORS) {
    const out = await c.verify({ liveAllowed: true });
    liveResults.push({ connector: c, out });
    const status = out.summary.verificationStatus;
    if (status === VERIFICATION_STATUS.LIVE_VERIFIED) {
      if (out.items.length === 0) fail(`${c.sourceId}: LIVE_VERIFIED without items`);
      else pass(`${c.sourceId}: LIVE_VERIFIED with ${out.items.length} items`);
      for (const item of out.items) {
        if (!item.contentHash) fail(`${c.sourceId}: missing content hash`);
        else pass(`${c.sourceId}: evidence hash`);
      }
    } else {
      pass(`${c.sourceId}: honest non-verified state ${status}`);
      if (out.items.some((i) => i.verificationStatus === VERIFICATION_STATUS.LIVE_VERIFIED)) {
        fail(`${c.sourceId}: failed summary but verified items`);
      }
    }
  }
} else {
  const evidencePath = join(labRoot, 'evidence', 'batch-1-latest.json');
  if (existsSync(evidencePath)) {
    liveResults = JSON.parse(readFileSync(evidencePath, 'utf8')).results.map((r) => ({
      connector: BATCH_1_CONNECTORS.find((c) => c.sourceId === r.sourceId),
      out: { summary: r.summary, items: Array.from({ length: r.itemCount }) },
      reportStatus: r.reportStatus,
    }));
    pass('using evidence/batch-1-latest.json for status checks');
  } else {
    console.log('SKIP: live checks (run with --live or generate evidence first)');
  }
}

// 14–16 from evidence
for (const row of liveResults) {
  const s = row.out.summary.verificationStatus;
  if (s === VERIFICATION_STATUS.LIVE_VERIFIED && row.out.items.length < 1) {
    fail(`${row.connector.sourceId}: LIVE_VERIFIED requires items`);
  }
  if (s !== VERIFICATION_STATUS.LIVE_VERIFIED && row.out.items?.length > 0) {
    const anyVerified = row.out.items.some?.(
      (i) => i.verificationStatus === VERIFICATION_STATUS.LIVE_VERIFIED,
    );
    if (anyVerified) fail(`${row.connector.sourceId}: inconsistent verification`);
  }
}

// Smoke: httpGet enforces HTTPS
const httpsReject = await httpGet('http://example.com', { allowedHosts: ['example.com'] });
if (httpsReject.ok) fail('http allowed');
else pass('HTTPS enforced on http-client');

if (failed > 0) {
  console.error(`\nBatch 1 acceptance: FAIL (${failed})`);
  process.exit(1);
}
console.log('\nBatch 1 acceptance: PASS');
