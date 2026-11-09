#!/usr/bin/env node
/**
 * BUS-UAT-015 — finding detail must not infinite-loop renderShell on cached schedule promises.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScheduledTask } from '../../../design-lab/regulatory-intelligence/js/platform/schedule-async.js';
import {
  resetConnectedDetailRouteLoads,
  runConnectedDetailLoadsIfNeeded,
} from '../../../design-lab/regulatory-intelligence/js/platform/detail-route-loader.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const lab = join(__dir, '..', '..', '..', 'design-lab', 'regulatory-intelligence');
let fail = 0;

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}

function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

let renderCount = 0;
function renderShell() {
  renderCount += 1;
}

for (let i = 0; i < 8; i++) {
  runScheduledTask(Promise.resolve({ cached: true }));
}
if (renderCount !== 0) {
  failTest('no_fulfilled_on_cache', `expected 0 renderShell callbacks, got ${renderCount}`);
} else {
  pass('no_fulfilled_on_cache', 'runScheduledTask without onFulfilled does not re-render');
}

renderCount = 0;
runScheduledTask(Promise.resolve(1), renderShell);
await Promise.resolve();
if (renderCount !== 1) {
  failTest('single_cache_hit', `expected 1 renderShell callback, got ${renderCount}`);
} else {
  pass('single_cache_hit', 'explicit onFulfilled runs once per schedule call');
}

resetConnectedDetailRouteLoads();
let scheduled = 0;
runConnectedDetailLoadsIfNeeded('/finding/abc', () => {
  scheduled += 1;
});
runConnectedDetailLoadsIfNeeded('/finding/abc', () => {
  scheduled += 1;
});
if (scheduled !== 1) failTest('route_once', `expected 1 schedule, got ${scheduled}`);
else pass('route_once', 'detail loads scheduled once per route');

resetConnectedDetailRouteLoads();
scheduled = 0;
runConnectedDetailLoadsIfNeeded('/finding/abc', () => {
  scheduled += 1;
});
runConnectedDetailLoadsIfNeeded('/finding/def', () => {
  scheduled += 1;
});
if (scheduled !== 2) failTest('route_change', `expected 2 schedules for two routes, got ${scheduled}`);
else pass('route_change', 'route change re-enables scheduling');

const appJs = readFileSync(join(lab, 'js/app.js'), 'utf8');
if (!appJs.includes('runConnectedDetailLoadsIfNeeded') || !appJs.includes('resetConnectedDetailRouteLoads')) {
  failTest('app_wiring', 'app must use detail-route-loader on hashchange');
} else {
  pass('app_wiring', 'detail-route-loader wired');
}
if (appJs.includes("scheduleConnectedFindingDetailFetch(getState(), findingId),\n      () => renderShell()")) {
  failTest('finding_render_loop', 'finding detail must not chain renderShell on schedule fulfillment');
} else {
  pass('finding_render_loop', 'finding schedules omit renderShell on fulfilled');
}

const assurance = readFileSync(join(lab, 'js/assurance-views.js'), 'utf8');
if (!assurance.includes('viewFindingInner') || !assurance.includes('Finding detail error')) {
  failTest('view_boundary', 'viewFinding needs local error boundary');
} else {
  pass('view_boundary', 'viewFinding error boundary');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-finding-detail-render-loop: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-finding-detail-render-loop: FAIL (${fail})\n`);
  process.exit(1);
}
