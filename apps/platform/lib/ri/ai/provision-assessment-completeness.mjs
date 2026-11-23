/**
 * Deterministic per-provision assessment outcomes for UC-RI-005 batches.
 * Distinguishes AI interpretation from pipeline completeness (fail-closed).
 */
import { parseProvisionReference } from '../classification/provision-eligibility.mjs';
import { provisionCoreAliases } from '../classification/provision-core-keys.mjs';

/** Cores supplied to the model for this run (from persisted grounding). */
export function suppliedProvisionCoresFromGrounding(grounding) {
  if (!grounding || typeof grounding !== 'object') return [];
  const explicit = grounding.extractionBatch?.instrumentProvisionsNewlySupplied;
  if (Array.isArray(explicit) && explicit.length) return [...new Set(explicit)];
  const fromSections = (grounding.sectionCatalog || []).flatMap((s) => s.provisionsSetOut || []);
  return [...new Set(fromSections)].filter(Boolean);
}

export const PROVISION_ASSESSMENT_OUTCOME = Object.freeze({
  ASSESSED_STRUCTURED: 'assessed_structured',
  ASSESSED_TEXT_ONLY: 'assessed_text_only',
  OMITTED: 'omitted',
  MISCLASSIFIED_BINDING: 'misclassified_binding',
  AMBIGUOUS_REFERENCE: 'ambiguous_reference',
  NOT_IN_BATCH_SCOPE: 'not_in_batch_scope',
});

function normCore(refOrCore) {
  const p = parseProvisionReference(String(refOrCore || ''));
  if (p?.core) return p.core;
  return String(refOrCore || '')
    .replace(/^CONC\s+/i, '')
    .replace(/\s+/g, '');
}

function corePattern(core) {
  const normalized = String(core || '').replace(/\s+/g, '');
  const m = normalized.match(/^([\dA-Z.]+?)(\d)([RGDE])$/i);
  if (!m) {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }
  const [, prefix, lastDigit, suffix] = m;
  return new RegExp(`${prefix.replace(/\./g, '\\.')}${lastDigit}\\s*${suffix}\\b`, 'i');
}

function collectSignals(candidates, claims) {
  const signals = [];
  for (const c of candidates || []) {
    const blob = [c.provisionReference, c.statement, c.sourceQuotation, c.citation].filter(Boolean).join('\n');
    const coreFromRef = c.provisionReference ? normCore(c.provisionReference) : null;
    signals.push({
      coreFromRef,
      bindingNature: c.bindingNature,
      text: blob,
      structuredReference: Boolean(c.provisionReference),
      regulatoryGuard: c._forgeniqRegulatoryGuard || null,
      regulatoryRoute: c._regulatoryClassificationRoute || null,
    });
  }
  for (const c of claims || []) {
    signals.push({
      coreFromRef: c.provisionReference ? normCore(c.provisionReference) : null,
      bindingNature: c.bindingNature,
      text: c.text || '',
      structuredReference: Boolean(c.provisionReference),
      regulatoryGuard: null,
      regulatoryRoute: null,
    });
  }
  return signals;
}

function matchesCore(signals, core) {
  const re = corePattern(core);
  const aliases = new Set(provisionCoreAliases(core));
  return signals.filter((s) => {
    if (s.coreFromRef && aliases.has(s.coreFromRef)) return true;
    if (re.test(s.text || '')) return true;
    return false;
  });
}

/**
 * @param {{
 *   suppliedCores: string[],
 *   candidates?: object[],
 *   claims?: object[],
 *   provisionScopedExtraction?: { excerpts?: { provisionCore: string, authoritativeExcerpt?: string }[] },
 *   deterministicCandidates?: object[],
 * }} input
 */
export function assessBatchProvisionCompleteness(input) {
  const supplied = [...new Set(input.suppliedCores || [])].sort();
  const signals = collectSignals(input.candidates, input.claims);
  const excerptByCore = new Map(
    (input.provisionScopedExtraction?.excerpts || []).map((e) => [e.provisionCore, e.authoritativeExcerpt || '']),
  );
  const deterministicByCore = new Map((input.deterministicCandidates || []).map((d) => [d.provisionCore, d]));

  const assessments = supplied.map((core) => {
    const hits = matchesCore(signals, core);
    const structured = hits.filter((h) => h.structuredReference);
    const textOnly = hits.filter((h) => !h.structuredReference);
    const excerpt = excerptByCore.get(core) || deterministicByCore.get(core)?.suggestedQuotation || '';
    let outcome = PROVISION_ASSESSMENT_OUTCOME.OMITTED;
    let identified = false;
    let causes = [];

    if (structured.length) {
      outcome = PROVISION_ASSESSMENT_OUTCOME.ASSESSED_STRUCTURED;
      identified = true;
    } else if (textOnly.length) {
      outcome = PROVISION_ASSESSMENT_OUTCOME.ASSESSED_TEXT_ONLY;
      identified = true;
      causes.push('present_without_structured_provision_reference');
    } else {
      causes.push('supplied_to_model_but_no_candidate_or_claim');
    }

    const misBinding = hits.some(
      (h) =>
        h.bindingNature === 'binding_requirement' &&
        (h.regulatoryRoute === 'EXCEPTION' || h.regulatoryGuard?.conversionEligibilityRoute === 'EXCEPTION'),
    );
    if (misBinding && identified) {
      outcome = PROVISION_ASSESSMENT_OUTCOME.MISCLASSIFIED_BINDING;
      causes.push('binding_claim_failed_regulatory_guard');
    }

    return {
      provisionCore: core,
      outcome,
      identified,
      structuredReferenceCount: structured.length,
      textHitCount: hits.length,
      authoritativeExcerptHead: excerpt.slice(0, 240) || null,
      causes,
      requiresExceptionReview:
        outcome === PROVISION_ASSESSMENT_OUTCOME.OMITTED ||
        outcome === PROVISION_ASSESSMENT_OUTCOME.ASSESSED_TEXT_ONLY ||
        outcome === PROVISION_ASSESSMENT_OUTCOME.MISCLASSIFIED_BINDING,
    };
  });

  const omissions = assessments.filter((a) => a.outcome === PROVISION_ASSESSMENT_OUTCOME.OMITTED);
  const partial = assessments.filter((a) => a.outcome === PROVISION_ASSESSMENT_OUTCOME.ASSESSED_TEXT_ONLY);

  return {
    assessments,
    suppliedCount: supplied.length,
    assessedStructuredCount: assessments.filter((a) => a.outcome === PROVISION_ASSESSMENT_OUTCOME.ASSESSED_STRUCTURED)
      .length,
    omissionCount: omissions.length,
    omissionCores: omissions.map((a) => a.provisionCore),
    partialIdentificationCores: partial.map((a) => a.provisionCore),
    regulatoryAccuracySuccess:
      omissions.length === 0 && partial.length === 0 && supplied.length > 0
        ? assessments.every((a) => a.outcome === PROVISION_ASSESSMENT_OUTCOME.ASSESSED_STRUCTURED)
        : false,
    batchCompletenessOk: omissions.length === 0,
  };
}

/**
 * @param {Record<string, unknown>} structured
 * @param {Parameters<typeof assessBatchProvisionCompleteness>[0]} input
 */
export function attachProvisionCompletenessToStructuredOutput(structured, input) {
  if (!structured || typeof structured !== 'object') return null;
  const report = assessBatchProvisionCompleteness(input);
  structured._forgeniqProvisionAssessments = report.assessments;
  structured._forgeniqProvisionCompleteness = {
    suppliedCount: report.suppliedCount,
    omissionCount: report.omissionCount,
    omissionCores: report.omissionCores,
    partialIdentificationCores: report.partialIdentificationCores,
    batchCompletenessOk: report.batchCompletenessOk,
    regulatoryAccuracySuccess: report.regulatoryAccuracySuccess,
    policy: 'Batch SUCCEEDED does not imply regulatory accuracy; omissions are explicit.',
  };
  return report;
}