#!/usr/bin/env node
/**
 * Regression: impact workflow transitions, no duplicate approval audit events.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertImpactActionAllowed,
  requiredStatusForImpactAction,
} from '../lib/ri/impact-workflow-guards.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

function expectTransitionBlocked(action, status) {
  try {
    assertImpactActionAllowed(action, status);
    failMsg(`${action} from ${status} should be blocked`);
  } catch {
    pass(`blocks ${action} from ${status}`);
  }
}

function expectTransitionAllowed(action, status, required) {
  try {
    assertImpactActionAllowed(action, status);
    const req = requiredStatusForImpactAction(action, status);
    if (req !== required) failMsg(`${action} from ${status} required status ${required}, got ${req}`);
    else pass(`allows ${action} from ${status}`);
  } catch (e) {
    failMsg(`${action} from ${status} should be allowed (${e.message})`);
  }
}

expectTransitionAllowed('submit', 'DRAFT', 'DRAFT');
expectTransitionAllowed('submit', 'IN_PROGRESS', 'IN_PROGRESS');
expectTransitionBlocked('submit', 'IN_REVIEW');
expectTransitionBlocked('submit', 'APPROVED');

expectTransitionAllowed('approve', 'IN_REVIEW', 'IN_REVIEW');
expectTransitionBlocked('approve', 'APPROVED');
expectTransitionBlocked('approve', 'DRAFT');
expectTransitionBlocked('reject', 'APPROVED');

const impactSrc = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'impact.ts'), 'utf8');
if (impactSrc.includes('pendingEvent') && impactSrc.includes('recordWorkflowEvent(supabase')) {
  const eventIdx = impactSrc.indexOf('if (pendingEvent)');
  const updateIdx = impactSrc.indexOf('let query = supabase');
  if (eventIdx > updateIdx) pass('workflow event recorded after successful status update');
  else failMsg('workflow event must be recorded after DB update');
} else failMsg('pending workflow event pattern');

if (impactSrc.includes(".eq('status', requiredCurrentStatus)")) {
  pass('optimistic status guard on workflow update');
} else failMsg('status guard on update query');

const pageSrc = readFileSync(
  join(platformRoot, 'app', 'ri', 'impact-assessments', '[id]', 'page.tsx'),
  'utf8',
);
if (pageSrc.includes('canDecideWorkflow') && pageSrc.includes("impact.status === 'IN_REVIEW'")) {
  pass('UI hides approve/reject unless IN_REVIEW');
} else failMsg('UI workflow button guards');

if (impactSrc.includes('assertImpactApproverSoD')) pass('SoD unchanged on approve');
else failMsg('SoD on approve');

if (fail > 0) {
  console.error(`\nImpact governance transitions: FAIL (${fail})\n`);
  process.exit(1);
}
console.log('\nImpact governance transitions: PASS\n');
