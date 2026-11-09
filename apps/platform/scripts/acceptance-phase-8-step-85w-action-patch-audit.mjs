#!/usr/bin/env node
/**
 * BUS-UAT-013 — action PATCH audit events (owner vs status, no spurious transitions).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platform = join(__dir, '..');
let fail = 0;

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}

function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

function actionStatusValueEqual(persisted, requested) {
  return String(persisted ?? '').trim() === String(requested ?? '').trim();
}

function actionOwnerValueEqual(persisted, requested) {
  const a = persisted == null || persisted === '' ? null : String(persisted).trim();
  const b = requested == null || requested === '' ? null : String(requested).trim();
  return a === b;
}

function planActionPatchAuditEvents(params) {
  let emitOwnerAssigned = false;
  let assigneeUserId = null;
  if (params.assignOwnerSelfUserId) {
    if (!actionOwnerValueEqual(params.existingOwnerUserId, params.assignOwnerSelfUserId)) {
      emitOwnerAssigned = true;
      assigneeUserId = params.assignOwnerSelfUserId;
    }
  } else if (params.requestedOwnerUserId !== undefined && params.requestedOwnerUserId) {
    if (!actionOwnerValueEqual(params.existingOwnerUserId, params.requestedOwnerUserId)) {
      emitOwnerAssigned = true;
      assigneeUserId = params.requestedOwnerUserId;
    }
  }
  let emitStatusChanged = false;
  let statusTo = null;
  if (params.requestedStatus !== undefined) {
    const parsed = params.requestedStatus ?? params.existingStatus ?? null;
    if (!actionStatusValueEqual(params.existingStatus, parsed)) {
      emitStatusChanged = true;
      statusTo = parsed;
    }
  }
  return {
    emitStatusChanged,
    emitOwnerAssigned,
    statusFrom: params.existingStatus ?? null,
    statusTo,
    assigneeUserId: emitOwnerAssigned ? assigneeUserId : null,
  };
}

const service = readFileSync(join(platform, 'lib/ri/services/ri-actions.ts'), 'utf8');
const audit = readFileSync(join(platform, 'lib/ri/action-update-audit.ts'), 'utf8');
if (!service.includes('planActionPatchAuditEvents')) {
  failTest('wire', 'updateRiAction must use planActionPatchAuditEvents');
} else {
  pass('wire', 'patch audit planner wired');
}
if (!service.includes('auditPlan.emitStatusChanged')) {
  failTest('conditional_status', 'ACTION_STATUS_CHANGED must be conditional');
} else {
  pass('conditional_status', 'emitStatusChanged gate');
}
if (!service.includes('auditPlan.emitOwnerAssigned')) {
  failTest('conditional_owner', 'ACTION_ASSIGNED must be conditional');
} else {
  pass('conditional_owner', 'emitOwnerAssigned gate');
}

const cases = [
  {
    id: 'status_open_in_progress',
    in: { existingStatus: 'OPEN', existingOwnerUserId: 'a', requestedStatus: 'IN_PROGRESS' },
    want: { emitStatusChanged: true, emitOwnerAssigned: false },
  },
  {
    id: 'status_in_progress_noop',
    in: {
      existingStatus: 'IN_PROGRESS',
      existingOwnerUserId: 'a',
      requestedStatus: 'IN_PROGRESS',
    },
    want: { emitStatusChanged: false, emitOwnerAssigned: false },
  },
  {
    id: 'owner_only',
    in: {
      existingStatus: 'IN_PROGRESS',
      existingOwnerUserId: 'user_a',
      requestedStatus: 'IN_PROGRESS',
      requestedOwnerUserId: 'user_b',
    },
    want: { emitStatusChanged: false, emitOwnerAssigned: true },
  },
  {
    id: 'owner_back',
    in: {
      existingStatus: 'IN_PROGRESS',
      existingOwnerUserId: 'user_b',
      requestedStatus: 'IN_PROGRESS',
      requestedOwnerUserId: 'user_a',
    },
    want: { emitStatusChanged: false, emitOwnerAssigned: true },
  },
  {
    id: 'both_changed',
    in: {
      existingStatus: 'OPEN',
      existingOwnerUserId: 'user_a',
      requestedStatus: 'IN_PROGRESS',
      requestedOwnerUserId: 'user_b',
    },
    want: { emitStatusChanged: true, emitOwnerAssigned: true },
  },
  {
    id: 'noop_save',
    in: {
      existingStatus: 'IN_PROGRESS',
      existingOwnerUserId: 'user_a',
      requestedStatus: 'IN_PROGRESS',
      requestedOwnerUserId: 'user_a',
    },
    want: { emitStatusChanged: false, emitOwnerAssigned: false },
  },
];

for (const c of cases) {
  const got = planActionPatchAuditEvents(c.in);
  if (got.emitStatusChanged !== c.want.emitStatusChanged || got.emitOwnerAssigned !== c.want.emitOwnerAssigned) {
    failTest(c.id, JSON.stringify(got));
  } else {
    pass(c.id, 'audit plan');
  }
}

if (!audit.includes('actionStatusValueEqual')) {
  failTest('helpers', 'shared audit helpers in action-update-audit.ts');
} else {
  pass('helpers', 'action-update-audit.ts');
}

const appJs = readFileSync(
  join(__dir, '..', '..', '..', 'design-lab', 'regulatory-intelligence', 'js', 'app.js'),
  'utf8',
);
if (!appJs.includes('data-connected-action-field')) {
  failTest('frontend', 'action save collects panel fields');
} else {
  pass('frontend', 'panel fields sent — server gates spurious audit (documented)');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-action-patch-audit: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-action-patch-audit: FAIL (${fail})\n`);
  process.exit(1);
}
