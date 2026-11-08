#!/usr/bin/env node
/**
 * BUS-UAT-013 — static checks for action create idempotency + post-create refresh resilience.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const platform = join(dirname(fileURLToPath(import.meta.url)), '..');
const lab = join(platform, '..', '..', 'design-lab', 'regulatory-intelligence');
let fail = 0;

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}
function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

const idem = readFileSync(join(platform, 'lib/ri/lab-api/lab-action-idempotency.ts'), 'utf8');
const actionsRoute = readFileSync(join(platform, 'app/api/ri-lab/actions/route.ts'), 'utf8');
const riActions = readFileSync(join(platform, 'lib/ri/services/ri-actions.ts'), 'utf8');
const labWrite = readFileSync(join(platform, 'lib/ri/lab-api/lab-action-write.ts'), 'utf8');
const writes = readFileSync(join(lab, 'js/platform/connected-work-writes.js'), 'utf8');
const appJs = readFileSync(join(lab, 'js/app.js'), 'utf8');

if (!idem.includes('LAB_ACTION_CREATE_IDEMPOTENCY_KEY') || !idem.includes('findLabActionByCreateIdempotencyKey')) {
  failTest('server_idem', 'lab-action-idempotency module');
} else {
  pass('server_idem', 'metadata key + lookup');
}

if (!riActions.includes('replayed') || !riActions.includes('findLabActionByCreateIdempotencyKey')) {
  failTest('service_replay', 'createLabRiAction replay path');
} else {
  pass('service_replay', 'createLabRiAction returns replayed flag');
}

if (!actionsRoute.includes('idempotentReplay')) {
  failTest('route_replay', 'POST exposes idempotentReplay');
} else {
  pass('route_replay', '200 replay / 201 create');
}

if (!labWrite.includes('idempotency_key')) {
  failTest('parse_key', 'parseLabActionCreateBody accepts idempotency_key');
} else {
  pass('parse_key', 'client idempotency_key parsed');
}

if (!writes.includes('governance refresh failed after action create')) {
  failTest('gov_refresh', 'tenant-governance refresh must not fail create');
} else {
  pass('gov_refresh', 'governance refresh wrapped after action create');
}

if (!writes.includes('entity audit refresh failed after create')) {
  failTest('entity_refresh', 'entity workflow refresh must not fail create');
} else {
  pass('entity_refresh', 'entity audit refresh wrapped');
}

if (!appJs.includes('idempotency_key') || !appJs.includes('createIdempotencyKey')) {
  failTest('client_key', 'Design Lab sends stable idempotency_key');
} else {
  pass('client_key', 'panel-scoped idempotency key');
}

if (!appJs.includes('action.id')) {
  failTest('toast_id', 'success toast includes action id');
} else {
  pass('toast_id', 'Action created shows UUID');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-action-idempotency: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-action-idempotency: FAIL (${fail})\n`);
  process.exit(1);
}
