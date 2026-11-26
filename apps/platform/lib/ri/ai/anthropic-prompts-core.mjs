const SYSTEM_BASE = `You are FORGENIQ Regulatory Intelligence — an advisory analysis assistant for regulated firms.
Output MUST be valid JSON only (no markdown fences).
All outputs are draft recommendations requiring human review before any regulatory decision.
Ground every claim in the provided sourceSectionIds only — never invent section IDs.
Use UK English.`;

function schemaHintFor(schemaName) {
  switch (schemaName) {
    case 'PublicationClassificationResult':
      return `Required fields: classification (string), confidence (0-100).
Optional claims[] with text, confidence, sourceSectionIds[] grounded in sources.`;
    case 'ChangeExtractionResult':
      return `Required: confidence (0-100), candidates[] with title, changeType, materiality.
Include claims[] with sourceSectionIds for each candidate where possible.`;
    case 'ImpactSuggestionResult':
      return `Required: confidence (0-100), dimensions[] (string areas such as Operations, Technology, Compliance).
Include claims[] with text, confidence, sourceSectionIds grounded only in regulatory source sections (not catalogue rows).
Every material claim must cite the regulatory section ${'`REG-1`'} (when supplied) and carry sourceQuotation copied verbatim from it plus provisionReference exactly as given; an internal id such as OBL-1 alone is not regulatory evidence. Never invent a quotation, provision reference or section id.
State assumptions and uncertainties explicitly. Do not invent firm systems, headcount, or financials.
Draft only — never an approved impact decision.`;
    case 'RiskMappingResult':
      return `Required: confidence (0-100), riskProposals[] with title, description, category, inherent_risk (LOW|MEDIUM|HIGH|CRITICAL), inherent_rationale (at least two sentences naming the regulatory requirement, the harm if it is missed and the source it comes from).
Do not supply residual_risk: no control-effectiveness evidence is available, so residual risk is recorded as UNASSESSED by the platform. If you give residual_risk it is discarded.
Rate inherent_risk only when the rationale can be written from the supplied regulatory evidence; otherwise omit inherent_risk. Do not default to MEDIUM.
Optional existingRiskMappings[] may reference only catalogue risk ids supplied in advisory context. Never invent database ids.
Include claims[] each citing ${'`REG-1`'} (when supplied) with sourceQuotation copied verbatim and provisionReference exactly as given. An internal id such as IMP-1 alone is not regulatory evidence. Never invent a quotation or provision reference.
Ratings are suggestions requiring human validation. Draft only — do not mark a risk approved.`;
    case 'ControlMappingResult':
      return `Required: confidence (0-100), controlProposals[] with name, description, control_type, effectiveness, coverage[].
Each coverage[] item: obligationLimb (an exact limb reference from advisory controlRequirements, e.g. "CONC 7.20.1R(2)(a)"), category (detection | notification | information_completeness | timeliness | monitoring | evidence_retention), justification (one or two sentences on how the control addresses that limb).
A control that does not address the regulatory requirement itself (for example payment reconciliation that does not notify the borrower) must not claim notification or information coverage. Cover every requirement in controlRequirements with some proposal, or say in the proposal description which requirement remains uncovered. Return every proposal; do not drop any.
effectiveness must be NOT_TESTED unless the supplied evidence explicitly records a completed test. Do not describe any control as existing unless it is in existingControls.
Optional existingControlMappings[] may reference only catalogue control ids supplied in advisory context. Do not duplicate an existing control as a new proposal when a match is supplied.
Include claims[] each citing ${'`REG-1`'} (when supplied) with sourceQuotation copied verbatim and provisionReference exactly as given. Never invent a quotation or provision reference. Draft only.`;
    case 'ControlAssurancePlanResult':
      return `Required: confidence (0-100), testPlan object with reviewType, objective, procedure, evidenceRequirements, frequency.
Do not declare a control effective, record a pass/fail test result, accept an exception, or close a lifecycle.
procedure and evidenceRequirements may be strings or arrays of steps. Keep the whole plan concise enough to finish within the output limit; the platform stores it in full and never cuts it.
Test whether the control delivers the regulatory requirement (for example that the borrower was notified, that the notice was complete, and that it was timely), not only the operation of the control.
Include claims[] each citing ${'`REG-1`'} (when supplied) with sourceQuotation copied verbatim and provisionReference exactly as given. Never invent a quotation or provision reference. Draft testing recommendations only.`;
    case 'ObligationExtractionResult':
      return `Required: confidence (0-100), candidates[] where each item includes:
statement, sourceSectionIds[] (must use exact sourceSectionId values from Source sections),
provisionReference (exact handbook rule cited, e.g. "CONC 4.2A.3R" — required when the finding cites a numbered rule; use only when sourceQuotation contains that rule set out in the legal instrument, not a cross-reference elsewhere),
bindingNature (binding_requirement | guidance | consultation_proposal | explanatory_commentary | unknown),
citation (human-readable PDF location), sourceQuotation (short verbatim excerpt from provided text only),
effectiveDate (ISO date or null — use only a commencement date stated in the supplied provisionLegal evidence; never infer one from a publication date), applicabilityConditions (string or null).
Provision structure: when provisionLegal.breakdowns lists limbs for a provision, produce one candidate for each limb marked standaloneObligation and quote that limb (not the applicability limb). Applicability conditions and definition or scope limbs are not standalone obligations; record them in applicabilityConditions.
The publication type is given by documentLegalStatus. A final policy statement with a made instrument contains final rules; a consultation paper contains proposals.
Distinguish document types: consultation proposals are not binding; finalised non-Handbook guidance must not be presented as independent binding obligations; binding_requirement applies only when sourceQuotation contains operative rule text set out for that provision in a legal instrument (must/shall duties on firms).
Cross-references to R rules in narrative or guidance sections → guidance or explanatory_commentary, not binding_requirement.
Do not invent obligations without sourceSectionIds. If evidence is insufficient return {"confidence":0,"candidates":[],"insufficientEvidence":true,"insufficientEvidenceReason":"..."}.
Also include claims[] mirroring supported candidates with text, confidence, sourceSectionIds, provisionReference.
When provision-scoped extraction lists targetCores, you must address every listed provisionCore explicitly — do not skip a supplied provision.`;
    default:
      return `Required: recommendation (string), confidence (0-100), claims[] (min 1) each with text, confidence, sourceSectionIds[].`;
  }
}

function mapSchemaForAnalysisType(analysisType) {
  if (analysisType === 'Publication Classification') return 'PublicationClassificationResult';
  if (analysisType === 'Regulatory Change Extraction') return 'ChangeExtractionResult';
  if (analysisType === 'Impact Suggestion') return 'ImpactSuggestionResult';
  if (analysisType === 'Obligation Extraction') return 'ObligationExtractionResult';
  if (analysisType === 'Risk Mapping') return 'RiskMappingResult';
  if (analysisType === 'Control Mapping') return 'ControlMappingResult';
  if (analysisType === 'Control Assurance Plan') return 'ControlAssurancePlanResult';
  return 'ApplicabilityResult';
}

/**
 * Prompt-safe view of the regulatory analysis: drops the bulky instrument tables and per-limb verbatim text that the
 * platform keeps for its own checks, and keeps commencement and limb structure for the target provisions.
 */
export function compactRegulatoryAnalysisForPrompt(analysis) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  const { provisionLegal, ...rest } = analysis;
  if (!provisionLegal || typeof provisionLegal !== 'object') return rest;
  const breakdowns = {};
  for (const [core, b] of Object.entries(provisionLegal.breakdowns || {})) {
    breakdowns[core] = {
      reference: b.reference,
      limbs: (b.limbs || []).map((l) => ({ reference: l.reference, kind: l.kind, standaloneObligation: l.standaloneObligation })),
      expertJudgement: (b.expertJudgement || []).map((e) => e.id),
    };
  }
  const commencement = {};
  for (const [core, c] of Object.entries(provisionLegal.commencement || {})) {
    if (provisionLegal.breakdowns?.[core]) {
      commencement[core] = { status: c.status, commencementDate: c.commencementDate ?? null, basis: c.basis ?? null, clause: c.clause ?? null };
    }
  }
  return {
    ...rest,
    provisionLegal: {
      instrument: provisionLegal.instrument
        ? { status: provisionLegal.instrument.status, title: provisionLegal.instrument.title, number: provisionLegal.instrument.number }
        : null,
      commencement,
      breakdowns,
    },
  };
}

export function buildAnthropicPrompts(ctx) {
  const schemaName = mapSchemaForAnalysisType(ctx.analysisType);
  const sectionsJson = JSON.stringify(
    ctx.sourceSections.map((s) => ({
      sourceSectionId: s.sourceSectionId,
      citation: s.citation ?? null,
      excerpt: (s.text ?? '').slice(0, 6000),
    })),
  );
  const regCtx =
    ctx.regulatoryAnalysis && typeof ctx.regulatoryAnalysis === 'object'
      ? `\nDeterministic publication signals (advisory only — verify against excerpts):\n${JSON.stringify(compactRegulatoryAnalysisForPrompt(ctx.regulatoryAnalysis))}\n`
      : '';
  const scoped =
    ctx.provisionScopedExtraction && typeof ctx.provisionScopedExtraction === 'object'
      ? `\nProvision-scoped extraction (mandatory when target cores are listed): each candidate must use sourceQuotation drawn only from the matching authoritativeExcerpt for its provisionCore. Do not attribute text from a neighbouring provision on the same PDF page (e.g. do not use IGC pension text for PRIN 2A.4.35E).\n${JSON.stringify(ctx.provisionScopedExtraction)}\n`
      : '';
  const user = `Use case: ${ctx.useCaseId ?? 'unknown'}
Analysis type: ${ctx.analysisType}
Evidence mode: ${ctx.contextKind || 'publication_summary'}
Target JSON schema: ${schemaName}
${regCtx}${scoped}
Source sections (only these IDs may appear in sourceSectionIds):
${sectionsJson}

${schemaHintFor(schemaName)}

Return a single JSON object matching ${schemaName}.`;

  return { system: SYSTEM_BASE, user };
}
