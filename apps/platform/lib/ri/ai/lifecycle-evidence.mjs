/**
 * Regulatory evidence pack carried from an approved obligation through lifecycle stages 2-5.
 *
 * The pack holds only what the platform verified (provision reference, verified quotation and page, legal basis,
 * commencement traced to the instrument, limb breakdown). Stage outputs are checked against it: a quotation that is
 * not in the verified corpus, or a provision reference that is not the obligation's own, is rejected. An internal
 * identifier (OBL-1, IMP-1, ...) alone is never treated as regulatory evidence.
 */
import { normaliseForMatch, quotationLimbCoverage } from './provision-breakdown.mjs';

export const EVIDENCE_PACK_VERSION = 'regulatory-evidence-pack-v1';
export const REGULATORY_SECTION_ID = 'REG-1';

export const EVIDENCE_LEVELS = Object.freeze({
  REGULATORY_VERIFIED: 'regulatory_verified',
  REGULATORY_PARTIAL: 'regulatory_partial',
  INTERNAL_ONLY: 'internal_only',
});

const INTERNAL_ID = /^(OBL|IMP|RISK|CTRL)-\d+$/;

function claimText(claim) {
  return str(claim?.text) || str(claim?.claim) || str(claim?.summary);
}

function str(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function provisionCoreOf(reference) {
  const m = /(\d+[A-Z]?(?:\.\d+[A-Z]?)+)\s*([RGE])?/.exec(String(reference || '').replace(/\s+/g, ' '));
  return m ? `${m[1]}${m[2] ?? ''}` : null;
}

/** @param {{ id: string, obligation_statement?: string, citation?: string, effective_date?: string|null, metadata?: Record<string, any> }} obligation */
export function buildRegulatoryEvidencePack(obligation) {
  const meta = obligation?.metadata && typeof obligation.metadata === 'object' ? obligation.metadata : {};
  const reference = str(meta.provisionReference);
  const core = str(meta.provisionCore) || provisionCoreOf(reference);
  const quotationText = str(meta.sourceQuotation);
  const breakdown = meta.provisionBreakdown && typeof meta.provisionBreakdown === 'object' ? meta.provisionBreakdown : null;
  const commencement = meta.commencement && typeof meta.commencement === 'object' ? meta.commencement : null;
  const verified = Boolean(meta.quotationVerificationId) && Boolean(quotationText);
  const effectiveDate = obligation?.effective_date ?? null;
  const coverage = breakdown?.parsed && quotationText ? quotationLimbCoverage(breakdown, quotationText) : null;

  const assumptions = [
    'Organisational systems, controls, control-effectiveness evidence and incident data are not supplied; none are assumed.',
    'Recommendations are draft proposals for human review and are not regulatory advice.',
  ];
  const uncertainties = [];
  if (!verified) uncertainties.push('The obligation quotation has no recorded human verification against the PDF page.');
  if (!effectiveDate) uncertainties.push('Commencement date is not verified against the instrument; no date is asserted.');
  else if (commencement?.status !== 'resolved') uncertainties.push('Effective date is recorded but its instrument commencement trace is not stored.');
  if (coverage && !coverage.operativeCovered) uncertainties.push('The verified quotation does not cover an operative limb of the provision.');
  for (const j of breakdown?.expertJudgement ?? []) uncertainties.push(`Expert judgement needed (${j.reference}): ${j.question}`);

  return {
    version: EVIDENCE_PACK_VERSION,
    obligationId: obligation?.id ?? null,
    source: {
      legalBasis: str(meta.legalBasis),
      publicationId: obligation?.publication_id ?? null,
      publicationType: str(meta.sourcePublicationType),
      extractionRevisionId: str(meta.pdfExtractionRevisionId),
    },
    provision: {
      reference,
      core,
      regulatoryClassificationCode: str(meta.regulatoryClassificationCode),
      legalStatus: str(meta.legalStatus),
      bindingNature: str(meta.bindingNature),
      provisionFunction: str(meta.provisionFunction),
    },
    provisionBreakdown: breakdown,
    quotation: {
      text: quotationText,
      page: Number.isInteger(meta.quotationPage) ? meta.quotationPage : null,
      citationLocation: str(obligation?.citation),
      verified,
      verificationId: str(meta.quotationVerificationId),
      coversLimbs: coverage?.coveredReferences ?? null,
    },
    effective: {
      date: effectiveDate,
      source: commencement?.status === 'resolved' ? 'instrument_commencement' : effectiveDate ? 'recorded_unverified' : 'unverified',
      evidence: commencement?.evidence ?? null,
    },
    breakdown: breakdown?.parsed
      ? {
          reference: breakdown.reference,
          standaloneObligationPaths: breakdown.standaloneObligationPaths,
          limbs: breakdown.limbs.map((l) => ({ reference: l.reference, kind: l.kind, standaloneObligation: l.standaloneObligation, text: l.text })),
        }
      : null,
    assumptions,
    uncertainties,
  };
}

/** Source sections for a downstream stage: the regulatory evidence is supplied as its own citable section. */
export function evidencePackSourceSections(pack) {
  if (!pack?.quotation?.text) return [];
  const loc = pack.quotation.citationLocation || (pack.quotation.page ? `PDF p.${pack.quotation.page}` : 'source PDF');
  const limbs = pack.breakdown?.limbs?.length
    ? `\nProvision limbs (verbatim, platform-derived):\n${pack.breakdown.limbs.map((l) => `${l.reference} [${l.kind}${l.standaloneObligation ? ', standalone obligation' : ''}]: ${l.text}`).join('\n')}`
    : '';
  return [
    {
      sourceSectionId: REGULATORY_SECTION_ID,
      citation: `${pack.provision.reference ?? 'regulatory provision'} — ${loc}`,
      text: `${pack.source.legalBasis ?? ''}\nVerified quotation (${loc}): ${pack.quotation.text}${limbs}`.slice(0, 8000),
    },
  ];
}

/** Compact, prompt-safe view of the pack. */
export function evidencePackAdvisory(pack) {
  if (!pack) return null;
  return {
    regulatorySectionId: REGULATORY_SECTION_ID,
    provisionReference: pack.provision.reference,
    legalStatus: pack.provision.legalStatus,
    quotationVerified: pack.quotation.verified,
    effectiveDate: pack.effective.date,
    effectiveDateSource: pack.effective.source,
    standaloneObligationPaths: pack.breakdown?.standaloneObligationPaths ?? [],
    limbs: (pack.breakdown?.limbs ?? []).map((l) => ({ reference: l.reference, kind: l.kind })),
    assumptions: pack.assumptions,
    uncertainties: pack.uncertainties.slice(0, 8),
  };
}

function corpusFor(pack, sections) {
  const parts = [];
  if (pack?.quotation?.text) parts.push(pack.quotation.text);
  for (const l of pack?.breakdown?.limbs ?? []) parts.push(l.text);
  for (const s of sections || []) parts.push(s.text || '');
  return normaliseForMatch(parts.join(' '));
}

/**
 * Validate stage claims against the evidence pack.
 * @param {Record<string, any> | null | undefined} structured provider output
 * @param {{ pack: ReturnType<typeof buildRegulatoryEvidencePack> | null, allowedSectionIds: string[], sections?: Array<{ text?: string }> }} ctx
 */
export function validateStageClaims(structured, ctx) {
  const claims = Array.isArray(structured?.claims) ? structured.claims : [];
  const allowed = new Set(ctx.allowedSectionIds || []);
  const pack = ctx.pack ?? null;
  const corpus = corpusFor(pack, ctx.sections);
  const packCore = pack?.provision?.core ?? null;
  const accepted = [];
  const rejected = [];
  claims.forEach((claim, index) => {
    if (!claim || typeof claim !== 'object') return;
    const ids = Array.isArray(claim.sourceSectionIds) ? claim.sourceSectionIds.map((x) => String(x).trim()).filter(Boolean) : [];
    const unknown = ids.filter((id) => !allowed.has(id));
    const quote = str(claim.sourceQuotation);
    const ref = str(claim.provisionReference);
    const reasons = [];
    if (unknown.length) reasons.push(`unknown_source_section:${unknown.join(',')}`);
    if (quote && corpus && !corpus.includes(normaliseForMatch(quote))) reasons.push('quotation_not_in_verified_source');
    if (ref && packCore) {
      const claimCore = provisionCoreOf(ref);
      if (claimCore && claimCore.replace(/[RGE]$/, '') !== packCore.replace(/[RGE]$/, '')) reasons.push('provision_reference_not_in_evidence');
    } else if (ref && !packCore && pack) {
      reasons.push('provision_reference_not_in_evidence');
    }
    if (reasons.length) {
      rejected.push({ claimIndex: index, text: claimText(claim), reasons });
      return;
    }
    const citesRegulatory = ids.includes(REGULATORY_SECTION_ID);
    const level = citesRegulatory
      ? quote && pack?.quotation?.verified ? EVIDENCE_LEVELS.REGULATORY_VERIFIED : EVIDENCE_LEVELS.REGULATORY_PARTIAL
      : EVIDENCE_LEVELS.INTERNAL_ONLY;
    accepted.push({
      ...claim,
      // Stages 3-5 return the sentence under `claim`; `text` is the persisted field.
      text: claimText(claim),
      sourceSectionIds: ids,
      evidenceLevel: level,
      onlyInternalIdentifiers: ids.length > 0 && ids.every((id) => INTERNAL_ID.test(id)),
    });
  });
  const evidenceTrace = accepted.map((c, i) => ({
    claimIndex: i,
    claim: claimText(c),
    evidenceLevel: c.evidenceLevel,
    sourceSectionIds: c.sourceSectionIds,
    provisionReference: pack?.provision?.reference ?? null,
    sourceQuotation: str(c.sourceQuotation),
    citationLocation: pack?.quotation?.citationLocation ?? null,
    originatingObligationId: pack?.obligationId ?? null,
    legalBasis: pack?.source?.legalBasis ?? null,
  }));
  const regulatoryClaims = accepted.filter((c) => c.evidenceLevel !== EVIDENCE_LEVELS.INTERNAL_ONLY).length;
  return {
    accepted,
    rejected,
    evidenceTrace,
    summary: {
      claimCount: claims.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      regulatoryEvidencedCount: regulatoryClaims,
      sufficient: regulatoryClaims > 0,
      insufficiencyReason: regulatoryClaims > 0 ? null : accepted.length ? 'only_internal_identifiers_cited' : 'no_valid_claims',
    },
  };
}

/** Carry-forward block stored on each downstream record's metadata. */
export function regulatoryEvidenceMetadata(pack, validation) {
  return {
    pack,
    trace: validation?.evidenceTrace ?? [],
    citationValidation: validation ? { ...validation.summary, rejected: validation.rejected } : null,
  };
}
