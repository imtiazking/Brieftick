#!/usr/bin/env node
/**
 * Human verification and approval status indicators for Design Lab triage.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyFindingDecisionProvenance,
  countVerificationWithProvenance,
} from '../lib/ri/triage/finding-decision-provenance.mjs';
import {
  APPROVAL_STATUS,
  HUMAN_VERIFICATION,
  countApprovalStatus,
  deriveApprovalStatus,
  deriveHumanVerification,
  triageRowActionKind,
} from '../lib/ri/triage/triage-verification-status.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lab = join(root, 'design-lab', 'regulatory-intelligence', 'js');
const failures = [];
const check = (name, ok) => {
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const triage = readFileSync(join(lab, 'platform', 'connected-triage.js'), 'utf8');
const service = readFileSync(join(root, 'apps', 'platform', 'lib', 'ri', 'services', 'triage-queues.ts'), 'utf8');

check('unverified when no decision', deriveHumanVerification({ provisional: false, queueName: 'OBLIGATION_TRIAGE' }) === HUMAN_VERIFICATION.UNVERIFIED);
check(
  'verified only with persisted acceptance',
  deriveHumanVerification({
    recorded: { decision: 'ACCEPTED', reviewer_user_id: 'user_x', analysis_review_id: 'rev' },
  }) === HUMAN_VERIFICATION.VERIFIED,
);
check(
  'AI acceptance shape without reviewer stays unverified',
  deriveHumanVerification({ recorded: { decision: 'ACCEPTED' } }) === HUMAN_VERIFICATION.UNVERIFIED,
);
check(
  'rejected decision',
  deriveHumanVerification({ recorded: { decision: 'REJECTED', reviewer_user_id: 'u', analysis_review_id: 'r' } }) ===
    HUMAN_VERIFICATION.REJECTED,
);
check(
  'exception queue without decision needs review',
  deriveHumanVerification({ queueName: 'EXCEPTION_TRIAGE' }) === HUMAN_VERIFICATION.NEEDS_REVIEW,
);
check(
  'source version change triggers re-verification',
  deriveHumanVerification({
    recorded: { decision: 'ACCEPTED', reviewer_user_id: 'u', analysis_review_id: 'r' },
    reVerificationRequired: true,
  }) === HUMAN_VERIFICATION.RE_VERIFICATION_REQUIRED,
);
check('approval none without obligation', deriveApprovalStatus(null) === APPROVAL_STATUS.NONE);
check('approval draft', deriveApprovalStatus('DRAFT') === APPROVAL_STATUS.DRAFT);
check('approval awaiting', deriveApprovalStatus('IN_REVIEW') === APPROVAL_STATUS.AWAITING_APPROVAL);
check('approval approved register', deriveApprovalStatus('OPEN') === APPROVAL_STATUS.APPROVED);
check(
  'UAT pathway not genuine verification',
  classifyFindingDecisionProvenance(
    { decision: 'ACCEPTED', evidence_pathway: 'human_verified_uat', reviewer_user_id: 'u', analysis_review_id: 'r' },
    { stagingTenant: true },
  ).countsAsGenuineHumanVerification === false,
);
check(
  'provenance-aware counts split UAT verified',
  countVerificationWithProvenance([
    {
      humanVerification: 'VERIFIED',
      decisionProvenance: classifyFindingDecisionProvenance(
        { decision: 'ACCEPTED', evidence_pathway: 'human_verified_uat', reviewer_user_id: 'u', analysis_review_id: 'r' },
        { stagingTenant: true },
      ),
    },
  ]).VERIFIED_UAT === 1,
);
check(
  'approval counts',
  countApprovalStatus([{ approvalStatus: 'DRAFT' }, { approvalStatus: 'APPROVED' }]).APPROVED === 1,
);
check('verify action for unverified', triageRowActionKind(HUMAN_VERIFICATION.UNVERIFIED, {}) === 'VERIFY');
check('view verification action', triageRowActionKind(HUMAN_VERIFICATION.VERIFIED, {}) === 'VIEW_VERIFICATION');

check('triage API derives humanVerification', service.includes('deriveHumanVerification'));
check('triage API derives approvalStatus', service.includes('deriveApprovalStatus'));
check('triage API returns verificationCounts', service.includes('verificationCounts'));
check('triage API keeps legallyVerified false', service.includes('legallyVerified: false'));
check('verified obligations table columns', triage.includes('Human verification') && triage.includes('Approval'));
check('verification filters', triage.includes('data-triage-verification-filter'));
check('approval filters on obligation triage', triage.includes('data-triage-approval-filter'));
check('verification badges labelled', triage.includes('UNVERIFIED') && triage.includes('aria-label'));
check('view verification dialog', triage.includes('data-triage-view-verification'));
check('manual five decision actions', triage.includes('data-triage-review-mode="verify-obligation"') && triage.includes('not-applicable'));
check('UAT provenance filter', triage.includes('UAT_TEST'));
check('verify does not infer from obligation alone', !triage.includes('legallyVerified: true'));

if (failures.length) {
  console.error(`acceptance-ri-triage-verification-status: FAIL (${failures.length})`);
  process.exit(1);
}
console.log('acceptance-ri-triage-verification-status: PASS');