#!/usr/bin/env node
/**
 * Regulator connector contract (offline, fixtures only; no regulator network access).
 * Runs the seven connector suites and asserts registry integrity across catalogue, connectors and policy.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptsDir = join(repoRoot, 'integrations', 'regulatory-sources', 'scripts');
let fail = 0;
const pass = (id) => console.log(`PASS: ${id}`);
const failTest = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};

for (const suite of [
  'acceptance-batch-1',
  'acceptance-batch-1b',
  'acceptance-batch-2',
  'acceptance-fca-html-quality',
  'acceptance-fca-rss-phase8b',
  'acceptance-source-semantics',
  'acceptance-verification-manifests',
]) {
  const r = spawnSync(process.execPath, [join(scriptsDir, `${suite}.mjs`)], { encoding: 'utf8', timeout: 120_000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const passes = (out.match(/^PASS/gm) || []).length;
  const fails = (out.match(/^FAIL/gm) || []).length;
  if (r.status !== 0 || fails > 0 || passes === 0) failTest(`suite_${suite}`, `exit=${r.status} pass=${passes} fail=${fails}`);
  else pass(`suite_${suite} (${passes} checks)`);
}

const { REGULATORS } = await import(pathToFileURL(join(repoRoot, 'packages/reference-data/catalogue/regulators.mjs')).href);
const { REGULATORY_SOURCES } = await import(pathToFileURL(join(repoRoot, 'packages/reference-data/catalogue/regulatory-sources.mjs')).href);
const { ALL_INGESTION_CONNECTORS: connectors } = await import(
  pathToFileURL(join(repoRoot, 'apps/platform/lib/ri/ingestion/connector-registry.mjs')).href
);

const sourceById = new Map(REGULATORY_SOURCES.map((s) => [s.sourceId, s]));
const regulatorIds = new Set(REGULATORS.map((r) => r.regulatorId));

const dupConn = connectors.map((c) => c.connectorId).filter((id, i, a) => a.indexOf(id) !== i);
dupConn.length ? failTest('connector_ids_unique', dupConn.join(',')) : pass('connector_ids_unique');
const dupSrc = connectors.map((c) => c.sourceId).filter((id, i, a) => a.indexOf(id) !== i);
dupSrc.length ? failTest('one_connector_per_source', dupSrc.join(',')) : pass('one_connector_per_source');
const dupCatalogue = REGULATORY_SOURCES.map((s) => s.sourceId).filter((id, i, a) => a.indexOf(id) !== i);
dupCatalogue.length ? failTest('catalogue_source_ids_unique', dupCatalogue.join(',')) : pass('catalogue_source_ids_unique');

const orphan = connectors.filter((c) => !sourceById.has(c.sourceId)).map((c) => c.connectorId);
orphan.length ? failTest('connector_maps_to_catalogue_source', orphan.join(',')) : pass('connector_maps_to_catalogue_source');
const wrongRegulator = connectors
  .filter((c) => sourceById.has(c.sourceId) && sourceById.get(c.sourceId).regulatorId !== c.regulatorId)
  .map((c) => c.connectorId);
wrongRegulator.length ? failTest('connector_regulator_matches_source', wrongRegulator.join(',')) : pass('connector_regulator_matches_source');
const unknownRegulator = connectors.filter((c) => !regulatorIds.has(c.regulatorId)).map((c) => c.connectorId);
unknownRegulator.length ? failTest('connector_regulator_known', unknownRegulator.join(',')) : pass('connector_regulator_known');

const noHosts = connectors.filter((c) => !Array.isArray(c.allowedHosts) || c.allowedHosts.length === 0).map((c) => c.connectorId);
noHosts.length ? failTest('connector_host_allowlist_present', noHosts.join(',')) : pass('connector_host_allowlist_present');

const badUrl = [];
for (const c of connectors) {
  if (!c.feedUrl) continue;
  try {
    const u = new URL(c.feedUrl);
    const hostOk = c.allowedHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
    if (u.protocol !== 'https:' || !hostOk) badUrl.push(`${c.connectorId}:${u.protocol}//${u.hostname}`);
  } catch {
    badUrl.push(`${c.connectorId}:unparseable`);
  }
}
badUrl.length ? failTest('connector_feed_https_and_allowlisted', badUrl.join(',')) : pass('connector_feed_https_and_allowlisted');

const noMethod = connectors.filter((c) => !c.retrievalMethod).map((c) => c.connectorId);
noMethod.length ? failTest('connector_retrieval_method_declared', noMethod.join(',')) : pass('connector_retrieval_method_declared');
const noBounds = connectors.filter((c) => c.maxItems == null && c.pilotMaxItems == null).map((c) => c.connectorId);
// connectors may bound items through shared HTTP_LIMITS; report but do not fail when the core enforces a cap
if (noBounds.length) console.log(`NOTE: ${noBounds.length} connector(s) rely on the core default item cap`);

// the gap list must stay explicit: sources without a connector are reported, never silently counted as covered
const uncovered = REGULATORY_SOURCES.filter((s) => !connectors.some((c) => c.sourceId === s.sourceId)).map((s) => s.sourceId);
console.log(`NOTE: catalogue sources without a connector: ${uncovered.join(', ') || 'none'}`);
if (uncovered.length > 3) failTest('connector_coverage_regression', `more than 3 uncovered sources: ${uncovered.join(',')}`);
else pass('connector_coverage_within_known_gap');

if (fail > 0) {
  console.error(`\n${fail} connector contract check(s) failed.`);
  process.exit(1);
}
console.log('\nPASS: regulator connector contract');
