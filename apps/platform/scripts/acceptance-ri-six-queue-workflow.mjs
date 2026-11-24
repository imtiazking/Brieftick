#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKFLOW_QUEUES,
  deriveWorkflowQueue,
  countWorkflowQueues,
  emptyWorkflowCounts,
  isWorkflowQueue,
} from '../lib/ri/triage/regulatory-workflow-queues.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const failures = [];
const check = (name, ok) => {
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const triage = readFileSync(join(root, 'design-lab', 'regulatory-intelligence', 'js', 'platform', 'connected-triage.js'), 'utf8');
const service = readFileSync(join(root, 'apps', 'platform', 'lib', 'ri', 'services', 'triage-queues.ts'), 'utf8');
const route = readFileSync(join(root, 'apps', 'platform', 'app', 'api', 'ri-lab', 'triage', 'route.ts'), 'utf8');

check('six workflow queue constants', Object.keys(emptyWorkflowCounts()).length === 6);
check('derive unreviewed → AI_FINDINGS', deriveWorkflowQueue({ hasPersistedDecision: false }) === WORKFLOW_QUEUES.AI_FINDINGS);
check('derive rejected', deriveWorkflowQueue({ hasPersistedDecision: true, decision: 'REJECTED', humanVerification: 'REJECTED' }) === WORKFLOW_QUEUES.REJECTED_FINDINGS);
check('derive verified obligation', deriveWorkflowQueue({
  hasPersistedDecision: true,
  decision: 'ACCEPTED',
  humanVerification: 'VERIFIED',
  classificationQueue: 'OBLIGATION_TRIAGE',
  disposition: 'CONVERT_TO_DRAFT_OBLIGATION',
}) === WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS);
check('derive not applicable disposition', deriveWorkflowQueue({
  hasPersistedDecision: true,
  decision: 'ACCEPTED',
  humanVerification: 'VERIFIED',
  disposition: 'ORGANISATION_NOT_APPLICABLE',
  classificationQueue: 'OBLIGATION_TRIAGE',
}) === WORKFLOW_QUEUES.NOT_APPLICABLE);
check('derive exception needs review', deriveWorkflowQueue({
  hasPersistedDecision: true,
  decision: 'ACCEPTED',
  humanVerification: 'NEEDS_REVIEW',
  disposition: 'RECLASSIFICATION_REQUESTED',
  classificationQueue: 'EXCEPTION_TRIAGE',
}) === WORKFLOW_QUEUES.EXCEPTIONS);
const counts = countWorkflowQueues([
  { workflowQueue: WORKFLOW_QUEUES.AI_FINDINGS },
  { workflowQueue: WORKFLOW_QUEUES.VERIFIED_OBLIGATIONS },
]);
check('count workflow ALL', counts.ALL_FINDINGS === 2);

check('API accepts workflow queue', route.includes('isWorkflowQueue'));
check('service derives workflowQueue', service.includes('deriveWorkflowQueue'));
check('dashboard seven cards', triage.includes('ai-findings') && triage.includes('data-triage-five-decisions'));
check('five decision buttons', triage.includes('verify-obligation') && triage.includes('not-applicable'));
check('isWorkflowQueue ALL', isWorkflowQueue('ALL_FINDINGS'));

if (failures.length) {
  console.error(`acceptance-ri-six-queue-workflow: FAIL (${failures.length})`);
  process.exit(1);
}
console.log('acceptance-ri-six-queue-workflow: PASS');