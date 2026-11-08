#!/usr/bin/env node
/**
 * BUS-UAT-013 — static regression for connected action lab writes (no auto DB mutations).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platform = join(__dir, '..');
const lab = join(__dir, '..', '..', '..', 'design-lab', 'regulatory-intelligence');
let fail = 0;

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}

function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

const routes = [
  join(platform, 'app/api/ri-lab/actions/route.ts'),
  join(platform, 'app/api/ri-lab/actions/[id]/route.ts'),
];
for (const p of routes) {
  if (!existsSync(p)) failTest('routes', `missing ${p}`);
  else pass('routes', p.replace(/.*apps[\\/]platform[\\/]/, ''));
}

const writes = readFileSync(join(lab, 'js/platform/connected-work-writes.js'), 'utf8');
if (!writes.includes('createConnectedAction') || !writes.includes('mergeActionCatalogueRow')) {
  failTest('writes', 'connected-work-writes must create/merge actions');
} else {
  pass('writes', 'POST/PATCH actions wired');
}

const mode = readFileSync(join(lab, 'js/platform/connected-mode.js'), 'utf8');
if (!mode.includes('isConnectedActionWritesEnabled')) {
  failTest('mode', 'action write capability flag');
} else {
  pass('mode', 'writeCapabilities.actions');
}

const labWrites = readFileSync(join(platform, 'lib/ri/lab-api/lab-connected-writes.ts'), 'utf8');
if (!labWrites.includes('actions:') || !labWrites.includes('action:write')) {
  failTest('server_gate', 'buildLabWriteCapabilities must expose actions');
} else {
  pass('server_gate', 'action:write gated by RI_LAB_CONNECTED_WRITES_ENABLED');
}

const panels = readFileSync(join(lab, 'js/platform/connected-action-panels.js'), 'utf8');
if (!panels.includes("getConnectedEntityWorkflowEvents(getState(), 'action'")) {
  failTest('workflow', 'action detail needs entity workflow panel');
} else {
  pass('workflow', 'entity-scoped ACTION_* audit');
}

const views = readFileSync(join(lab, 'js/views.js'), 'utf8');
if (!views.includes('getViewAuthorisedUatActions') || !views.includes('renderConnectedActionCreateBanner')) {
  failTest('ui_list', 'Issues & Actions must show UAT section + create banner');
} else {
  pass('ui_list', 'operational vs authorised UAT registers');
}

const prov = readFileSync(join(platform, 'lib/ri/lab-api/action-lab-provenance.ts'), 'utf8');
if (!prov.includes('partitionActionsForLabScope')) {
  failTest('provenance', 'action lab partition');
} else {
  pass('provenance', 'UAT actions excluded from operational scope');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-action-compliance: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-action-compliance: FAIL (${fail})\n`);
  process.exit(1);
}
