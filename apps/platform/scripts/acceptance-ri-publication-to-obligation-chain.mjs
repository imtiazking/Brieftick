#!/usr/bin/env node
/**
 * Publication → obligation chain gates (offline, pure functions; no DB, no network, no AI).
 */
import {
  assessApplicabilityGate,
  assessObligationExtractionTarget,
  obligationCandidateSkipReason,
  OBLIGATION_CHAIN_ERRORS as E,
  OBLIGATION_SKIP_REASONS as S,
} from '../lib/ri/ai/obligation-chain-gates.mjs';
import { assessAiObligationTransition } from '../lib/ri/ai/ai-obligation-workflow.mjs';

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`PASS: ${label}`);
  else {
    failures += 1;
    console.error(`FAIL: ${label} — expected ${e}, got ${a}`);
  }
}

const PUB = 'pub-1';
check('UC-RI-005 without parent change is refused before execution',
  assessObligationExtractionTarget({ targetChangeId: null, change: null, publicationId: PUB }),
  { ok: false, code: E.PARENT_CHANGE_REQUIRED });
check('parent change not visible in organisation is refused',
  assessObligationExtractionTarget({ targetChangeId: 'c1', change: null, publicationId: PUB }),
  { ok: false, code: E.PARENT_CHANGE_NOT_FOUND });
check('parent change from another publication is refused',
  assessObligationExtractionTarget({ targetChangeId: 'c1', change: { id: 'c1', publication_id: 'pub-2' }, publicationId: PUB }),
  { ok: false, code: E.PARENT_CHANGE_PUBLICATION_MISMATCH });
check('parent change of same publication is accepted',
  assessObligationExtractionTarget({ targetChangeId: 'c1', change: { id: 'c1', publication_id: PUB }, publicationId: PUB }),
  { ok: true });

check('no applicability assessment → refused', assessApplicabilityGate(null), { ok: false, code: E.APPLICABILITY_NOT_ASSESSED });
check('applicability DRAFT → refused', assessApplicabilityGate({ status: 'DRAFT', recommendation: 'APPLICABLE' }), { ok: false, code: E.APPLICABILITY_NOT_APPROVED });
check('applicability IN_REVIEW → refused', assessApplicabilityGate({ status: 'IN_REVIEW', recommendation: 'APPLICABLE' }), { ok: false, code: E.APPLICABILITY_NOT_APPROVED });
check('approved NOT_APPLICABLE → refused', assessApplicabilityGate({ status: 'APPROVED', recommendation: 'NOT_APPLICABLE' }), { ok: false, code: E.PUBLICATION_NOT_APPLICABLE });
check('approved APPLICABLE → allowed', assessApplicabilityGate({ status: 'APPROVED', recommendation: 'APPLICABLE' }), { ok: true });
check('approved POSSIBLY_APPLICABLE → allowed', assessApplicabilityGate({ status: 'APPROVED', recommendation: 'POSSIBLY_APPLICABLE' }), { ok: true });

const good = { citation: { citation_status: 'VERIFIED' }, statement: 'Firms must…', changeId: 'c1', changeInOrg: true };
check('verified citation + statement + change → materialisable', obligationCandidateSkipReason(good), null);
check('PARTIAL citation → materialisable', obligationCandidateSkipReason({ ...good, citation: { citation_status: 'PARTIAL' } }), null);
check('no citation row (pre-14-Nov Anthropic runs) → no_citation_record', obligationCandidateSkipReason({ ...good, citation: null }), S.NO_CITATION);
check('INVALID citation → citation_not_verified', obligationCandidateSkipReason({ ...good, citation: { citation_status: 'INVALID' } }), S.CITATION_NOT_VERIFIED);
check('UNVERIFIED citation → citation_not_verified', obligationCandidateSkipReason({ ...good, citation: { citation_status: 'UNVERIFIED' } }), S.CITATION_NOT_VERIFIED);
check('missing statement → candidate_missing_statement', obligationCandidateSkipReason({ ...good, statement: '' }), S.NO_STATEMENT);
check('no parent change (18-Nov AI Dev run) → no_parent_change', obligationCandidateSkipReason({ ...good, changeId: null }), S.NO_PARENT_CHANGE);
check('parent change in other org → parent_change_not_in_organisation', obligationCandidateSkipReason({ ...good, changeInOrg: false }), S.PARENT_CHANGE_NOT_IN_ORG);

const REQ = 'user_requester';
const ACC = 'user_acceptor';
const SUB = 'user_submitter';
const CHK = 'user_checker';
const base = { requestedByUserId: REQ, acceptedByUserId: ACC, submittedByUserId: SUB };
check('AI DRAFT → OPEN directly is blocked',
  assessAiObligationTransition({ ...base, from: 'DRAFT', to: 'OPEN', actorUserId: CHK, actorCanReview: true }),
  { ok: false, code: 'ai_obligation_invalid_transition' });
check('AI DRAFT → COMPLETE is blocked',
  assessAiObligationTransition({ ...base, from: 'DRAFT', to: 'COMPLETE', actorUserId: CHK, actorCanReview: true }),
  { ok: false, code: 'ai_obligation_invalid_transition' });
check('AI DRAFT → IN_REVIEW by acceptor allowed',
  assessAiObligationTransition({ ...base, from: 'DRAFT', to: 'IN_REVIEW', actorUserId: ACC, actorCanReview: false }),
  { ok: true });
check('AI IN_REVIEW → OPEN without review role blocked',
  assessAiObligationTransition({ ...base, from: 'IN_REVIEW', to: 'OPEN', actorUserId: CHK, actorCanReview: false }),
  { ok: false, code: 'ai_obligation_review_role_required' });
for (const [who, id] of [['AI run requester', REQ], ['AI output acceptor', ACC], ['submitter', SUB]]) {
  check(`AI IN_REVIEW → OPEN by ${who} blocked (maker-checker)`,
    assessAiObligationTransition({ ...base, from: 'IN_REVIEW', to: 'OPEN', actorUserId: id, actorCanReview: true }),
    { ok: false, code: 'segregation_of_duties' });
}
check('AI IN_REVIEW → OPEN by independent reviewer allowed',
  assessAiObligationTransition({ ...base, from: 'IN_REVIEW', to: 'OPEN', actorUserId: CHK, actorCanReview: true }),
  { ok: true });
check('AI IN_REVIEW → DRAFT (return) allowed',
  assessAiObligationTransition({ ...base, from: 'IN_REVIEW', to: 'DRAFT', actorUserId: ACC, actorCanReview: false }),
  { ok: true });
check('AI OPEN → IN_PROGRESS uses existing register lifecycle',
  assessAiObligationTransition({ ...base, from: 'OPEN', to: 'IN_PROGRESS', actorUserId: ACC, actorCanReview: false }),
  { ok: true });

if (failures) {
  console.error(`\npublication-to-obligation chain: ${failures} FAILED`);
  process.exit(1);
}
console.log('\npublication-to-obligation chain: ALL PASS');
