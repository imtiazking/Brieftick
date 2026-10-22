#!/usr/bin/env node
/**
 * Phase 7C.5 — work queue, governance, SLA, notifications & reporting golden-master parity.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');
const labRoot = join(repoRoot, 'design-lab', 'regulatory-intelligence');
const compatDir = join(platformRoot, 'lib', 'ri', 'lab-compat');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

for (const f of [
  'sla-parity.mjs',
  'work-queue-parity.mjs',
  'notifications-parity.mjs',
  'governance-parity.mjs',
  'reporting-parity.mjs',
]) {
  if (!existsSync(join(compatDir, f))) failMsg(`missing lab-compat/${f}`);
  else pass(`lab-compat/${f}`);
}

function walkRi(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkRi(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

for (const f of walkRi(join(platformRoot, 'app', 'ri'))) {
  if (readFileSync(f, 'utf8').includes('design-lab/regulatory-intelligence')) {
    failMsg(`design lab import in ${f}`);
  }
}
pass('production /ri has no design-lab runtime imports');

const impactSvc = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'impact.ts'), 'utf8');
if (impactSvc.includes('assertImpactApproverSoD')) pass('impact approval SoD');
else failMsg('impact approval SoD missing');

const wqSvc = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'work-queue.ts'), 'utf8');
if (wqSvc.includes('slaState') && wqSvc.includes('deriveSlaPresentation')) pass('work queue SLA presentation');
else failMsg('work queue SLA presentation');

const { createFreshState } = await import(pathToFileURL(join(labRoot, 'js', 'migrate.js')).href);
const { hydrateStore } = await import(pathToFileURL(join(labRoot, 'js', 'store.js')).href);
const { buildWorkQueue, buildNotifications } = await import(
  pathToFileURL(join(labRoot, 'js', 'workflow-helpers.js')).href,
);

const { slaStatus, DEMO_DUE_SOON_DAYS } = await import(pathToFileURL(join(compatDir, 'sla-parity.mjs')).href);
const { compareWorkQueueParity, compareMyWorkParity, compareMyTeamParity } = await import(
  pathToFileURL(join(compatDir, 'work-queue-parity.mjs')).href,
);
const { compareNotificationsParity } = await import(
  pathToFileURL(join(compatDir, 'notifications-parity.mjs')).href,
);
const {
  compareGovernanceMetricsParity,
  compareGovernanceHistoryParity,
  checkMakerChecker,
  SOD,
} = await import(pathToFileURL(join(compatDir, 'governance-parity.mjs')).href);
const { compareReportingParity } = await import(
  pathToFileURL(join(compatDir, 'reporting-parity.mjs')).href,
);
const { labActionIsOverdue, productionActionIsOverdue, labActionStatusToProduction } = await import(
  pathToFileURL(join(compatDir, 'action-overdue-parity.mjs')).href,
);

const state = createFreshState();
hydrateStore(state);
state.scenarioId = 'consumer-duty';

if (DEMO_DUE_SOON_DAYS === 14) pass('due-soon threshold 14d');
else failMsg('due-soon threshold');

if (slaStatus('2026-10-20', false) === 'Due Soon' && slaStatus('2026-10-01', false) === 'Overdue') {
  pass('SLA due soon / overdue');
} else failMsg('SLA states');

const labQueue = buildWorkQueue(state, state.scenarioId);
const wq = compareWorkQueueParity(state, labQueue);
if (wq.match) pass(`work queue parity (${wq.labCount})`);
else failMsg(`work queue lab=${wq.labCount} prod=${wq.prodCount}`);

const my = compareMyWorkParity(state, labQueue, state.currentDemoUserId);
if (my.match) pass(`my work parity (${my.labCount})`);
else failMsg(`my work lab=${my.labCount} prod=${my.prodCount}`);

const team = compareMyTeamParity(state, labQueue, state.currentDemoUserId);
if (team.match) pass(`my team parity (${team.labCount})`);
else failMsg(`my team lab=${team.labCount} prod=${team.prodCount}`);

const actions = (state.actions || []).filter((a) => a.scenario === 'consumer-duty');
const overdueLab = actions.filter((a) => labActionIsOverdue(a)).map((a) => a.id).sort();
const overdueProd = actions
  .filter((a) => productionActionIsOverdue(a.dueDate, labActionStatusToProduction(a.status)))
  .map((a) => a.id)
  .sort();
if (overdueLab.join() === overdueProd.join()) pass('action overdue sets');
else failMsg(`action overdue lab=${overdueLab.join()} prod=${overdueProd.join()}`);

const notes = compareNotificationsParity(state, buildNotifications(state, state.scenarioId));
if (notes.match) pass(`notifications production-equivalent (${notes.labCount})`);
else failMsg(`notifications lab=${notes.labCount} prod=${notes.prodCount}`);

const gov = compareGovernanceMetricsParity(state);
if (gov.match) pass('governance metrics');
else failMsg(`governance metrics ${gov.mismatches.join(',')}`);

const hist = compareGovernanceHistoryParity(state);
if (hist.match) pass(`governance decision history (${hist.labCount})`);
else failMsg(`governance history lab=${hist.labCount} prod=${hist.prodCount}`);

if (checkMakerChecker(state, { submitterId: 'u-a', approverId: 'u-b', policy: { makerCheckerRequired: true } }).result === SOD.PASS) {
  pass('SoD different approver');
} else failMsg('SoD different approver');

if (checkMakerChecker(state, { submitterId: 'u-a', approverId: 'u-a', policy: { makerCheckerRequired: true } }).result === SOD.BLOCKED) {
  pass('SoD blocked same user');
} else failMsg('SoD blocked');

const reporting = compareReportingParity(state);
if (reporting.match) pass('reporting / board metrics');
else failMsg(`reporting ${reporting.mismatches.join(',')}`);

const visualDoc = join(platformRoot, 'docs', 'visual-review', 'phase-7c5-operations-governance-parity.md');
if (existsSync(visualDoc)) pass('phase 7C.5 visual parity doc');
else failMsg('phase-7c5-operations-governance-parity.md missing');

const pkg = readFileSync(join(platformRoot, 'package.json'), 'utf8');
if (pkg.includes('test:acceptance:phase7c5')) pass('npm script phase7c5');
else failMsg('npm script phase7c5');

if (fail) {
  console.error(`\nPhase 7C.5 golden master acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7C.5 golden master acceptance: PASS');
