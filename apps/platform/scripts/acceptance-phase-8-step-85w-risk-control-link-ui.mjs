#!/usr/bin/env node
/**
 * Regression — risk detail must expose risk_control linking UI (BUS-UAT-012).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..', '..', '..', 'design-lab', 'regulatory-intelligence');
let fail = 0;

const pass = (id, detail) => console.log(`PASS: ${id} — ${detail}`);
const failTest = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};

const panels = readFileSync(join(root, 'js/platform/connected-risk-control-panels.js'), 'utf8');
if (!panels.includes('renderConnectedRiskLinkPanel') || !panels.includes('data-link-type="risk_control"')) {
  failTest('risk_link_panel', 'renderConnectedRiskLinkPanel with risk_control button');
} else pass('risk_link_panel', 'Link control panel on risk detail');

const views = readFileSync(join(root, 'js/views.js'), 'utf8');
if (!views.includes('renderConnectedRiskLinkPanel(id)')) {
  failTest('risk_view', 'viewRisk must include link panel');
} else pass('risk_view', 'Connected risk detail wires link panel');

const app = readFileSync(join(root, 'js/app.js'), 'utf8');
if (!app.includes("linkType === 'risk_control'")) {
  failTest('delegation', 'link delegation must handle risk_control');
} else pass('delegation', 'risk_control uses control UUID target');

const writes = readFileSync(join(root, 'js/platform/connected-work-writes.js'), 'utf8');
if (!writes.includes('fetchConnectedRiskDetail(state, leftId)') || !linkTypeGuard(writes)) {
  failTest('refresh', 'post link must refresh risk detail cache');
} else pass('refresh', 'Linked controls refresh after risk_control');

function linkTypeGuard(src) {
  return src.includes("linkType === 'risk_control'") && src.includes('fetchConnectedControlDetail');
}

const api = readFileSync(
  join(__dir, '..', 'app', 'api', 'ri-lab', 'links', 'route.ts'),
  'utf8',
);
if (!api.includes("case 'risk_control':") || !api.includes('linkRiskControl')) {
  failTest('api', 'POST /api/ri-lab/links must support risk_control');
} else pass('api', 'Backend risk_control link type registered');

if (!fail) console.log('\nacceptance-phase-8-step-85w-risk-control-link-ui: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-risk-control-link-ui: FAIL (${fail})\n`);
  process.exit(1);
}
