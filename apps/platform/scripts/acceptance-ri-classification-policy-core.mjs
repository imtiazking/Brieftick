#!/usr/bin/env node
/**
 * Offline: FCA classification policy v1, legal guardrails on policy configuration, triage routing and
 * conversion eligibility (lib/ri/classification/regulatory-classification-policy.mjs) and the per-finding
 * payload validation that uses them (lib/ri/ai/finding-review-core.mjs). No network, no database.
 */
import {
  CANONICAL_CLASSIFICATION_CODES,
  DISPOSITIONS,
  FCA_POLICY_V1,
  QUEUE_ACTIONS,
  TRIAGE_QUEUES,
  conversionRefusal,
  evaluateFindingTriage,
  modelLabelsForFinding,
  obligationLegalCategory,
  validateClassificationPolicy,
} from '../lib/ri/classification/regulatory-classification-policy.mjs';
import { buildFindingsView, sha256Hex, validateFindingDecisions } from '../lib/ri/ai/finding-review-core.mjs';

let passes = 0;
let failures = 0;
const check = (cond, msg, detail) => {
  if (cond) {
    passes += 1;
    console.log(`PASS: ${msg}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${msg}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
};
const clone = (v) => JSON.parse(JSON.stringify(v));
const { OBLIGATION: A, NON_OBLIGATION: B, EXCEPTION: X } = TRIAGE_QUEUES;

// 1. FCA v1 matches the required table.
const expected = {
  R: true, E: true, D: true, P: true, UK: true, EU: true, TS: true,
  G: false, C: false, GBR: false, REC: false, NBE: false, CONS: false, PERM: false, DEF: false,
  EXEMPT: false, SH: false, GP: false, EXPL: false, REPEALED: false, UNKNOWN: false,
};
const policy = FCA_POLICY_V1;
check(policy.regulatorKey === 'REG-FCA' && policy.policyVersion === 1, 'FCA is the first configured regulator (policy v1)');
check(policy.entries.length === Object.keys(expected).length, '21 FCA classification entries', policy.entries.length);
for (const [code, enabled] of Object.entries(expected)) {
  const e = policy.entries.find((x) => x.code === code);
  check(e && e.conversionEnabled === enabled && e.humanReviewRequired === true, `FCA ${code}: conversion ${enabled ? 'YES' : 'NO'}, human review required`, e);
}
check(policy.entries.find((e) => e.code === 'E').supportingObligationLinkRequired === true && policy.entries.find((e) => e.code === 'E').legalStatus === 'evidential', 'E keeps evidential status and requires a supporting binding link');
check(policy.entries.find((e) => e.code === 'UNKNOWN').destinationQueue === X, 'UNKNOWN routes to Exception Triage');
check(policy.entries.filter((e) => e.conversionEnabled).every((e) => e.destinationQueue === A), 'every YES code routes to Obligation Triage');
check(policy.entries.filter((e) => !e.conversionEnabled && e.code !== 'UNKNOWN').every((e) => e.destinationQueue === B), 'every NO code routes to Non-Obligation Triage');
check(validateClassificationPolicy(policy).length === 0, 'FCA v1 passes mandatory legal validation', validateClassificationPolicy(policy));

// 2. Configuration cannot bypass legal validation.
const tamper = (fn) => {
  const p = clone(policy);
  fn(p);
  return validateClassificationPolicy(p);
};
check(tamper((p) => Object.assign(p.entries.find((e) => e.code === 'G'), { conversionEnabled: true, destinationQueue: A })).includes('conversion_not_permitted:G'), 'enabling conversion for Guidance (G) is refused');
check(tamper((p) => Object.assign(p.entries.find((e) => e.code === 'GBR'), { legalStatus: 'binding', conversionEnabled: true, destinationQueue: A })).includes('legal_status_fixed:GBR'), 'relabelling guidance on binding requirements as binding is refused');
check(tamper((p) => Object.assign(p.entries.find((e) => e.code === 'UNKNOWN'), { destinationQueue: B })).includes('unknown_must_route_to_exception'), 'UNKNOWN cannot leave Exception Triage');
check(tamper((p) => Object.assign(p.entries.find((e) => e.code === 'E'), { supportingObligationLinkRequired: false })).includes('supporting_link_required:E'), 'E cannot drop the supporting obligation link');
check(tamper((p) => Object.assign(p.entries.find((e) => e.code === 'R'), { humanReviewRequired: false })).includes('human_review_required:R'), 'human review cannot be switched off for a convertible code');
check(tamper((p) => { p.nonBindingPublicationTypes = p.nonBindingPublicationTypes.filter((t) => t !== 'finalised_guidance'); }).includes('non_binding_publication_type_required:finalised_guidance'), 'finalised guidance cannot be removed from non-binding sources');
check(tamper((p) => { p.entries = p.entries.filter((e) => e.code !== 'UNKNOWN'); }).includes('unknown_entry_required'), 'a policy must define UNKNOWN');
check(tamper((p) => p.entries.push({ ...p.entries[0], code: 'X1' })).includes('code_not_canonical:X1'), 'non-canonical codes refused');
check(tamper((p) => Object.assign(p.entries.find((e) => e.code === 'R'), { conversionEnabled: false, destinationQueue: B })).length === 0, 'a policy may switch conversion OFF for a binding code (more conservative)');
check(Object.values(CANONICAL_CLASSIFICATION_CODES).filter((c) => ['binding', 'evidential'].includes(c.legalStatus)).length === 7, 'only the 7 binding/evidential codes can ever convert');

// 3. Triage routing.
const verified = { citationStatus: 'VERIFIED', modelLabels: ['binding_requirement'] };
const evidence = { legalBasis: 'COBS 2.1.1R', quotation: 'A firm must act honestly, fairly and professionally.', quotationPage: 3 };
const route = (finding, proposal, publicationType = 'policy_statement') => evaluateFindingTriage({ policy, publicationType, finding, proposal });

let t = route(verified, { code: 'R', ...evidence });
check(t.queue === A && t.conversionEligible && t.legalStatus === 'binding', 'verified R with evidence → Obligation Triage, eligible', t);
check(JSON.stringify(t.allowedActions) === JSON.stringify(QUEUE_ACTIONS[A]) && t.allowedActions.includes(DISPOSITIONS.CONVERT), 'Queue A actions include convert, link, reclassify and reject');
for (const code of ['G', 'GBR', 'PERM', 'DEF', 'EXEMPT', 'SH', 'GP', 'EXPL', 'REPEALED', 'CONS', 'REC', 'NBE', 'C']) {
  t = route(verified, { code, ...evidence });
  check(t.queue === B && !t.conversionEligible && !t.allowedActions.includes(DISPOSITIONS.CONVERT), `${code} → Non-Obligation Triage, standalone conversion prohibited`, t);
}
t = route(verified, { code: 'UNKNOWN', ...evidence });
check(t.queue === X && t.exceptionReasons.includes('unknown_classification') && !t.conversionEligible, 'UNKNOWN → Exception Triage, blocked');
t = route({ ...verified, citationStatus: 'UNVERIFIED' }, { code: 'R', ...evidence });
check(t.queue === X && t.exceptionReasons.includes('unverified_citation'), 'unverified citation → Exception Triage');
t = route(verified, { code: 'R', ...evidence, legalBasis: '' });
check(t.queue === X && t.exceptionReasons.includes('missing_legal_basis'), 'missing legal basis → Exception Triage');
t = route(verified, { code: 'R', ...evidence, quotation: 'short' });
check(t.queue === X && t.exceptionReasons.includes('insufficient_evidence'), 'insufficient evidence → Exception Triage');
t = route({ ...verified, modelLabels: ['binding_requirement', 'guidance'] }, { code: 'R', ...evidence });
check(t.queue === X && t.exceptionReasons.includes('conflicting_classifications'), 'model labels guidance while reviewer says R → Exception Triage (conflict)');
t = route({ ...verified, modelLabels: ['guidance'] }, { code: 'R', ...evidence, reclassificationEvidence: 'COBS 2.1.1R is a rule in the Handbook, p.3' });
check(t.queue === A && t.conversionEligible, 'documented evidence-based reclassification resolves the conflict');
t = route(verified, { code: 'E', ...evidence });
check(t.queue === X && t.exceptionReasons.includes('missing_binding_link'), 'E without a binding rule link → Exception Triage');
t = route(verified, { code: 'E', ...evidence, supportingObligationId: '11111111-1111-4111-8111-111111111111' });
check(t.queue === A && t.legalStatus === 'evidential', 'E linked to a binding obligation → Obligation Triage, still evidential');
t = route(verified, { code: 'UK', ...evidence }, 'finalised_guidance');
check(t.queue === X && t.exceptionReasons.includes('binding_code_from_non_binding_source'), 'binding code on a finding from finalised guidance → Exception Triage');
t = route(verified, { code: 'R', ...evidence }, 'FINALISED_GUIDANCE');
check(t.exceptionReasons.includes('binding_code_from_non_binding_source'), 'publication type comparison is case-insensitive');
t = evaluateFindingTriage({ policy: null, finding: verified, proposal: { code: 'R', ...evidence } });
check(t.queue === X && t.exceptionReasons[0] === 'policy_unavailable' && !t.conversionEligible, 'no active policy → Exception Triage (fail closed)');

// Provisional routing (before human classification).
check(route({ citationStatus: 'VERIFIED', modelLabels: ['guidance'] }, null).queue === B, 'provisional: model guidance → Non-Obligation Triage');
check(route({ citationStatus: 'VERIFIED', modelLabels: [] }, null).exceptionReasons.includes('unknown_classification'), 'provisional: no model label → Exception (unknown)');
check(route({ citationStatus: 'VERIFIED', modelLabels: ['binding_requirement'] }, null).queue === A, 'provisional: model binding from a binding source → Obligation Triage');
check(route({ citationStatus: 'VERIFIED', modelLabels: ['binding_requirement'] }, null, 'finalised_guidance').queue === X, 'provisional: model binding from finalised guidance → Exception');
check(route({ citationStatus: 'VERIFIED', modelLabels: ['binding_requirement'] }, null).conversionEligible === false, 'provisional routing never makes a finding conversion-eligible');

// 4. Confidence never overrides restrictions.
t = route({ ...verified, modelConfidence: 100 }, { code: 'G', ...evidence, confidence: 100 });
check(t.queue === B && !t.conversionEligible, 'confidence 100 does not make guidance convertible');
check(conversionRefusal(route(verified, { code: 'G', ...evidence }), 4) === 'finding_conversion_not_permitted:4', 'refusal code for a NO classification');
check(conversionRefusal(route(verified, { code: 'E', ...evidence }), 2) === 'finding_binding_link_required:2', 'refusal code for E without a link');

// 5. Model labels by shared source section (deterministic).
const labels = modelLabelsForFinding({ sourceSectionIds: ['S14'] }, [
  { bindingNature: 'guidance', sourceSectionIds: ['S14'] },
  { bindingNature: 'binding_requirement', sourceSectionIds: ['S14', 'S2'] },
  { bindingNature: 'consultation_proposal', sourceSectionIds: ['S9'] },
]);
check(JSON.stringify(labels) === '["binding_requirement","guidance"]', 'model labels come from candidates sharing a cited section', labels);

// 6. Reporting split.
check(obligationLegalCategory({ metadata: { legalStatus: 'binding' } }) === 'binding' && obligationLegalCategory({ metadata: { legalStatus: 'evidential' } }) === 'evidential' && obligationLegalCategory({ metadata: {} }) === 'unclassified', 'reporting separates binding, evidential and unclassified obligations');

// 7. Payload validation through finding-review-core.
const run = {
  structured_output: {
    claims: [{ confidence: 99 }, { confidence: 99 }, { confidence: 40 }],
    candidates: [
      { bindingNature: 'binding_requirement', sourceSectionIds: ['S1'], statement: 'a', sourceQuotation: 'q' },
      { bindingNature: 'guidance', sourceSectionIds: ['S2'], statement: 'b', sourceQuotation: 'q' },
    ],
    _forgeniqGrounding: { obligationGradeSuitable: true, extractionRevisionId: 'r', sectionCatalog: [
      { sourceSectionId: 'S1', pageNumber: 3 }, { sourceSectionId: 'S2', pageNumber: 5 }, { sourceSectionId: 'S3', pageNumber: 7 },
    ] },
  },
};
const cites = [
  { id: 'f-1', claim_index: 0, claim_text: 'Firms must act honestly.', citation_status: 'VERIFIED', source_section_ids: ['S1'] },
  { id: 'f-2', claim_index: 1, claim_text: 'Firms should consider good practice.', citation_status: 'VERIFIED', source_section_ids: ['S2'] },
  { id: 'f-3', claim_index: 2, claim_text: 'Firms must keep evidence of training.', citation_status: 'VERIFIED', source_section_ids: ['S1', 'S3'] },
];
const ctx = { pathway: 'production_grounded', policy, publicationType: 'policy_statement' };
const view = buildFindingsView(run, cites, ctx);
check(view.findings.every((f) => f.triage && Object.values(TRIAGE_QUEUES).includes(f.triage.queue)), 'every finding in the view has a triage destination');
check(view.findings[0].triage.queue === A && view.findings[1].triage.queue === B, 'view routes findings provisionally from model labels', view.findings.map((f) => f.triage.queue));
const d = (f, extra) => ({ findingId: f.findingId, claimTextSha256: sha256Hex(f.statement), comment: 'Checked against the source PDF.', ...extra });
const [f1, f2, f3] = view.findings;
const good = [
  d(f1, { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', legalBasis: 'PRIN 2.1.1R', quotation: 'A firm must conduct its business with integrity.', quotationPage: 3 }),
  d(f2, { decision: 'ACCEPTED', regulatoryClassificationCode: 'GP', disposition: DISPOSITIONS.HORIZON }),
  d(f3, { decision: 'ACCEPTED', regulatoryClassificationCode: 'E', legalBasis: 'SYSC 9.1.1R', quotation: 'A firm must arrange for orderly records to be kept.', quotationPage: 3, supportingFindingId: 'f-1' }),
];
let v = validateFindingDecisions(view.findings, good, ctx);
check(v.ok && v.decisions[0].createsObligation && !v.decisions[1].createsObligation && v.decisions[2].createsObligation && v.decisions[2].legalStatus === 'evidential', 'R and linked E convert; good practice referred to horizon scanning', v);
const legacy = clone(good);
delete legacy[0].regulatoryClassificationCode;
legacy[0].classification = 'binding_requirement';
v = validateFindingDecisions(view.findings, legacy, ctx);
check(!v.ok && v.error === 'finding_classification_code_required:1', 'legacy payload without a classification code refused', v);
const guidanceConvert = clone(good);
guidanceConvert[1] = d(f2, { decision: 'ACCEPTED', regulatoryClassificationCode: 'GBR', disposition: DISPOSITIONS.CONVERT, legalBasis: 'x reg', quotation: 'This is guidance on the requirement above.', quotationPage: 5 });
v = validateFindingDecisions(view.findings, guidanceConvert, ctx);
check(!v.ok && v.error === 'finding_conversion_not_permitted:2', 'guidance on binding requirements cannot be converted (explicit convert refused)', v);
const archiveInA = clone(good);
archiveInA[0] = d(f1, { decision: 'ACCEPTED', regulatoryClassificationCode: 'R', disposition: DISPOSITIONS.ARCHIVE, legalBasis: 'PRIN 2.1.1R', quotation: 'A firm must conduct its business with integrity.', quotationPage: 3 });
v = validateFindingDecisions(view.findings, archiveInA, ctx);
check(!v.ok && v.error === 'finding_disposition_not_allowed:1', 'Queue A finding cannot be silently archived', v);
const linkNoId = clone(good);
linkNoId[1] = d(f2, { decision: 'ACCEPTED', regulatoryClassificationCode: 'G', disposition: DISPOSITIONS.LINK });
v = validateFindingDecisions(view.findings, linkNoId, ctx);
check(!v.ok && v.error === 'finding_linked_obligation_required:2', 'link to an existing obligation needs the obligation ID', v);
const eToGuidance = clone(good);
eToGuidance[0] = d(f1, { decision: 'REJECTED' });
v = validateFindingDecisions(view.findings, eToGuidance, ctx);
check(!v.ok && v.error === 'finding_binding_link_invalid:3', 'E cannot link to a finding that is not converted as binding', v);
v = validateFindingDecisions(view.findings, good, { ...ctx, policy: null });
check(!v.ok && v.error === 'classification_policy_unavailable', 'no policy: accepted decisions refused (fail closed)', v);
v = validateFindingDecisions(view.findings, good, { ...ctx, publicationType: 'finalised_guidance' });
check(!v.ok && v.error === 'finding_source_not_binding:1', 'binding conversion from finalised guidance refused', v);
const rejectedAll = view.findings.map((f) => d(f, { decision: 'REJECTED' }));
v = validateFindingDecisions(view.findings, rejectedAll, ctx);
check(v.ok && v.decisions.every((x) => x.triageQueue && !x.createsObligation), 'rejected findings keep a triage queue and create nothing', v.ok && v.decisions.map((x) => x.triageQueue));

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
