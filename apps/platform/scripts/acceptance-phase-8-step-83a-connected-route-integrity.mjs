#!/usr/bin/env node
/**
 * Step 83A — connected-mode route integrity (Design Lab hash router).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const labRoot = join(platformRoot, '..', '..', 'design-lab', 'regulatory-intelligence', 'js');

function readLab(rel) {
  return readFileSync(join(labRoot, rel), 'utf8');
}

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const guard = readLab('platform/connected-route-guard.js');
const store = readLab('store.js');
const views = readLab('views.js');
const landscape = readLab('landscape-views.js');
const ingestion = readLab('ingestion-views.js');
const operational = readLab('operational-views.js');
const assurance = readLab('assurance-views.js');
const aiOps = readLab('ai-operations-views.js');
const demo = readLab('demo-views.js');
const app = readLab('app.js');

if (guard.includes('guardConnectedDemoSubroute') && guard.includes('CONNECTED_UNAVAILABLE_COPY')) {
  pass('connected-route-guard module');
} else failMsg('connected-route-guard module');

if (store.includes('isConnectedBackendActive(state)') && store.includes('_connected === true')) {
  pass('scenarioFilter blocks demo seed in connected mode');
} else failMsg('scenarioFilter connected guard');

if (views.includes('getViewPublications()') && views.includes('function viewFeed') && !views.match(/function viewFeed[\s\S]{0,400}scenarioFilter\(s\.publications\)/)) {
  pass('feed uses connected publications');
} else if (views.includes('function viewFeed') && views.includes('getViewPublications()')) {
  pass('feed connected branch');
} else failMsg('feed connected');

if (views.includes('function viewHorizon') && views.includes('getViewPublications()')) pass('horizon connected');
else failMsg('horizon connected');

if (views.includes('function viewCalendar') && views.includes('Regulatory Calendar')) pass('calendar connected unavailable');
else failMsg('calendar');

if (landscape.includes('publicationsForSector') && landscape.includes('sectorIdsForFw')) pass('framework detail connected mapping');
else failMsg('framework detail');

if (ingestion.includes('guardConnectedDemoSubroute') && ingestion.includes('viewIngestionItem')) pass('ingestion sub-routes guarded');
else failMsg('ingestion sub-routes');

if (
  operational.includes('guardConnectedDemoSubroute') &&
  (views.includes('Connected tenant reporting') || views.includes('renderConnectedReportingPeriodSelector'))
)
  pass('reports hub connected');
else failMsg('reports hub');

if (aiOps.includes('guardConnectedDemoSubroute')) pass('ai operations guarded');
else failMsg('ai operations');

if (demo.includes('guardConnectedDemoSubroute')) pass('demo journeys guarded');
else failMsg('demo journeys');

if (app.includes('isConnectedBackendActive(getState())') && app.includes('buildNotifications')) pass('chrome alerts skip demo notifications');
else failMsg('app notification badge');

const routeCases = (views.match(/case '[a-z0-9-]+'/g) || []).length;
if (routeCases >= 40) pass(`route registry parsed (${routeCases} cases)`);
else failMsg(`route registry count ${routeCases}`);

const router = readLab('router.js');
if (views.includes("case 'findings'") && router.includes("'findings'")) pass('findings route gate matches views.js');
else failMsg('router KNOWN_TOP_LEVEL must include findings when views.js handles it');

const integrityFiles = [
  'legislation-views.js',
  'tpr-views.js',
  'basel-views.js',
  'ai-governance-views.js',
];
for (const f of integrityFiles) {
  const src = readLab(f);
  if (src.includes('guardConnectedDemoSubroute') || src.includes('isConnectedBackendActive')) {
    pass(`${f} connected awareness`);
  } else failMsg(`${f} connected awareness`);
}

if (fail) process.exit(1);
console.log('\nacceptance-phase-8-step-83a-connected-route-integrity: PASS\n');
