#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countVerificationPresentation } from '../lib/ri/triage/verification-presentation.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const failures = [];
const check = (name, ok) => {
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const migration = readFileSync(
  join(root, 'apps', 'platform', 'supabase', 'migrations', '20261124130500_ri_finding_reassessment.sql'),
  'utf8',
);
const service = readFileSync(join(root, 'apps', 'platform', 'lib', 'ri', 'services', 'ai-finding-review.ts'), 'utf8');
const triage = readFileSync(join(root, 'design-lab', 'regulatory-intelligence', 'js', 'platform', 'connected-triage.js'), 'utf8');

check('reassessment migration defines table', migration.includes('ai_analysis_finding_reassessments'));
check('reassessment RPC exists', migration.includes('ri_reassess_ai_finding'));
check('submitFindingReassessment exported', service.includes('submitFindingReassessment'));
check('triage exposes presentation counts', readFileSync(join(root, 'apps', 'platform', 'lib', 'ri', 'services', 'triage-queues.ts'), 'utf8').includes('presentationCounts'));
check('UI blocks reassess when obligation approved', triage.includes('obligationApprovalLocked'));
check(
  'presentation counts awaiting first review',
  countVerificationPresentation([{ hasPersistedDecision: false, humanVerification: 'NEEDS_REVIEW' }]).AWAITING_FIRST_REVIEW === 1,
);

if (failures.length) {
  console.error(`acceptance-ri-finding-reassessment: FAIL (${failures.length})`);
  process.exit(1);
}
console.log('acceptance-ri-finding-reassessment: PASS');