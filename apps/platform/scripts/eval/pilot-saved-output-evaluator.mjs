/**
 * Deterministic evaluation of the saved FCA-EVAL-001 pilot outputs. No provider call, no network.
 *
 * Inputs are the persisted pilot records exactly as saved (they are never modified); findings are derived from
 * the platform's own deterministic modules and the FCA instrument text, so each is reproducible.
 */
import { analyzeInstrumentLegalStatus, resolveProvisionCommencement } from '../../../../integrations/regulatory-sources/core/instrument-legal-status.mjs';
import { analyzeRegulatoryPdfDocument } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';
import { breakDownProvision, extractProvisionText, quotationLimbCoverage, normaliseForMatch } from '../../lib/ri/ai/provision-breakdown.mjs';
import { buildRegulatoryEvidencePack } from '../../lib/ri/ai/lifecycle-evidence.mjs';
import { assessControlCoverage } from '../../lib/ri/ai/control-coverage.mjs';

export const EVALUATION_CATEGORIES = Object.freeze([
  'correct_findings',
  'incorrect_findings',
  'missing_requirements',
  'unsupported_statements',
  'insufficient_citations',
  'unjustified_risk_ratings',
  'control_gaps',
  'assurance_deficiencies',
]);

const INTERNAL_ID = /^(OBL|IMP|RISK|CTRL)-\d+$/;

function claimsOf(meta, key) {
  return Array.isArray(meta?.[key]?.citations) ? meta[key].citations : [];
}

function aiClaimsOf(meta, key) {
  return Array.isArray(meta?.[key]?.aiClaims) ? meta[key].aiClaims : [];
}

/**
 * @param {{
 *   pages: Array<{ pageNumber: number, text: string }>,
 *   stage1Candidate: Record<string, any>,
 *   stage1RegulatoryContext: Record<string, any>,
 *   records: { obligation: any, impact: any, risk: any, control: any, assurance: any },
 *   provisionReference?: string,
 * }} input
 */
export function evaluateSavedPilotOutputs(input) {
  const out = Object.fromEntries(EVALUATION_CATEGORIES.map((c) => [c, []]));
  const add = (category, item) => out[category].push(item);
  const { records } = input;
  const core = '7.20.1R';

  const instrument = analyzeInstrumentLegalStatus(input.pages);
  const analysis = analyzeRegulatoryPdfDocument({ structured: { pages: input.pages }, publicationMetadata: {} });
  const provisionText = extractProvisionText(input.pages, core);
  const breakdown = provisionText ? breakDownProvision(core, provisionText.text, { pages: provisionText.pages }) : null;
  const commencement = provisionText
    ? resolveProvisionCommencement(instrument, { page: provisionText.pages[0], provisionReference: 'CONC 7.20.1R' })
    : null;

  // ---- Stage 1 ------------------------------------------------------------
  const c1 = input.stage1Candidate;
  if (c1.provisionReference === 'CONC 7.20.1R' && c1.regulatoryClassificationCode === 'R') {
    add('correct_findings', { stage: 1, id: 'provision_reference_and_code', detail: 'CONC 7.20.1R identified with classification code R, matching the instrument.' });
  }
  if (breakdown?.parsed && /7\.20\.1R\(4\)/.test(String(c1.applicabilityConditions || ''))) {
    add('correct_findings', { stage: 1, id: 'definition_limb_noted', detail: 'Applicability text correctly records the (4) exclusion of non-compliance charges from "payment".' });
  }
  if (analysis.documentLegalStatus === 'final_made_instrument' && c1.bindingNature === 'consultation_proposal') {
    add('incorrect_findings', {
      stage: 1,
      id: 'provision_labelled_consultation_proposal',
      detail: 'The candidate was labelled consultation_proposal and the run context was "consultation", but the publication contains the made instrument (FCA 2026/2).',
      evidence: { pilotDocumentType: input.stage1RegulatoryContext?.documentType, platformDocumentLegalStatus: analysis.documentLegalStatus, instrument: instrument.title },
    });
  }
  if (c1.effectiveDate == null && commencement?.status === 'resolved') {
    add('incorrect_findings', {
      stage: 1,
      id: 'effective_date_missing',
      detail: `effectiveDate was null; the instrument states commencement ${commencement.commencementDate} (${commencement.evidence?.[0]?.quotation}).`,
      evidence: commencement.evidence,
    });
  }
  if (breakdown?.parsed) {
    const coverage = quotationLimbCoverage(breakdown, c1.sourceQuotation || '');
    if (coverage.onlyConditionOrDefinition) {
      add('incorrect_findings', {
        stage: 1,
        id: 'quotation_covers_applicability_limb_only',
        detail: `The model's verbatim quotation covers only ${coverage.coveredReferences.join(', ')} (an applicability condition); the operative duty text was supplied later by the reviewer.`,
      });
    }
    const stmt = normaliseForMatch(c1.statement || '');
    for (const path of breakdown.standaloneObligationPaths) {
      const limb = breakdown.limbs.find((l) => l.reference === path);
      const probe = normaliseForMatch(limb.text).slice(0, 40);
      if (!stmt.includes(probe)) {
        add('missing_requirements', { stage: 1, id: `limb_not_in_candidate:${path}`, detail: `${path} is a standalone mandatory limb not reproduced verbatim in the extracted candidate.`, limbKind: limb.kind });
      }
    }
  }
  if (/truncated \('7\.20\.1R or'\)/.test(String(c1.applicabilityConditions || ''))) {
    add('incorrect_findings', {
      stage: 1,
      id: 'authoritative_excerpt_started_at_cross_reference',
      detail: 'The authoritative excerpt supplied to the model began at a cross-reference ("CONC 7.20.1R or ...") on p.94 instead of where the rule is set out, so the model reported the excerpt as truncated.',
    });
  }

  // ---- Obligation as persisted / downstream carry-through --------------------
  const obligation = records.obligation;
  const oblText = normaliseForMatch(`${obligation.obligation_statement} ${obligation.metadata?.sourceQuotation ?? ''}`);
  const downstreamText = normaliseForMatch(
    [records.impact?.compliance_impact, records.risk?.description, records.control?.description, records.assurance?.notes].join(' '),
  );
  if (breakdown?.parsed) {
    for (const path of breakdown.standaloneObligationPaths) {
      const limb = breakdown.limbs.find((l) => l.reference === path);
      const probe = normaliseForMatch(limb.text).slice(0, 40);
      const inObligation = oblText.includes(probe);
      if (!inObligation) {
        add('missing_requirements', {
          stage: '1-5',
          id: `limb_never_carried_downstream:${path}`,
          detail: `${path} (${limb.kind}) is absent from the materialised obligation, and therefore from the impact, risk, control and assurance records.`,
          carriedInDownstreamText: downstreamText.includes(probe),
        });
      }
    }
  }

  // ---- Stage 2-5 citations -----------------------------------------------------
  const stageDefs = [
    ['stage2Ai', 'impact', 2],
    ['stage3Ai', 'risk', 3],
    ['stage4Ai', 'control', 4],
    ['stage5Ai', 'assurance', 5],
  ];
  for (const [key, recordKey, stage] of stageDefs) {
    const meta = records[recordKey]?.metadata;
    const citations = claimsOf(meta, key);
    const withQuote = citations.filter((c) => c.sourceQuotation).length;
    const withProvision = citations.filter((c) => c.provisionReference).length;
    const internalOnly = citations.filter((c) => (c.sourceSectionIds || []).length && (c.sourceSectionIds || []).every((id) => INTERNAL_ID.test(id))).length;
    const textMissing = citations.filter((c) => !c.text).length;
    add('insufficient_citations', {
      stage,
      id: `stage${stage}_citations`,
      detail: `${citations.length} claim(s): ${withQuote} with a quotation, ${withProvision} with a provision reference, ${internalOnly} citing only an internal section identifier.`,
      claimCount: citations.length,
      withQuotation: withQuote,
      withProvisionReference: withProvision,
      internalIdentifierOnly: internalOnly,
    });
    if (textMissing) {
      add('insufficient_citations', {
        stage,
        id: `stage${stage}_claim_text_not_persisted`,
        detail: `${textMissing} citation row(s) have text null because the provider returned the sentence under "claim" and the mapper only read "text" (the sentence survives only in aiClaims).`,
        aiClaimsRetained: aiClaimsOf(meta, key).length,
      });
    }
  }
  for (const claim of claimsOf(records.impact?.metadata, 'stage2Ai')) {
    if (/as soon as possible/i.test(claim.text || '') || /notify the borrower/i.test(claim.text || '')) {
      add('correct_findings', { stage: 2, id: 'impact_restates_notification_and_timing', detail: 'Impact claim correctly restates the (2)(a) notification duty and the "as soon as possible" timing.' });
      break;
    }
  }

  // ---- Risk ratings -----------------------------------------------------------
  const risk = records.risk;
  const rationalePresent = /rationale|because|given that|since /i.test(risk.description || '') && /\b(high|medium|low)\b.{0,80}\b(because|given|due to)\b/i.test(risk.description || '');
  if (risk.inherent_risk && !rationalePresent) {
    add('unjustified_risk_ratings', { stage: 3, id: 'inherent_rating_without_rationale', detail: `inherent_risk "${risk.inherent_risk}" is stored with no documented rationale in the record.` });
  }
  const hasControlEvidence = Array.isArray(risk.metadata?.stage3Ai?.ratingAssessment?.controlEvidenceRefs) && risk.metadata.stage3Ai.ratingAssessment.controlEvidenceRefs.length > 0;
  if (risk.residual_risk && !hasControlEvidence) {
    add('unjustified_risk_ratings', { stage: 3, id: 'residual_rating_without_control_evidence', detail: `residual_risk "${risk.residual_risk}" was set although no control-effectiveness evidence existed (the mapper defaulted it).` });
  }
  if (records.impact?.materiality && records.impact?.metadata?.stage2Ai?.aiConfidence != null) {
    add('unjustified_risk_ratings', {
      stage: 2,
      id: 'impact_materiality_from_model_confidence',
      detail: `Impact materiality "${records.impact.materiality}" and complexity "${records.impact.implementation_complexity}" are computed from model confidence (${records.impact.metadata.stage2Ai.aiConfidence}%) and the count of impact dimensions, not from regulatory or organisational evidence. Left unchanged; flagged for expert review.`,
    });
  }

  // ---- Control mapping --------------------------------------------------------
  const pack = buildRegulatoryEvidencePack({
    ...obligation,
    metadata: { ...obligation.metadata, provisionBreakdown: breakdown },
  });
  const control = records.control;
  const controlText = `${control.name}. ${control.description}`;
  const claimedCategories = [];
  if (/detect|reconcil|monitor/i.test(controlText)) claimedCategories.push('detection');
  if (/notif|inform|letter|email|communicat/i.test(controlText) && /borrower|customer/i.test(controlText)) claimedCategories.push('notification');
  const assessed = assessControlCoverage(
    [{ name: control.name, coverage: claimedCategories.map((c) => ({ obligationLimb: c === 'detection' ? 'CONC 7.20.1R(1)' : 'CONC 7.20.1R(2)(a)', category: c, justification: 'Derived from the saved control wording by the evaluator, not asserted by the model.' })) }],
    pack,
  );
  if (!claimedCategories.includes('notification')) {
    add('control_gaps', {
      stage: 4,
      id: 'control_does_not_address_borrower_notification',
      detail: 'The control detects and logs missed payments internally; nothing in it notifies the borrower or delivers the (2)(b) information, which is what CONC 7.20.1R(2) requires.',
    });
  }
  for (const g of assessed.ruleLimbGaps) {
    add('control_gaps', { stage: 4, id: `requirement_uncovered:${g.reference}:${g.category}`, detail: `No coverage for ${g.reference} (${g.category}).` });
  }
  if (/automated daily reconciliation/i.test(control.description) && !/reconciliation/i.test(`${obligation.obligation_statement} ${risk.description}`)) {
    add('unsupported_statements', {
      stage: 4,
      id: 'control_mechanism_not_in_evidence',
      detail: 'The control specifies an "automated daily reconciliation" mechanism that appears in neither the obligation nor the risk record. It is a proposal, not an organisational fact, but the record reads like an existing control.',
    });
  }
  if (/whether the automated daily reconciliation/i.test(records.assurance?.notes || '') || /the control is an automated/i.test(JSON.stringify(aiClaimsOf(records.assurance?.metadata, 'stage5Ai')))) {
    add('unsupported_statements', {
      stage: 5,
      id: 'assurance_treats_proposed_control_as_existing',
      detail: 'The assurance claims state "the control is an automated daily reconciliation ..." as if it were in operation; no organisational control evidence was supplied.',
    });
  }

  // ---- Assurance --------------------------------------------------------------
  const notes = records.assurance?.notes || '';
  const procedureMatch = /Procedure: ([\s\S]*?)\n\nEvidence:/.exec(notes);
  if (procedureMatch && procedureMatch[1].length === 1500) {
    add('assurance_deficiencies', {
      stage: 5,
      id: 'procedure_truncated_at_1500',
      detail: `The Procedure section is exactly 1500 characters and stops mid-sentence ("...${procedureMatch[1].slice(-40)}"). Cause: assurance-plan-mapper sliced it to 1500 characters.`,
      characters: procedureMatch[1].length,
    });
  }
  if (/\w,[A-Z]/.test((/Evidence: ([\s\S]*?)\n\nRequires human/.exec(notes) || [])[1] || '')) {
    add('assurance_deficiencies', {
      stage: 5,
      id: 'evidence_list_flattened',
      detail: 'The evidence requirements were an array coerced to one string with bare commas ("...Procedure,Full obligation..."), losing the list structure.',
    });
  }
  if (!/Frequency:/i.test(notes)) {
    add('assurance_deficiencies', { stage: 5, id: 'frequency_not_persisted', detail: 'The plan frequency was requested but never written to the notes.' });
  }
  if (!/notif/i.test(notes)) {
    add('assurance_deficiencies', { stage: 5, id: 'plan_does_not_test_regulatory_outcome', detail: 'The test plan covers reconciliation operation, not whether borrowers were notified correctly and in time.' });
  }
  if (/provisional/i.test(notes) && /no conclusion on effectiveness/i.test(notes)) {
    add('correct_findings', { stage: 5, id: 'assurance_appropriately_provisional', detail: 'The plan makes no effectiveness conclusion and states it is provisional.' });
  }

  const counts = Object.fromEntries(EVALUATION_CATEGORIES.map((c) => [c, out[c].length]));
  return {
    evaluatorVersion: 'pilot-saved-output-evaluator-v1',
    paidAiCalls: 0,
    provisionBreakdown: breakdown && { reference: breakdown.reference, standaloneObligationPaths: breakdown.standaloneObligationPaths, limbCount: breakdown.limbs.length },
    commencement,
    documentLegalStatus: analysis.documentLegalStatus,
    counts,
    ...out,
  };
}
