#!/usr/bin/env node
import assert from 'node:assert/strict';
import { assessSourceIngestionEligibility } from '../../lib/ri/ingestion/eligibility.mjs';

const prev = { ...process.env };
process.env.FORGENIQ_ENV = 'staging';
process.env.FORGENIQ_INGEST_ENV = 'staging';
delete process.env.FORGENIQ_PHASE84_LIVE_VALIDATION;

const scheduledNoSuccess = assessSourceIngestionEligibility(
  'SRC-ICO-GUIDANCE',
  { ingestionMode: 'ENABLED', monitoringEnabled: true, lastSuccessAt: null },
  { triggerType: 'SCHEDULED', allowPhase84ManualCoverageBypass: true },
);
assert.equal(scheduledNoSuccess.eligible, false);
assert.match(scheduledNoSuccess.reason, /scheduled_requires_prior|coverage_status/);

const scheduledWithSuccess = assessSourceIngestionEligibility(
  'SRC-ICO-GUIDANCE',
  {
    ingestionMode: 'ENABLED',
    monitoringEnabled: true,
    lastSuccessAt: '2026-10-29T00:00:00.000Z',
  },
  { triggerType: 'SCHEDULED', allowPhase84ManualCoverageBypass: false },
);
assert.equal(scheduledWithSuccess.eligible, true);

process.env.FORGENIQ_PHASE84_LIVE_VALIDATION = 'true';
const manualPhase84 = assessSourceIngestionEligibility(
  'SRC-ICO-GUIDANCE',
  { ingestionMode: 'TEST_ONLY', monitoringEnabled: false, lastSuccessAt: null },
  { triggerType: 'MANUAL', allowPhase84ManualCoverageBypass: true },
);
assert.equal(manualPhase84.eligible, true);

const scheduledWithPhase84Env = assessSourceIngestionEligibility(
  'SRC-ICO-GUIDANCE',
  { ingestionMode: 'ENABLED', monitoringEnabled: true, lastSuccessAt: null },
  { triggerType: 'SCHEDULED', allowPhase84ManualCoverageBypass: true },
);
assert.equal(scheduledWithPhase84Env.eligible, false);

Object.assign(process.env, prev);
console.log('phase84-eligibility-safety: PASS');
