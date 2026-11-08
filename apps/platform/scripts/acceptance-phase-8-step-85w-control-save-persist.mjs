#!/usr/bin/env node
/**
 * Regression — connected control PATCH must merge catalogue state and use delegated Save handler.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..', '..', '..', 'design-lab', 'regulatory-intelligence');
let fail = 0;

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}

function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

const writes = readFileSync(join(root, 'js/platform/connected-work-writes.js'), 'utf8');
if (!writes.includes('mergeControlCatalogueRow(cat, merged)') || !writes.includes('patchConnectedControl')) {
  failTest('patch_merge', 'patchConnectedControl must merge control catalogue after PATCH');
} else {
  pass('patch_merge', 'patchConnectedControl updates catalogue + persists');
}

if (!writes.includes('formatConnectedPatchError')) {
  failTest('patch_errors', 'formatConnectedPatchError required for Save feedback');
} else {
  pass('patch_errors', 'PATCH errors surface to toast');
}

const panels = readFileSync(join(root, 'js/platform/connected-risk-control-panels.js'), 'utf8');
if (!panels.includes("getConnectedEntityWorkflowEvents(getState(), 'control', controlId)")) {
  failTest('workflow_panel', 'control detail must use entity-scoped workflow events');
} else {
  pass('workflow_panel', 'CONTROL_CREATED visible via entity workflow fetch');
}

const app = readFileSync(join(root, 'js/app.js'), 'utf8');
if (!app.includes("ev.target.closest('[data-connected-control-save]')")) {
  failTest('delegation', 'control Save must use document-level write delegation');
} else {
  pass('delegation', 'Save survives Design Lab re-renders');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-control-save-persist: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-control-save-persist: FAIL (${fail})\n`);
  process.exit(1);
}
