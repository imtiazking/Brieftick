#!/usr/bin/env node
/**
 * Regulatory classification regression corpus (Production Readiness Phase 5). Deterministic, no AI, no network.
 *
 * Every case is generated from axes (classification code x publication source type x citation state x evidence
 * defect) and checked against an ORACLE written independently from the stated legal rules, not from the engine.
 * Also proves: AI confidence is never an input, a regulator without an approved policy is fail-closed, policy
 * validation refuses every attempt to make non-binding material convertible, and the JavaScript legal-status
 * vocabulary equals the database function.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_CLASSIFICATION_CODES,
  FCA_POLICY_V1,
  MANDATORY_NON_BINDING_PUBLICATION_TYPES,
  TRIAGE_QUEUES as Q,
  evaluateFindingTriage,
  validateClassificationPolicy,
} from '../lib/ri/classification/regulatory-classification-policy.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
let total = 0;
const failures = [];
const check = (id, ok, detail) => {
  total += 1;
  if (!ok) {
    fail += 1;
    if (failures.length < 25) failures.push(`${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
};
const section = (name, fn) => {
  const before = { total, fail };
  fn();
  console.log(`${fail === before.fail ? 'PASS' : 'FAIL'}: ${name} (${total - before.total} checks)`);
};

// ---------------------------------------------------------------- oracle
const CONVERTIBLE = new Set(['R', 'E', 'D', 'P', 'UK', 'EU', 'TS']); // legal status binding or evidential
const REFERENCE_MARKERS = new Set(['R', 'E', 'G', 'D', 'P', 'C', 'UK', 'EU']); // TS has no Handbook marker
const NON_BINDING_SOURCES = new Set([...MANDATORY_NON_BINDING_PUBLICATION_TYPES]);
const BINDING_SOURCES = ['rules_instrument', 'policy_statement', 'legislation'];
const LONG_QUOTE = 'A firm must take reasonable steps to ensure the customer is treated fairly at every stage.';
const NON_DUTY_QUOTE = 'The customer relationship is described in the following paragraphs of this section.';
const APPLICATION_QUOTE = 'A firm must comply but this does not apply to a firm that is exempt from the rule.';

function buildCase(base, defect) {
  const code = base.code;
  const evidential = code === 'E';
  const marker = REFERENCE_MARKERS.has(code) ? code : 'R';
  const core = '4.8.2';
  const proposal = {
    code,
    legalBasis: 'CONC 4.8.2',
    quotation: LONG_QUOTE,
    quotationPage: 12,
    provisionReference: `CONC ${core}${marker}`,
    provisionFunction: evidential ? 'EVIDENTIAL_PROVISION' : 'OPERATIVE_REQUIREMENT',
    supportingObligationId: evidential ? 'obl-binding-1' : null,
    reclassificationEvidence: null,
  };
  const sections = [{
    pageNumber: 12,
    inLegalInstrument: true,
    provisionsSetOut: [`${core}${marker}`],
    provisionTextStatus: { [`${core}${marker}`]: 'INSTRUMENT_TEXT' },
  }];
  const finding = {
    citationStatus: base.citationVerified ? 'VERIFIED' : 'UNVERIFIED',
    modelLabels: ['binding_requirement'],
    sections,
  };
  let expectedOk = true; // for convertible codes: would convert if no defect
  switch (defect) {
    case 'none': break;
    case 'no_quote': proposal.quotation = ''; expectedOk = false; break;
    case 'short_quote': proposal.quotation = 'A firm must act.'; expectedOk = false; break;
    case 'no_page': proposal.quotationPage = null; expectedOk = false; break;
    case 'no_legal_basis': proposal.legalBasis = ''; expectedOk = false; break;
    case 'no_duty_language':
      proposal.quotation = NON_DUTY_QUOTE;
      expectedOk = evidential; // duty language is only demanded for binding operative provisions
      break;
    case 'application_language':
      proposal.quotation = APPLICATION_QUOTE;
      expectedOk = evidential;
      break;
    case 'wrong_marker': proposal.provisionReference = `CONC ${core}G`; expectedOk = false; break;
    case 'no_reference': proposal.provisionReference = ''; expectedOk = false; break;
    case 'not_in_instrument': sections[0].inLegalInstrument = false; expectedOk = false; break;
    case 'not_set_out': sections[0].provisionsSetOut = ['9.9.9R']; expectedOk = false; break;
    case 'amendment_uncertain': sections[0].provisionTextStatus = { [`${core}${marker}`]: 'AMENDMENT_MARKUP_UNCERTAIN' }; expectedOk = false; break;
    case 'deleted': sections[0].provisionTextStatus = { [`${core}${marker}`]: 'DELETED' }; expectedOk = false; break;
    case 'wrong_function': proposal.provisionFunction = evidential ? 'OPERATIVE_REQUIREMENT' : 'EVIDENTIAL_PROVISION'; expectedOk = false; break;
    case 'conflicting_label_no_evidence': finding.modelLabels = ['guidance']; expectedOk = false; break;
    case 'conflicting_label_with_evidence':
      finding.modelLabels = ['guidance'];
      proposal.reclassificationEvidence = 'Reviewer verified the quoted text is a rule (R) in the Handbook instrument.';
      break;
    case 'missing_binding_link': proposal.supportingObligationId = null; expectedOk = !evidential; break;
    default: throw new Error(`unknown defect ${defect}`);
  }
  return { proposal, finding, expectedOk };
}

/** Independent expected routing. */
function oracle(base, expectedOkBeforeSource, defect) {
  const { code, publicationType, citationVerified } = base;
  if (code === 'UNKNOWN') return { queue: Q.EXCEPTION, eligible: false };
  if (!citationVerified) return { queue: Q.EXCEPTION, eligible: false };
  if (!CONVERTIBLE.has(code)) return { queue: Q.NON_OBLIGATION, eligible: false };
  if (NON_BINDING_SOURCES.has(publicationType)) return { queue: Q.EXCEPTION, eligible: false };
  if (code === 'TS') return { queue: Q.EXCEPTION, eligible: false }; // no Handbook marker: provision cannot be grounded
  void defect;
  return expectedOkBeforeSource ? { queue: Q.OBLIGATION, eligible: true } : { queue: Q.EXCEPTION, eligible: false };
}

const DEFECTS = [
  'none', 'no_quote', 'short_quote', 'no_page', 'no_legal_basis', 'no_duty_language', 'application_language',
  'wrong_marker', 'no_reference', 'not_in_instrument', 'not_set_out', 'amendment_uncertain', 'deleted',
  'wrong_function', 'conflicting_label_no_evidence', 'conflicting_label_with_evidence', 'missing_binding_link',
];
const SOURCE_TYPES = [...BINDING_SOURCES, 'consultation_paper', 'finalised_guidance', 'news', 'speech'];
const ALL_CODES = Object.keys(CANONICAL_CLASSIFICATION_CODES);

section('policy_is_valid', () => {
  check('fca_policy_valid', validateClassificationPolicy(FCA_POLICY_V1).length === 0, validateClassificationPolicy(FCA_POLICY_V1));
  check('all_21_codes_in_policy', FCA_POLICY_V1.entries.length === ALL_CODES.length, FCA_POLICY_V1.entries.length);
});

section('generated_corpus_matches_oracle', () => {
  for (const code of ALL_CODES) {
    for (const publicationType of SOURCE_TYPES) {
      for (const citationVerified of [true, false]) {
        for (const defect of DEFECTS) {
          const base = { code, publicationType, citationVerified };
          const { proposal, finding, expectedOk } = buildCase(base, defect);
          const actual = evaluateFindingTriage({ policy: FCA_POLICY_V1, publicationType, finding, proposal });
          const expected = oracle(base, expectedOk, defect);
          check(
            `${code}/${publicationType}/${citationVerified ? 'verified' : 'unverified'}/${defect}`,
            actual.queue === expected.queue && actual.conversionEligible === expected.eligible,
            { expected, actual: { queue: actual.queue, eligible: actual.conversionEligible, reasons: actual.exceptionReasons } },
          );
        }
      }
    }
  }
});

section('non_binding_material_never_converts', () => {
  for (const code of ALL_CODES.filter((c) => !CONVERTIBLE.has(c))) {
    for (const publicationType of SOURCE_TYPES) {
      const { proposal, finding } = buildCase({ code, publicationType, citationVerified: true }, 'none');
      const r = evaluateFindingTriage({ policy: FCA_POLICY_V1, publicationType, finding, proposal });
      check(`never_obligation_${code}_${publicationType}`, r.queue !== Q.OBLIGATION && r.conversionEligible === false, r);
    }
  }
});

section('guidance_sources_never_yield_binding_conversion', () => {
  for (const code of [...CONVERTIBLE]) {
    for (const publicationType of MANDATORY_NON_BINDING_PUBLICATION_TYPES) {
      const { proposal, finding } = buildCase({ code, publicationType, citationVerified: true }, 'none');
      const r = evaluateFindingTriage({ policy: FCA_POLICY_V1, publicationType, finding, proposal });
      check(`guidance_source_${code}_${publicationType}`, r.conversionEligible === false && r.queue === Q.EXCEPTION, r);
    }
  }
});

section('ai_confidence_is_never_an_input', () => {
  for (const code of ['R', 'G', 'E', 'UNKNOWN']) {
    for (const confidence of [0, 0.5, 0.99, 100]) {
      const base = { code, publicationType: 'rules_instrument', citationVerified: true };
      const { proposal, finding } = buildCase(base, 'none');
      const plain = evaluateFindingTriage({ policy: FCA_POLICY_V1, publicationType: 'rules_instrument', finding, proposal });
      const withConf = evaluateFindingTriage({
        policy: FCA_POLICY_V1, publicationType: 'rules_instrument',
        finding: { ...finding, confidence, aiConfidence: confidence }, proposal: { ...proposal, confidence },
      });
      check(`confidence_${code}_${confidence}`, plain.queue === withConf.queue && plain.conversionEligible === withConf.conversionEligible, { plain, withConf });
    }
  }
});

section('provisional_routing_before_human_classification', () => {
  const p = (labels, status = 'VERIFIED', publicationType = 'rules_instrument') =>
    evaluateFindingTriage({ policy: FCA_POLICY_V1, publicationType, finding: { citationStatus: status, modelLabels: labels }, proposal: null });
  check('binding_label_verified_is_provisional_obligation', p(['binding_requirement']).queue === Q.OBLIGATION && p(['binding_requirement']).provisional === true && p(['binding_requirement']).conversionEligible === false, p(['binding_requirement']));
  check('guidance_label_is_non_obligation', p(['guidance']).queue === Q.NON_OBLIGATION, p(['guidance']));
  check('unverified_is_exception', p(['binding_requirement'], 'UNVERIFIED').queue === Q.EXCEPTION, p(['binding_requirement'], 'UNVERIFIED'));
  check('conflicting_labels_exception', p(['binding_requirement', 'guidance']).queue === Q.EXCEPTION, p(['binding_requirement', 'guidance']));
  check('no_label_exception', p([]).queue === Q.EXCEPTION, p([]));
  check('binding_label_from_guidance_source_exception', p(['binding_requirement'], 'VERIFIED', 'finalised_guidance').queue === Q.EXCEPTION, p(['binding_requirement'], 'VERIFIED', 'finalised_guidance'));
  check('provisional_is_never_conversion_eligible', ['binding_requirement', 'guidance', 'consultation_proposal'].every((l) => p([l]).conversionEligible === false), 'eligible');
});

section('regulator_without_approved_policy_is_fail_closed', () => {
  for (const regulator of ['REG-PRA', 'REG-ICO', 'REG-FRC', 'REG-PSR-UK', 'REG-BOE', 'REG-SEC']) {
    const { proposal, finding } = buildCase({ code: 'R', publicationType: 'rules_instrument', citationVerified: true }, 'none');
    const r = evaluateFindingTriage({ policy: null, publicationType: 'rules_instrument', finding, proposal });
    check(`fail_closed_${regulator}`, r.queue === Q.EXCEPTION && r.conversionEligible === false && r.exceptionReasons.includes('policy_unavailable'), r);
  }
});

section('policy_validation_refuses_unsafe_policies', () => {
  const clone = () => JSON.parse(JSON.stringify(FCA_POLICY_V1));
  for (const code of ALL_CODES.filter((c) => !CONVERTIBLE.has(c))) {
    const p = clone();
    const e = p.entries.find((x) => x.code === code);
    e.conversionEnabled = true;
    e.destinationQueue = Q.OBLIGATION;
    check(`refuse_enable_conversion_${code}`, validateClassificationPolicy(p).some((x) => x.startsWith('conversion_not_permitted')), validateClassificationPolicy(p));
  }
  for (const code of ALL_CODES.filter((c) => !CONVERTIBLE.has(c) && c !== 'UNKNOWN')) {
    const p = clone();
    p.entries.find((x) => x.code === code).destinationQueue = Q.OBLIGATION;
    check(`refuse_obligation_queue_${code}`, validateClassificationPolicy(p).some((x) => x.startsWith('obligation_queue_requires_conversion')), validateClassificationPolicy(p));
  }
  for (const type of MANDATORY_NON_BINDING_PUBLICATION_TYPES) {
    const p = clone();
    p.nonBindingPublicationTypes = p.nonBindingPublicationTypes.filter((t) => t !== type);
    check(`refuse_dropping_${type}`, validateClassificationPolicy(p).includes(`non_binding_publication_type_required:${type}`), validateClassificationPolicy(p));
  }
  for (const code of [...CONVERTIBLE]) {
    const p = clone();
    p.entries.find((x) => x.code === code).humanReviewRequired = false;
    check(`refuse_no_human_review_${code}`, validateClassificationPolicy(p).some((x) => x.startsWith('human_review_required')), validateClassificationPolicy(p));
  }
  const noLink = clone();
  noLink.entries.find((x) => x.code === 'E').supportingObligationLinkRequired = false;
  check('refuse_evidential_without_link', validateClassificationPolicy(noLink).some((x) => x.startsWith('supporting_link_required')), 'E');
  const unknownBad = clone();
  unknownBad.entries.find((x) => x.code === 'UNKNOWN').destinationQueue = Q.NON_OBLIGATION;
  check('refuse_unknown_not_exception', validateClassificationPolicy(unknownBad).includes('unknown_must_route_to_exception'), 'UNKNOWN');
  const noUnknown = clone();
  noUnknown.entries = noUnknown.entries.filter((x) => x.code !== 'UNKNOWN');
  check('refuse_missing_unknown', validateClassificationPolicy(noUnknown).includes('unknown_entry_required'), 'missing UNKNOWN');
  const invented = clone();
  invented.entries.push({ code: 'XX', description: 'invented', legalStatus: 'binding', conversionEnabled: true, destinationQueue: Q.OBLIGATION, humanReviewRequired: true, supportingObligationLinkRequired: false });
  check('refuse_non_canonical_code', validateClassificationPolicy(invented).some((x) => x.startsWith('code_not_canonical')), 'XX');
  const dup = clone();
  dup.entries.push({ ...dup.entries[0] });
  check('refuse_duplicate_code', validateClassificationPolicy(dup).some((x) => x.startsWith('code_duplicated')), 'dup');
  const relabel = clone();
  relabel.entries.find((x) => x.code === 'G').legalStatus = 'binding';
  check('refuse_relabelled_legal_status', validateClassificationPolicy(relabel).some((x) => x.startsWith('legal_status_fixed')), 'G binding');
  check('refuse_null_policy', validateClassificationPolicy(null)[0] === 'policy_invalid', 'null');
  const noRegulator = clone();
  delete noRegulator.regulatorKey;
  check('refuse_no_regulator', validateClassificationPolicy(noRegulator).includes('regulator_required'), 'regulator');
  const badVersion = clone();
  badVersion.policyVersion = 0;
  check('refuse_bad_version', validateClassificationPolicy(badVersion).includes('policy_version_invalid'), 'version');
});

section('anchor_cases_named_provisions', () => {
  const run = (over) => {
    const base = { code: 'R', publicationType: 'rules_instrument', citationVerified: true };
    const { proposal, finding } = buildCase(base, 'none');
    return evaluateFindingTriage({
      policy: FCA_POLICY_V1, publicationType: base.publicationType, finding, proposal: { ...proposal, ...over },
    });
  };
  // CONC 7.20.1R is a rule: operative, binding, convertible when grounded and verified.
  check('conc_7_20_1_r_rule_converts', run({}).conversionEligible === true, run({}));
  // Guidance paragraph (G) cited from the same instrument never converts.
  check('conc_guidance_g_non_obligation', run({ code: 'G' }).queue === Q.NON_OBLIGATION, run({ code: 'G' }));
  // A definition (DEF) is interpretive, not an obligation.
  check('definition_not_obligation', run({ code: 'DEF' }).queue === Q.NON_OBLIGATION, run({ code: 'DEF' }));
  // Transitional provision with mandatory language is held for a human.
  check('transitional_with_duty_goes_to_exception', run({ provisionFunction: 'TRANSITIONAL' }).queue === Q.EXCEPTION, run({ provisionFunction: 'TRANSITIONAL' }));
  // Application / scope provision is not an obligation, even from a rules instrument.
  check('application_provision_non_obligation', run({ provisionFunction: 'APPLICATION' }).queue === Q.NON_OBLIGATION, run({ provisionFunction: 'APPLICATION' }));
  check('exemption_provision_non_obligation', run({ provisionFunction: 'EXEMPTION' }).queue === Q.NON_OBLIGATION, run({ provisionFunction: 'EXEMPTION' }));
  check('permission_provision_non_obligation', run({ provisionFunction: 'PERMISSION' }).queue === Q.NON_OBLIGATION, run({ provisionFunction: 'PERMISSION' }));
  // Unknown code is an exception.
  check('unknown_code_exception', run({ code: 'ZZ' }).queue === Q.EXCEPTION, run({ code: 'ZZ' }));
});

section('js_vocabulary_equals_database_function', () => {
  const dir = join(platformRoot, 'supabase', 'migrations');
  const file = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => ({ f, s: readFileSync(join(dir, f), 'utf8') }))
    .filter(({ s }) => s.includes('function public.ri_classification_code_legal_status'))
    .pop();
  check('sql_function_found', Boolean(file), 'no migration defines ri_classification_code_legal_status');
  if (!file) return;
  const body = file.s.slice(file.s.indexOf('function public.ri_classification_code_legal_status'));
  const fnBody = body.slice(0, body.indexOf('$$;', body.indexOf('$$') + 2));
  const sqlMap = {};
  for (const m of fnBody.matchAll(/when '([A-Z]+)' then '([a-z_]+)'/g)) sqlMap[m[1]] = m[2];
  for (const [code, { legalStatus }] of Object.entries(CANONICAL_CLASSIFICATION_CODES)) {
    if (code === 'UNKNOWN') continue; // falls to the SQL else branch
    check(`legal_status_${code}`, sqlMap[code] === legalStatus, { sql: sqlMap[code], js: legalStatus });
  }
  check('no_extra_sql_codes', Object.keys(sqlMap).every((c) => c in CANONICAL_CLASSIFICATION_CODES), Object.keys(sqlMap));
});

console.log(`\nclassification corpus: ${total} checks, ${fail} failed`);
if (fail > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log('PASS: regulatory classification corpus');
