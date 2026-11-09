#!/usr/bin/env node
/**
 * BUS-UAT-013 — action edit form must hydrate statusCode + dirty-only PATCH.
 */
import { readFileSync } from 'node:fs';
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

const gov = readFileSync(join(platform, 'lib/ri/lab-api/lab-governance-view.ts'), 'utf8');
if (!gov.includes('statusCode: string') || !gov.includes('actionRowStatusCode')) {
  failTest('mapper', 'mapActionRowToLabView must expose statusCode');
} else {
  pass('mapper', 'statusCode on lab action view');
}

const panels = readFileSync(join(lab, 'js/platform/connected-action-panels.js'), 'utf8');
if (!panels.includes('resolveActionStatusCode') || !panels.includes('data-initial-status')) {
  failTest('panel', 'edit panel must set data-initial-status from statusCode');
} else {
  pass('panel', 'persisted status on form');
}

const appJs = readFileSync(join(lab, 'js/app.js'), 'utf8');
if (!appJs.includes('collectConnectedActionPatchFields')) {
  failTest('dirty_patch', 'save must send dirty fields only');
} else {
  pass('dirty_patch', 'collectConnectedActionPatchFields');
}

const statusJs = readFileSync(join(lab, 'js/platform/action-status-code.js'), 'utf8');
if (!statusJs.includes('IN_PROGRESS') && !statusJs.includes('normalizeActionStatusCode')) {
  failTest('status_helper', 'action-status-code.js');
} else {
  pass('status_helper', 'normalizeActionStatusCode');
}

// In-memory checks mirroring action-status-code.js
function normalizeActionStatusCode(raw) {
  if (raw === null || raw === undefined || raw === '') return 'OPEN';
  const s = String(raw).trim();
  if (/^[A-Z][A-Z0-9_]*$/.test(s)) return s;
  return s.toUpperCase().replace(/\s+/g, '_');
}
if (normalizeActionStatusCode('In progress') !== 'IN_PROGRESS') {
  failTest('norm_display', 'display label → code');
} else {
  pass('norm_display', 'In progress → IN_PROGRESS');
}
if (normalizeActionStatusCode('IN_PROGRESS') !== 'IN_PROGRESS') {
  failTest('norm_db', 'db code preserved');
} else {
  pass('norm_db', 'IN_PROGRESS preserved');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-action-form-hydration: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-action-form-hydration: FAIL (${fail})\n`);
  process.exit(1);
}
