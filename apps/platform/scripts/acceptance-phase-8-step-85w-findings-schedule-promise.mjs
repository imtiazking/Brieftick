#!/usr/bin/env node
/**
 * BUS-UAT-015 — schedule* Promise contract (regression for .then is not a function).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPromiseLike, runScheduledTask } from '../../../design-lab/regulatory-intelligence/js/platform/schedule-async.js';

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

function nullSchedule() {
  return null;
}

function promiseSchedule(value) {
  return Promise.resolve(value);
}

try {
  (nullSchedule()?.then(() => {})).catch(() => {});
  failTest('null_optional_catch', 'expected null?.then().catch() to throw');
} catch (err) {
  if (String(err?.message || err).includes('catch') || String(err?.message || err).includes('then')) {
    pass('null_optional_catch', 'reproduces unsafe optional-chain + catch failure');
  } else {
    failTest('null_optional_catch', `unexpected error: ${err?.message || err}`);
  }
}

try {
  ({ then: 1 })?.then(() => {});
  failTest('bad_thenable', 'expected non-callable then to throw');
} catch (err) {
  if (String(err?.message || err).includes('then is not a function')) {
    pass('bad_thenable', 'matches DevTools TypeError for corrupted inflight slots');
  } else {
    failTest('bad_thenable', `unexpected error: ${err?.message || err}`);
  }
}

let runOk = false;
runScheduledTask(nullSchedule(), () => {
  runOk = true;
});
if (runOk) failTest('run_null', 'runScheduledTask must not invoke onFulfilled for null');
else pass('run_null', 'null schedule is ignored safely');

await runScheduledTask(promiseSchedule(42), (v) => {
  if (v !== 42) throw new Error('wrong_value');
});
pass('run_promise', 'Promise schedule chains correctly');

if (!isPromiseLike(promiseSchedule())) failTest('is_promise', 'Promise.resolve must be promise-like');
else pass('is_promise', 'isPromiseLike');

const audit = readFileSync(join(lab, 'js/platform/connected-entity-audit.js'), 'utf8');
if (!audit.includes('return Promise.resolve(cat.entityWorkflowEventsByKey')) {
  failTest('workflow_cache_promise', 'cached workflow fetch must return Promise.resolve');
} else {
  pass('workflow_cache_promise', 'workflow cache returns Promise');
}

const appJs = readFileSync(join(lab, 'js/app.js'), 'utf8');
if (appJs.includes("scheduleConnectedEntityWorkflowEventsFetch(getState(), 'finding', findingId)\n      ?.then")) {
  failTest('app_finding_unsafe', 'finding workflow must not use ?.then().catch()');
} else if (!appJs.includes('runScheduledTask') || !appJs.includes('scheduleConnectedEntityWorkflowEventsFetch')) {
  failTest('app_run_scheduled', 'app.js must use runScheduledTask for workflow schedule');
} else {
  pass('app_finding_safe', 'runScheduledTask wraps finding workflow + detail');
}

const session = readFileSync(join(lab, 'js/platform/ask-ri-session.mjs'), 'utf8');
if (!session.includes('delete cat._entityAuditInflight')) {
  failTest('persist_inflight', 'must not persist _entityAuditInflight');
} else {
  pass('persist_inflight', 'inflight stripped before persistence');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-findings-schedule-promise: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-findings-schedule-promise: FAIL (${fail})\n`);
  process.exit(1);
}
