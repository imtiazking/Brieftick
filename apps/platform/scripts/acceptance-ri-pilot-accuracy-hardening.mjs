#!/usr/bin/env node
/**
 * FCA-EVAL-001 pilot findings: regulatory accuracy hardening. Deterministic and mock-provider only — no paid AI.
 * Covers publication classification, commencement, provision breakdown, guard behaviour, citation validation,
 * risk-rating policy, control coverage, assurance truncation, and evaluation of the saved pilot outputs.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(platformRoot, '../..');
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const { parsePdfPhysicalPages } = await import('../../../integrations/regulatory-sources/core/pdf-physical-page-parser.mjs');
const { analyzeRegulatoryPdfDocument } = await import('../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs');
const instrumentMod = await import('../../../integrations/regulatory-sources/core/instrument-legal-status.mjs');
const breakdownMod = await import('../lib/ri/ai/provision-breakdown.mjs');
const legalMod = await import('../lib/ri/ai/provision-legal-status.mjs');
const guardMod = await import('../lib/ri/ai/obligation-extraction-regulatory-guard.mjs');
const evidenceMod = await import('../lib/ri/ai/lifecycle-evidence.mjs');
const riskPolicy = await import('../lib/ri/ai/risk-rating-policy.mjs');
const coverageMod = await import('../lib/ri/ai/control-coverage.mjs');
const { mapAssurancePlanToDraftFields, ASSURANCE_NOTES_MAX_CHARS } = await import('../lib/ri/ai/assurance-plan-mapper.mjs');
const { mapRiskMappingToDraftFields } = await import('../lib/ri/ai/risk-mapping-mapper.mjs');
const { mapControlMappingToDraftFields } = await import('../lib/ri/ai/control-mapping-mapper.mjs');
const { extractProvisionScopedExcerpt } = await import('../lib/ri/ai/deterministic-provision-candidates.mjs');
const { buildAnthropicPrompts, compactRegulatoryAnalysisForPrompt } = await import('../lib/ri/ai/anthropic-prompts-core.mjs');
const { runLifecycleStageAnalysis, liveGroundedCitations } = await import('../lib/ri/ai/lifecycle-stage-ai.ts');
const { runEvaluation, verifyManifest } = await import('./eval/run-pilot-saved-output-evaluation.mjs');

let fail = 0;
const ok = (id) => console.log(`PASS: ${id}`);
const bad = (id, detail) => {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
};
const check = (id, cond, detail = '') => (cond ? ok(id) : bad(id, detail));

const parsed = await parsePdfPhysicalPages(readFileSync(join(repoRoot, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf')));
const pages = parsed.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));

// ---- 1. Publication classification and commencement ---------------------------------------------------------
const analysis = analyzeRegulatoryPdfDocument({ structured: { pages }, publicationMetadata: {} });
check('PS26/1 is a final policy statement, not a consultation', analysis.publicationClassification.primaryClass === 'policy_statement', analysis.publicationClassification.primaryClass);
check('PS26/1 consultation is not preserved', analysis.consultationPreserved === false);
check('PS26/1 document legal status is final made instrument', analysis.documentLegalStatus === 'final_made_instrument', analysis.documentLegalStatus);
for (const meta of [{ publicationTypeLabel: 'Consultation paper' }, { publicationType: 'consultation_paper' }]) {
  const a = analyzeRegulatoryPdfDocument({ structured: { pages }, publicationMetadata: meta });
  check(`made instrument outranks a stale consultation label (${JSON.stringify(meta)})`, a.consultationPreserved === false && a.documentLegalStatus === 'final_made_instrument', a.publicationClassification.primaryClass);
}

const instrument = instrumentMod.analyzeInstrumentLegalStatus(pages);
check('instrument detected as made, FCA 2026/2', instrument.status === 'made' && instrument.instrumentNumber === 'FCA 2026/2', JSON.stringify([instrument.status, instrument.instrumentNumber]));
check('CONC is Annex F', instrument.moduleAnnexMap.CONC === 'F');
const conc = instrumentMod.resolveProvisionCommencement(instrument, { page: 94, provisionReference: 'CONC 7.20.1R' });
check('CONC 7.20.1R commencement 2026-07-15 via clause H', conc.status === 'resolved' && conc.commencementDate === '2026-07-15' && conc.clause === 'H', JSON.stringify(conc));
check('commencement evidence quotes the clause on p.63', conc.evidence?.[0]?.page === 63 && /come into force on 15 July 2026/.test(conc.evidence[0].quotation));
const glossaryPart1 = instrumentMod.resolveProvisionCommencement(instrument, { page: 65 });
check('multi-part annex on a page with two parts is not guessed', glossaryPart1.status === 'unresolved', JSON.stringify(glossaryPart1));
const disp = instrumentMod.resolveProvisionCommencement(instrument, { page: 82 });
check('annex with part headings resolves by part (DISP Part 3 = 15 July 2026)', disp.status === 'resolved' && disp.part === 3 && disp.commencementDate === '2026-07-15', JSON.stringify(disp));
const dispPart2 = instrumentMod.resolveProvisionCommencement(instrument, { page: 81 });
check('same-page parts are refused rather than guessed (DISP p.81)', dispPart2.status === 'unresolved', JSON.stringify(dispPart2));

const strippedPages = pages.map((p) => ({ ...p, text: p.text.replace(/All other parts of this instrument come into force on 15 July 2026/g, 'REDACTED') }));
const strippedInstrument = instrumentMod.analyzeInstrumentLegalStatus(strippedPages);
const strippedResolution = instrumentMod.resolveProvisionCommencement(strippedInstrument, { page: 94 });
check('commencement is not inferred when the clause is absent', strippedResolution.status === 'unresolved' && !strippedResolution.commencementDate, JSON.stringify(strippedResolution));
const transitional = instrumentMod.scanTransitionalReferences(pages, instrument, '7.20.1R');
check('transitional scan reports no provision-specific transitional and still requires expert confirmation', transitional.provisionSpecificTransitionalFound === false && transitional.requiresExpertConfirmation === true);

const cpPages = [
  { pageNumber: 1, text: 'Financial Conduct Authority Consultation Paper CP25/23 Deferred payment credit: proposed rules' },
  { pageNumber: 2, text: 'We propose that firms should notify borrowers. Please respond to the questions by 5 May.' },
  { pageNumber: 3, text: 'Appendix 1 Draft rules (legal instrument) The Consumer Credit sourcebook (CONC) is amended. 7.20.1 R (1) This rule applies where a borrower has failed to pay.' },
];
const cp = analyzeRegulatoryPdfDocument({ structured: { pages: cpPages }, publicationMetadata: {} });
check('a genuine consultation paper stays a consultation', cp.publicationClassification.primaryClass === 'consultation_paper' && cp.consultationPreserved === true, JSON.stringify([cp.publicationClassification.primaryClass, cp.consultationPreserved]));
check('a draft instrument is proposed, with no commencement in force', cp.documentLegalStatus === 'proposed_draft_instrument' && instrumentMod.resolveProvisionCommencement(cp.instrumentLegalStatus, { page: 3 }).status === 'unresolved');
const psWithCpMention = [
  { pageNumber: 1, text: 'Policy Statement PS26/1 Deferred payment credit: final rules' },
  { pageNumber: 2, text: 'This follows Consultation Paper CP25/23 and feedback to it.' },
];
const ps2 = analyzeRegulatoryPdfDocument({ structured: { pages: psWithCpMention }, publicationMetadata: {} });
check('a policy statement that mentions a consultation paper is not a consultation', ps2.publicationClassification.primaryClass === 'policy_statement' && ps2.consultationPreserved === false, ps2.publicationClassification.primaryClass);

// ---- 2. Provision breakdown (CONC 7.20.1R) ------------------------------------------------------------------
const ex = breakdownMod.extractProvisionText(pages.filter((p) => p.pageNumber >= 94 && p.pageNumber <= 96), '7.20.1R');
const bd = breakdownMod.breakDownProvision('7.20.1R', ex.text, { pages: ex.pages });
const kindOf = (ref) => bd.limbs.find((l) => l.reference === ref)?.kind;
check('7.20.1R(1) is an applicability condition, not an obligation', kindOf('CONC 7.20.1R(1)') === 'applicability_condition' && !bd.limbs.find((l) => l.reference === 'CONC 7.20.1R(1)').standaloneObligation);
check('7.20.1R(2)(a) is a mandatory notification', kindOf('CONC 7.20.1R(2)(a)') === 'mandatory_notification');
check('7.20.1R(2)(b) is a mandatory information requirement', kindOf('CONC 7.20.1R(2)(b)') === 'mandatory_information');
check('7.20.1R(3) is the information-together requirement', kindOf('CONC 7.20.1R(3)') === 'information_together_requirement');
check('7.20.1R(4) is a definition/scope qualification, not an obligation', kindOf('CONC 7.20.1R(4)') === 'definition_or_scope_qualification' && !bd.limbs.find((l) => l.reference === 'CONC 7.20.1R(4)').standaloneObligation);
check('only (2)(a), (2)(b) and (3) are standalone', JSON.stringify(bd.standaloneObligationPaths) === JSON.stringify(['CONC 7.20.1R(2)(a)', 'CONC 7.20.1R(2)(b)', 'CONC 7.20.1R(3)']), JSON.stringify(bd.standaloneObligationPaths));
check('lead-in timing carried to the mandatory limbs', bd.limbs.find((l) => l.reference === 'CONC 7.20.1R(2)(a)').inheritedFromLeadIn?.dutyHolder === 'the firm');
check('limb text is verbatim from the source page', breakdownMod.normaliseForMatch(bd.limbs.find((l) => l.reference === 'CONC 7.20.1R(3)').text).includes('the information required under (2) must be provided together'));
const judgementIds = new Set(bd.expertJudgement.map((j) => j.id));
for (const id of ['timing_as_soon_as_possible', 'sufficiency_standard', 'conditional_relevance', 'firm_judgement']) check(`expert-judgement flag: ${id}`, judgementIds.has(id));
check('child (i) limb does not get confused with letter (i)', bd.limbs.some((l) => l.reference === 'CONC 7.20.1R(2)(b)(iv)'));

const scopedExcerpt = extractProvisionScopedExcerpt(new Map(pages.map((p) => [p.pageNumber, p.text])), [94, 95], '7.20.1R');
check('provision excerpt starts where the rule is set out, not at the p.94 cross-reference', /^7\.20\.1\s*R\s*\(1\)/.test(scopedExcerpt || '') && !/^7\.20\.1R or/.test(scopedExcerpt || ''), String(scopedExcerpt).slice(0, 80));
check('provision excerpt reaches (2)(a) on the next page', /notify the borrower/.test(scopedExcerpt || ''), String(scopedExcerpt).slice(-80));

// ---- 3. Guard: legal status, commencement, applicability-only quotation ----------------------------------------
const provisionPageIndex = { '7.20.1R': [94, 95] };
const legal = legalMod.buildProvisionLegalContext({ pages, instrument, provisionPageIndex, breakdownCores: ['7.20.1R'] });
check('provision legal context: made rule with resolved commencement', legal.legalStatus['7.20.1R'] === 'final_made_rule' && legal.commencement['7.20.1R'].commencementDate === '2026-07-15');
check('verifiedEffectiveDate only returns a traced date', legalMod.verifiedEffectiveDate(legal, '7.20.1R').date === '2026-07-15' && legalMod.verifiedEffectiveDate(legal, '9.9.9R').date === null);
const regAnalysis = {
  publicationClassification: analysis.publicationClassification,
  regulatoryStatus: analysis.regulatoryStatus,
  consultationPreserved: analysis.consultationPreserved,
  isFinalisedGuidance: false,
  documentLegalStatus: analysis.documentLegalStatus,
  provisionLegal: legal,
};
const pubCtx = guardMod.resolvePublicationRegulatoryContext(regAnalysis);
check('publication context: legal instrument text, binding allowed', pubCtx.legalInstrumentText === true && pubCtx.mustNotPresentAsIndependentBinding === false && pubCtx.documentType === 'legal_instrument', JSON.stringify(pubCtx.documentType));
const catalog = [{ sourceSectionId: 'S1', inLegalInstrument: true, provisionsSetOut: ['7.20.1R'], provisionTextStatus: { '7.20.1R': 'NEW_TEXT' }, transitionalProvisions: false }];
const applicabilityOnly = {
  statement: 'CONC 7.20.1R applies where a borrower misses a payment.',
  provisionReference: 'CONC 7.20.1R',
  bindingNature: 'binding_requirement',
  effectiveDate: '2026-02-02',
  sourceQuotation: '7.20.1 R (1) This rule applies where a borrower has failed to make a payment by the time it has fallen due under the terms of a regulated deferred payment credit agreement (‘a missed payment’).',
};
guardMod.applyObligationCandidateRegulatoryGuard(applicabilityOnly, ['S1'], catalog, pubCtx);
check('model-supplied effective date is replaced by the instrument commencement', applicabilityOnly.effectiveDate === '2026-07-15' && applicabilityOnly._modelEffectiveDate === '2026-02-02' && applicabilityOnly._effectiveDateGuarded === 'replaced_with_instrument_commencement', JSON.stringify([applicabilityOnly.effectiveDate, applicabilityOnly._effectiveDateGuarded]));
check('applicability-only quotation is not a standalone obligation (routed to exception)', applicabilityOnly._regulatoryClassificationRoute === 'EXCEPTION' && applicabilityOnly._limbCoverageGuard === 'quotation_covers_applicability_or_definition_limb_only' && applicabilityOnly._forgeniqRegulatoryGuard.requiresOperativeLimbQuotation.length === 3, JSON.stringify(applicabilityOnly._forgeniqRegulatoryGuard));
check('guard records the provision legal status', applicabilityOnly._forgeniqRegulatoryGuard.provisionLegalStatus === 'final_made_rule');
const unverifiable = { statement: 'x', provisionReference: 'CONC 7.20.1R', bindingNature: 'binding_requirement', effectiveDate: '2026-02-02', sourceQuotation: '7.20.1 R (1) This rule applies where a borrower has failed to make a payment' };
guardMod.applyObligationCandidateRegulatoryGuard(unverifiable, ['S1'], catalog, guardMod.resolvePublicationRegulatoryContext({ ...regAnalysis, provisionLegal: { ...legal, commencement: {}, legalStatus: {} } }));
check('an unresolved commencement removes the unsupported model date', unverifiable.effectiveDate === null && unverifiable._effectiveDateGuarded === 'unsupported_model_date_removed');
const consultCtx = guardMod.resolvePublicationRegulatoryContext({ ...cp, publicationClassification: cp.publicationClassification, regulatoryStatus: cp.regulatoryStatus, consultationPreserved: true });
const consultCand = { statement: 'x', provisionReference: 'CONC 7.20.1R', bindingNature: 'binding_requirement', sourceQuotation: '7.20.1 R (1) This rule applies' };
guardMod.applyObligationCandidateRegulatoryGuard(consultCand, ['S1'], catalog, consultCtx);
check('a genuine consultation still downgrades binding labels', consultCand.bindingNature === 'consultation_proposal' && consultCand._forgeniqRegulatoryGuard.provisionLegalStatus === 'proposed_in_consultation');
const promptView = compactRegulatoryAnalysisForPrompt(regAnalysis);
check('prompt view drops verbatim limb text but keeps limb structure and commencement', !JSON.stringify(promptView).includes('This rule applies where') && promptView.provisionLegal.breakdowns['7.20.1R'].limbs.length === 12 && promptView.provisionLegal.commencement['7.20.1R'].commencementDate === '2026-07-15');
const prompts = buildAnthropicPrompts({
  analysisType: 'Obligation Extraction',
  useCaseId: 'UC-RI-005',
  sourceSections: [{ sourceSectionId: 'S1', text: 'x' }],
  regulatoryAnalysis: regAnalysis,
});
check('obligation prompt tells the model not to make applicability limbs standalone obligations', /not standalone obligations/.test(prompts.user) && /documentLegalStatus/.test(prompts.user));

// ---- 4. Evidence pack and citation validation ------------------------------------------------------------------
const obligationRow = {
  id: 'obl-1',
  obligation_statement: '(2) As soon as possible after a missed payment has occurred the firm must: (a) notify the borrower',
  citation: 'PDF p.95',
  effective_date: '2026-07-15',
  publication_id: 'pub-1',
  metadata: {
    provisionReference: 'CONC 7.20.1R',
    provisionCore: '7.20.1R',
    sourceQuotation: '(2) As soon as possible after a missed payment has occurred the firm must: (a) notify the borrower: (i) that the missed payment has occurred; and (ii) about any sums which have become payable under the regulated deferred payment credit agreement but remain unpaid',
    quotationPage: 95,
    quotationVerificationId: 'verif-1',
    legalBasis: 'FCA Handbook CONC 7.20.1R, inserted by FCA 2026/2',
    legalStatus: 'binding',
    commencement: { status: 'resolved', commencementDate: '2026-07-15', evidence: conc.evidence },
    provisionBreakdown: bd,
  },
};
const pack = evidenceMod.buildRegulatoryEvidencePack(obligationRow);
check('pack carries provision, verified quotation, instrument-traced effective date', pack.provision.reference === 'CONC 7.20.1R' && pack.quotation.verified === true && pack.effective.source === 'instrument_commencement');
check('pack flags what the verified quotation does not cover', pack.quotation.coversLimbs.includes('CONC 7.20.1R(2)(a)') && pack.uncertainties.some((u) => /Expert judgement needed/.test(u)));
const sections = evidenceMod.evidencePackSourceSections(pack);
check('regulatory evidence is supplied as its own citable section REG-1', sections[0]?.sourceSectionId === 'REG-1' && /notify the borrower/.test(sections[0].text));
const allowedIds = ['OBL-1', 'REG-1'];
const validation = evidenceMod.validateStageClaims(
  {
    claims: [
      { claim: 'Good claim', sourceSectionIds: ['REG-1'], sourceQuotation: 'As soon as possible after a missed payment has occurred the firm must', provisionReference: 'CONC 7.20.1R' },
      { claim: 'Fabricated quotation', sourceSectionIds: ['REG-1'], sourceQuotation: 'firms must notify borrowers within 3 working days', provisionReference: 'CONC 7.20.1R' },
      { claim: 'Wrong provision', sourceSectionIds: ['REG-1'], provisionReference: 'CONC 5.2A.1R' },
      { claim: 'Invented section', sourceSectionIds: ['REG-9'] },
      { claim: 'Internal id only', sourceSectionIds: ['OBL-1'] },
    ],
  },
  { pack, allowedSectionIds: allowedIds, sections },
);
check('verified claim accepted at regulatory_verified', validation.accepted[0]?.evidenceLevel === 'regulatory_verified');
check('fabricated quotation rejected', validation.rejected.some((r) => r.text === 'Fabricated quotation' && r.reasons.includes('quotation_not_in_verified_source')));
check('provision reference not in evidence rejected', validation.rejected.some((r) => r.text === 'Wrong provision' && r.reasons.includes('provision_reference_not_in_evidence')));
check('unknown section id rejected', validation.rejected.some((r) => r.text === 'Invented section' && r.reasons.some((x) => x.startsWith('unknown_source_section'))));
check('internal identifier alone is accepted only as internal_only evidence', validation.accepted.find((c) => c.text === 'Internal id only')?.evidenceLevel === 'internal_only' && validation.summary.regulatoryEvidencedCount === 1);
check('evidence trace links each claim to the originating obligation and provision', validation.evidenceTrace.every((t) => t.originatingObligationId === 'obl-1' && t.provisionReference === 'CONC 7.20.1R'));
check('claim sentence under "claim" is kept as text', validation.accepted[0].text === 'Good claim');
check('liveGroundedCitations maps the "claim" key (pilot defect: text was null)', liveGroundedCitations({ claims: [{ claim: 'Sentence', sourceSectionIds: ['CTRL-1'] }] })[0]?.text === 'Sentence');

process.env.RI_AI_EXECUTION_ENABLED = 'true';
process.env.FORGENIQ_STAGE3_AI = 'ANTHROPIC';
const stageRun = (claims, extra = {}) =>
  runLifecycleStageAnalysis({
    stage: 3,
    organisationId: 'org-test',
    idempotencyKey: `stage3:${Math.random()}`,
    sourceSections: [{ sourceSectionId: 'IMP-1', citation: 'impact', text: 'Impact text.' }, ...sections],
    evidencePack: pack,
    providerOverride: {
      id: 'mock-live',
      async execute() {
        return {
          ok: true,
          structured: { confidence: 60, riskProposals: [{ title: 'T', description: 'D', category: 'Compliance' }], claims, ...extra },
          latencyMs: 5,
          inputTokenEstimate: 10,
          outputTokenEstimate: 4,
        };
      },
    },
  });
const mixed = await stageRun([
  { claim: 'Grounded', sourceSectionIds: ['REG-1'], sourceQuotation: 'notify the borrower', provisionReference: 'CONC 7.20.1R' },
  { claim: 'Fabricated', sourceSectionIds: ['REG-1'], sourceQuotation: 'invented text' },
]);
check('mock-live: fabricated claim dropped, grounded claim persisted, raw output preserved', mixed.ok && mixed.structured.claims.length === 1 && mixed.rawStructured.claims.length === 2 && mixed.evidence.rejected.length === 1, JSON.stringify(mixed).slice(0, 200));
const allFabricated = await stageRun([{ claim: 'Fabricated', sourceSectionIds: ['REG-1'], sourceQuotation: 'invented text' }]);
check('mock-live: all-fabricated output fails closed', !allFabricated.ok && allFabricated.code === 'AI_OUTPUT_CITATION_UNVERIFIED' && allFabricated.failClosed === true, JSON.stringify(allFabricated).slice(0, 200));

// ---- 5. Risk rating policy ---------------------------------------------------------------------------------
const unreasoned = riskPolicy.applyRiskRatingPolicy({ inherent_risk: 'High', residual_risk: 'Medium' });
check('rating without rationale is not kept; nothing defaults to MEDIUM', unreasoned.inherent_risk === 'UNASSESSED' && unreasoned.residual_risk === 'UNASSESSED');
const reasoned = riskPolicy.applyRiskRatingPolicy({
  inherent_risk: 'High',
  inherent_rationale: 'CONC 7.20.1R(2) is a binding rule: a missed notification breaches it and exposes borrowers to unnoticed charges.',
  residual_risk: 'Medium',
  residual_rationale: 'Controls would reduce the likelihood of a missed notification considerably.',
});
check('reasoned inherent rating is kept but labelled provisional; residual stays UNASSESSED without control evidence', reasoned.inherent_risk === 'HIGH (provisional)' && reasoned.residual_risk === 'UNASSESSED' && reasoned.notes.includes('model_residual_rating_discarded_no_control_effectiveness_evidence'));
const withEvidence = riskPolicy.applyRiskRatingPolicy(
  { inherent_risk: 'HIGH', inherent_rationale: 'x'.repeat(50), residual_risk: 'LOW', residual_rationale: 'y'.repeat(50) },
  { controlEffectivenessEvidence: [{ controlId: 'c1', result: 'EFFECTIVE' }] },
);
check('residual rating allowed only with supplied control-effectiveness evidence', withEvidence.residual_risk === 'LOW (provisional)' && withEvidence.controlEvidenceRefs[0] === 'c1');
const riskDraft = mapRiskMappingToDraftFields({ structured: { confidence: 55, riskProposals: [{ title: 'R', description: 'D', category: 'Compliance', inherent_risk: 'HIGH', residual_risk: 'MEDIUM' }, { title: 'R2' }] } });
check('risk mapper: no invented rating, all proposals retained, residual guidance recorded', riskDraft.inherent_risk === 'UNASSESSED' && riskDraft.residual_risk === 'UNASSESSED' && riskDraft.stage3Metadata.riskProposals.length === 2 && riskDraft.stage3Metadata.humanConfirmationRequired.some((s) => /Residual risk is unassessed/.test(s)));
const riskNoProposal = mapRiskMappingToDraftFields({ structured: { confidence: 10, claims: [] } });
check('risk mapper: empty output no longer defaults to MEDIUM/MEDIUM', riskNoProposal.inherent_risk === 'UNASSESSED' && riskNoProposal.residual_risk === 'UNASSESSED');

// ---- 6. Control coverage ------------------------------------------------------------------------------------
const reconciliationOnly = coverageMod.assessControlCoverage(
  [
    {
      name: 'Missed payment detection and exception monitoring',
      coverage: [{ obligationLimb: 'CONC 7.20.1R(1)', category: 'detection', justification: 'Daily reconciliation identifies a missed payment as defined in (1).' }],
    },
  ],
  pack,
);
const gapKeys = reconciliationOnly.ruleLimbGaps.map((g) => `${g.reference}|${g.category}`);
check('payment reconciliation alone leaves notification, information and timeliness uncovered', ['CONC 7.20.1R(2)(a)|notification', 'CONC 7.20.1R(2)(b)|information_completeness', 'CONC 7.20.1R(3)|information_completeness', 'CONC 7.20.1R(2)|timeliness'].every((k) => gapKeys.includes(k)) && reconciliationOnly.complete === false, JSON.stringify(gapKeys));
const fullSet = coverageMod.assessControlCoverage(
  [
    { name: 'Notice', coverage: [
      { obligationLimb: 'CONC 7.20.1R(2)(a)', category: 'notification', justification: 'Template states that the missed payment occurred and the unpaid sums.' },
      { obligationLimb: 'CONC 7.20.1R(2)', category: 'timeliness', justification: 'SLA clock starts at the missed payment and escalates unsent notices.' },
    ] },
    { name: 'Information pack', coverage: [
      { obligationLimb: 'CONC 7.20.1R(2)(b)', category: 'information_completeness', justification: 'Checklist covers agreement, consequences and mitigation steps.' },
      { obligationLimb: 'CONC 7.20.1R(3)', category: 'information_completeness', justification: 'A single combined letter is generated so information goes together.' },
    ] },
    { name: 'Detection', coverage: [{ obligationLimb: 'CONC 7.20.1R(1)', category: 'detection', justification: 'Reconciliation identifies missed payments as defined in (1).' }] },
  ],
  pack,
);
check('a control set covering every limb has no rule-limb gaps', fullSet.complete === true && fullSet.ruleLimbGaps.length === 0, JSON.stringify(fullSet.ruleLimbGaps));
const badClaims = coverageMod.assessControlCoverage(
  [{ name: 'X', coverage: [
    { obligationLimb: 'CONC 7.20.1R(2)(a)', category: 'notification', justification: 'short' },
    { obligationLimb: 'CONC 9.9.9R(1)', category: 'notification', justification: 'This limb does not exist in the provision.' },
    { obligationLimb: 'CONC 7.20.1R(2)(a)', category: 'magic', justification: 'Unknown category claimed here for the test.' },
  ] }],
  pack,
);
const reasons = badClaims.perProposal[0].rejected.map((r) => r.reason);
check('unjustified, unknown-limb and unknown-category coverage claims are rejected', reasons.includes('coverage_justification_missing_or_too_short') && reasons.includes('limb_not_in_platform_breakdown') && reasons.includes('unknown_control_category') && badClaims.perProposal[0].accepted.length === 0, JSON.stringify(reasons));
const controlDraft = mapControlMappingToDraftFields({
  structured: {
    confidence: 40,
    controlProposals: [
      { name: 'Reconciliation', description: 'Daily reconciliation.', control_type: 'Detective', effectiveness: 'EFFECTIVE', coverage: [{ obligationLimb: 'CONC 7.20.1R(1)', category: 'detection', justification: 'Identifies missed payments as defined in (1).' }] },
      { name: 'Borrower notice', description: 'Notice template.', control_type: 'Preventive', coverage: [
        { obligationLimb: 'CONC 7.20.1R(2)(a)', category: 'notification', justification: 'Notice states the missed payment and unpaid sums.' },
        { obligationLimb: 'CONC 7.20.1R(2)', category: 'timeliness', justification: 'Notice is issued under a tracked SLA.' },
      ] },
    ],
  },
  pack,
});
check('control mapper: all proposals retained; primary is the one covering most; effectiveness never asserted', controlDraft.stage4Metadata.controlProposals.length === 2 && controlDraft.name === 'Borrower notice' && controlDraft.effectiveness === 'NOT_TESTED', JSON.stringify([controlDraft.name, controlDraft.effectiveness]));
check('control mapper: uncovered requirements stated for human decision, none invented', /Requirement gaps not covered/.test(controlDraft.description) && controlDraft.stage4Metadata.controlCoverage.ruleLimbGaps.length > 0);

// ---- 7. Assurance truncation regression ----------------------------------------------------------------------
const steps = Array.from({ length: 9 }, (_, i) => `Step ${i + 1}: ${'inspect the notification evidence for the sampled borrower and compare it with the rule. '.repeat(4)}`);
check('fixture plan is longer than the old 1500-character procedure limit', steps.join('\n').length > 1500);
const longPlan = mapAssurancePlanToDraftFields({
  structured: { confidence: 60, testPlan: { reviewType: 'control_test', objective: 'Test it.', procedure: steps, evidenceRequirements: ['Notice copies', 'Send logs'], frequency: 'Quarterly' }, claims: [] },
});
check('procedure array is rendered in full (all 9 steps, last step intact)', steps.every((_, i) => longPlan.notes.includes(`${i + 1}. Step ${i + 1}:`)) && longPlan.notes.includes(steps[8].slice(-40)) && !longPlan.notesTruncated);
check('evidence array is a numbered list, not comma-joined', /Evidence:\n1\. Notice copies\n2\. Send logs/.test(longPlan.notes));
check('frequency is persisted', /Frequency: Quarterly/.test(longPlan.notes));
const stringPlan = mapAssurancePlanToDraftFields({ structured: { testPlan: { procedure: 'P'.repeat(3000), evidenceRequirements: 'E'.repeat(2500) } } });
check('3000-character procedure and 2500-character evidence string are not cut (old limits 1500 / 1000)', stringPlan.notes.includes('P'.repeat(3000)) && stringPlan.notes.includes('E'.repeat(2500)));
const hugePlan = mapAssurancePlanToDraftFields({ structured: { testPlan: { objective: 'O', procedure: Array.from({ length: 200 }, (_, i) => `Line ${i} ${'z'.repeat(60)}`) } } });
check('over the column limit the cut is on a line boundary, marked, flagged, and the full plan is kept', hugePlan.notesTruncated === true && hugePlan.notes.length <= ASSURANCE_NOTES_MAX_CHARS && /\[TRUNCATED — \d+ characters omitted/.test(hugePlan.notes) && hugePlan.stage5Metadata.notesTruncated === true && hugePlan.stage5Metadata.fullTestPlan.procedure.length === 200);
check('provider telemetry shows the pilot output was not token-truncated (stop_reason end_turn)', (() => {
  const saved = JSON.parse(readFileSync(join(repoRoot, 'docs/uat/evidence/live-ai-pilot-2026-11-26/saved-outputs/stage2-5-records-as-persisted.json'), 'utf8'));
  const t = saved.assurance.metadata.stage5Ai.telemetry;
  return t.stopReason === 'end_turn' && t.outputTokens < 8192;
})());

// ---- 8. Saved pilot outputs: deterministic evaluation, originals intact ---------------------------------------
const manifest = verifyManifest();
check('original pilot evidence is byte-identical to the manifest', manifest.ok === true, JSON.stringify(manifest));
const evaluation = await runEvaluation();
check('evaluation made no paid AI call', evaluation.paidAiCalls === 0);
const ids = (cat) => new Set(evaluation[cat].map((i) => i.id));
check('evaluation: consultation mislabel and missing commencement are incorrect findings', ids('incorrect_findings').has('provision_labelled_consultation_proposal') && ids('incorrect_findings').has('effective_date_missing'));
check('evaluation: (2)(b) and (3) never carried downstream', ids('missing_requirements').has('limb_never_carried_downstream:CONC 7.20.1R(2)(b)') && ids('missing_requirements').has('limb_never_carried_downstream:CONC 7.20.1R(3)'));
check('evaluation: every downstream stage has insufficient citations', [2, 3, 4, 5].every((s) => ids('insufficient_citations').has(`stage${s}_citations`)));
check('evaluation: unjustified risk ratings and control gap identified', ids('unjustified_risk_ratings').has('inherent_rating_without_rationale') && ids('unjustified_risk_ratings').has('residual_rating_without_control_evidence') && ids('control_gaps').has('control_does_not_address_borrower_notification'));
check('evaluation: assurance truncation at 1500 identified in the saved record', ids('assurance_deficiencies').has('procedure_truncated_at_1500'));
check('evaluation also records correct findings (no one-sided audit)', evaluation.correct_findings.length >= 3);

if (fail > 0) {
  console.error(`pilot accuracy hardening: ${fail} failure(s)`);
  process.exit(1);
}
console.log('PASS acceptance-ri-pilot-accuracy-hardening');
