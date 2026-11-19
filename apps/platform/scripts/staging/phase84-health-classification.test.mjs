#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  classifyPhase84Health,
  isHealthyPhase84Health,
  PHASE84_HEALTH,
} from '../../lib/ri/ingestion/source-monitoring/phase84-health-classification.mjs';

const cases = [
  {
    name: 'unchanged is healthy pass',
    input: { run: { status: 'COMPLETED', metrics: { discovered: 3, new: 0, updated: 0, unchanged: 3, failed: 0 } } },
    health: PHASE84_HEALTH.HEALTHY_UNCHANGED,
    pass: true,
  },
  {
    name: '403 probe is access restricted',
    input: { probe: { summaryStatus: 'ACCESS_RESTRICTED', summaryError: 'HTTP 403' } },
    health: PHASE84_HEALTH.ACCESS_RESTRICTED,
    pass: false,
  },
  {
    name: 'empty with parse proof',
    input: {
      run: { status: 'COMPLETED', metrics: { discovered: 0, new: 0, updated: 0, unchanged: 0, failed: 0 } },
      probe: { summaryStatus: 'LIVE_VERIFIED', pubCount: 0, httpStatus: 200, summaryError: 'empty feed' },
    },
    health: PHASE84_HEALTH.HEALTHY_EMPTY_CONFIRMED,
    pass: true,
  },
  {
    name: 'zero discovered without proof fails',
    input: { run: { status: 'COMPLETED', metrics: { discovered: 0, new: 0, updated: 0, unchanged: 0, failed: 0 } } },
    health: PHASE84_HEALTH.CONNECTOR_FAILURE,
    pass: false,
  },
];

for (const c of cases) {
  const r = classifyPhase84Health(c.input);
  assert.equal(r.health, c.health, c.name);
  assert.equal(r.validationPass, c.pass, c.name);
  assert.equal(isHealthyPhase84Health(r.health), c.pass, c.name);
}

console.log(`phase84-health-classification: ${cases.length} cases PASS`);
