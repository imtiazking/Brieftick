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
State assumptions when organisational facts are absent. Do not invent firm systems, headcount, or financials.
Draft only — never an approved impact decision.`;
    case 'RiskMappingResult':
      return `Required: confidence (0-100), riskProposals[] with title, description, category, inherent_risk, residual_risk.
Optional existingRiskMappings[] may reference only catalogue risk ids supplied in advisory context. Never invent database ids.
Include claims[] grounded to regulatory source sections. Ratings are suggestions requiring human validation.
Draft only — do not mark a risk approved.`;
    case 'ControlMappingResult':
      return `Required: confidence (0-100), controlProposals[] with name, description, control_type, effectiveness.
effectiveness must be NOT_TESTED unless the supplied evidence explicitly records a completed test.
Optional existingControlMappings[] may reference only catalogue control ids supplied in advisory context. Do not duplicate an existing control as a new proposal when a match is supplied.
Include claims[] grounded to regulatory source sections. Draft only.`;
    case 'ControlAssurancePlanResult':
      return `Required: confidence (0-100), testPlan object with reviewType, objective, procedure, evidenceRequirements, frequency.
Do not declare a control effective, record a pass/fail test result, accept an exception, or close a lifecycle.
Include claims[] grounded to regulatory source sections. Draft testing recommendations only.`;
    case 'ObligationExtractionResult':
      return `Required: confidence (0-100), candidates[] where each item includes:
statement, sourceSectionIds[] (must use exact sourceSectionId values from Source sections),
provisionReference (exact handbook rule cited, e.g. "CONC 4.2A.3R" — required when the finding cites a numbered rule; use only when sourceQuotation contains that rule set out in the legal instrument, not a cross-reference elsewhere),
bindingNature (binding_requirement | guidance | consultation_proposal | explanatory_commentary | unknown),
citation (human-readable PDF location), sourceQuotation (short verbatim excerpt from provided text only),
effectiveDate (ISO date or null), applicabilityConditions (string or null).
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
      ? `\nDeterministic publication signals (advisory only — verify against excerpts):\n${JSON.stringify(ctx.regulatoryAnalysis)}\n`
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
