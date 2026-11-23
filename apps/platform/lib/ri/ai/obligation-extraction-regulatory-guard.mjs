/**
 * Post-model regulatory guards for UC-RI-005 obligation extraction (fail-closed).
 * Does not weaken quotation verification — augments candidates before persistence.
 */
import {
  evaluateProvisionEligibility,
  parseProvisionReference,
  provisionMarkersInText,
  PROVISION_FUNCTIONS,
  PROVISION_TEXT_STATUS,
} from '../classification/provision-eligibility.mjs';

const NON_BINDING_NATURES = new Set(['guidance', 'explanatory_commentary', 'consultation_proposal', 'unknown']);

/**
 * @param {{ publicationClassification?: string, regulatoryStatus?: string, consultationPreserved?: boolean, isFinalisedGuidance?: boolean } | null | undefined} regulatoryAnalysis
 */
export function resolvePublicationRegulatoryContext(regulatoryAnalysis) {
  const consultationPreserved = regulatoryAnalysis?.consultationPreserved === true;
  const isFinalisedGuidance = regulatoryAnalysis?.isFinalisedGuidance === true;
  const status = String(regulatoryAnalysis?.regulatoryStatus || '').toLowerCase();
  const classification = String(regulatoryAnalysis?.publicationClassification || '').toLowerCase();
  const legalInstrumentText =
    !consultationPreserved &&
    !isFinalisedGuidance &&
    (status.includes('policy') || status.includes('instrument') || classification.includes('policy statement'));
  const mustNotPresentAsIndependentBinding = consultationPreserved || isFinalisedGuidance;
  return {
    consultationPreserved,
    isFinalisedGuidance,
    legalInstrumentText,
    mustNotPresentAsIndependentBinding,
    documentType: consultationPreserved
      ? 'consultation'
      : isFinalisedGuidance
        ? 'finalised_guidance'
        : legalInstrumentText
          ? 'legal_instrument'
          : 'regulatory_publication',
  };
}

/**
 * Unique provision cores set out (no sourcebook prefix) in quotation.
 * @param {string} quotation
 */
export function uniqueSetOutProvisionCoresInQuotation(quotation) {
  const markers = provisionMarkersInText(String(quotation || '')).filter((m) => m.setOut && m.marker === 'R');
  const cores = [...new Set(markers.map((m) => m.core))];
  return cores;
}

/**
 * @param {string} blob
 * @param {string} [sourcebook]
 * @returns {{ ref: string, core: string, unique: boolean } | { ambiguous: true, cores: string[] }}
 */
export function inferProvisionReferenceFromEvidence(blob, sourcebook = 'CONC') {
  const setOut = uniqueSetOutProvisionCoresInQuotation(blob);
  if (setOut.length === 1) {
    const ref = parseProvisionReference(`${sourcebook} ${setOut[0]}`);
    if (ref) {
      return {
        ref: ref.sourcebook ? `${ref.sourcebook} ${ref.core}` : ref.core,
        core: ref.core,
        unique: true,
      };
    }
  }
  const prefixed = [
    ...String(blob || '').matchAll(
      /\b(CONC|PRIN|SYSC|COBS|ICOBS|CONC|GEN|DTR|MAR)\s+((?:\d{1,2}[A-Z]?\.){1,3}\d{1,3}[A-Z]?)\s*(R|E|G)\b/gi,
    ),
  ].map((m) => parseProvisionReference(`${m[1]} ${m[2].replace(/\s+/g, '')}${m[3].toUpperCase()}`)).filter(Boolean);
  const cores = [...new Set(prefixed.map((p) => p.core))];
  if (cores.length === 1 && setOut.length === 0) {
    const p = prefixed.find((x) => x.core === cores[0]);
    return {
      ref: p.sourcebook ? `${p.sourcebook} ${p.core}` : p.core,
      core: p.core,
      unique: false,
      crossReferenceOnly: true,
    };
  }
  if (cores.length > 1 || setOut.length > 1) {
    return { ambiguous: true, cores: [...new Set([...setOut, ...cores])] };
  }
  return null;
}

/**
 * @param {object} candidate
 * @param {string[]} sourceSectionIds
 * @param {Array<{ sourceSectionId: string, inLegalInstrument?: boolean, provisionsSetOut?: string[], provisionTextStatus?: Record<string, string>, transitionalProvisions?: boolean, excerpt?: string }>} sectionCatalog
 * @param {ReturnType<typeof resolvePublicationRegulatoryContext>} pubCtx
 */
export function applyObligationCandidateRegulatoryGuard(candidate, sourceSectionIds, sectionCatalog, pubCtx) {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const sections = (sectionCatalog || []).filter((s) => sourceSectionIds.includes(s.sourceSectionId));
  const quotation = String(candidate.sourceQuotation || candidate.statement || '');
  const guard = {
    documentType: pubCtx.documentType,
    mustNotPresentAsIndependentBinding: pubCtx.mustNotPresentAsIndependentBinding,
  };

  if (!candidate.provisionReference) {
    const inferred = inferProvisionReferenceFromEvidence(quotation);
    if (inferred && !inferred.ambiguous && inferred.ref) {
      if (inferred.crossReferenceOnly && !inferred.unique) {
        candidate._provisionReferenceInference = 'cross_reference_only_not_inferred';
        guard.provisionReferenceRoute = 'EXCEPTION';
        guard.provisionReferenceReason = 'cross_reference_without_set_out_quotation';
      } else {
        candidate.provisionReference = inferred.ref;
        candidate._provisionReferenceInference = 'verified_unique_set_out';
      }
    } else if (inferred?.ambiguous) {
      candidate._provisionReferenceInference = 'ambiguous';
      guard.provisionReferenceRoute = 'EXCEPTION';
      guard.provisionReferenceReason = 'ambiguous_provision_reference';
    }
  }

  const ref = candidate.provisionReference ? parseProvisionReference(candidate.provisionReference) : null;
  if (ref) {
    candidate.regulatoryClassificationCode = ref.marker;
    const setOutInQuote = uniqueSetOutProvisionCoresInQuotation(quotation).includes(ref.core);
    const sectionWithSetOut = sections.find((s) => (s.provisionsSetOut || []).includes(ref.core));
    guard.provisionSetOutInQuotation = setOutInQuote;
    guard.provisionSetOutInSection = Boolean(sectionWithSetOut);
    guard.inLegalInstrumentSection = sections.some((s) => s.inLegalInstrument === true);

    const eligibility = evaluateProvisionEligibility({
      code: ref.marker,
      legalStatus: ref.marker === 'R' ? 'binding' : 'guidance',
      provisionReference: candidate.provisionReference,
      provisionFunction: PROVISION_FUNCTIONS.OPERATIVE,
      quotation,
      citedSections: sections.map((s) => ({
        inLegalInstrument: s.inLegalInstrument,
        transitionalProvisions: s.transitionalProvisions,
        provisionsSetOut: s.provisionsSetOut,
        provisionTextStatus: s.provisionTextStatus,
      })),
    });
    guard.conversionEligibilityRoute = eligibility.route;
    guard.conversionEligibilityReasons = eligibility.reasons;

    if (pubCtx.mustNotPresentAsIndependentBinding && candidate.bindingNature === 'binding_requirement') {
      candidate.bindingNature = pubCtx.isFinalisedGuidance ? 'finalised_guidance_expectation' : 'consultation_proposal';
      candidate._bindingNatureGuarded = 'must_not_present_as_independent_binding';
    } else if (
      candidate.bindingNature === 'binding_requirement' &&
      (!setOutInQuote || eligibility.route !== 'OBLIGATION')
    ) {
      if (eligibility.route === 'EXCEPTION') {
        guard.regulatoryClassificationRoute = 'EXCEPTION';
        candidate._regulatoryClassificationRoute = 'EXCEPTION';
        candidate._bindingNatureGuarded = 'conversion_not_supported';
        if (!NON_BINDING_NATURES.has(candidate.bindingNature)) {
          candidate.bindingNature = 'guidance';
        }
      } else if (!setOutInQuote && sectionWithSetOut) {
        guard.regulatoryClassificationRoute = 'EXCEPTION';
        candidate._regulatoryClassificationRoute = 'EXCEPTION';
        candidate._bindingNatureGuarded = 'quotation_not_set_out_for_core';
        candidate.bindingNature = 'guidance';
      }
    }
  } else if (candidate.bindingNature === 'binding_requirement' && pubCtx.mustNotPresentAsIndependentBinding) {
    candidate.bindingNature = 'guidance';
    candidate._bindingNatureGuarded = 'binding_without_provision_reference';
  }

  candidate._forgeniqRegulatoryGuard = guard;
  return candidate;
}