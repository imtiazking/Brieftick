#!/usr/bin/env node
/**
 * Stage E preparation — bounded live eval contract (no API calls here).
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { V2_EVAL_BUDGET_USD } from '../lib/ri/reasoner/anthropic-eval-budget.mjs';
import { AI_DEV_ORG_ID } from './staging/staging-ai-technical-test-config.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(platformRoot, '..', '..', 'docs', 'eval', 'stage-e-bounded-eval-prep.json');

const plan = {
  capturedAt: new Date().toISOString(),
  programmeStatus: 'PREPARED_NOT_EXECUTED',
  programmePass: false,
  tenantScope: 'offline_eval_only_no_partner_uat_db_writes',
  organisationGuard: AI_DEV_ORG_ID,
  budgetUsd: V2_EVAL_BUDGET_USD,
  recommendedCommand:
    'node ./scripts/run-ask-ri-v2-eval-2c2.mjs --test-ids=EVAL-C-01,EVAL-D-02 --model=claude-haiku-5-5',
  stopConditions: ['budget_ceiling', 'RESUME_INCOMPATIBLE', 'OUTPUT_TRUNCATED'],
  prerequisites: ['Stage B programme sign-off', 'Stage C programme sign-off', 'Stage D regression artefact committed'],
  evidenceOutputs: 'docs/eval/runs/stage-e-bounded-*.json (sanitised)',
};

writeFileSync(out, JSON.stringify(plan, null, 2));
console.log(JSON.stringify(plan, null, 2));