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
      return `Required: confidence (0-100), dimensions[] (string areas).
Include claims[] grounded to source sections.`;
    case 'ObligationExtractionResult':
      return `Required: confidence (0-100), candidates[] where each item includes:
statement, sourceSectionIds[] (must use exact sourceSectionId values from Source sections),
provisionReference (exact handbook rule cited, e.g. "CONC 4.2A.3R" — required when the finding cites a numbered rule),
bindingNature (binding_requirement | guidance | consultation_proposal | explanatory_commentary | unknown),
citation (human-readable PDF location), sourceQuotation (short verbatim excerpt from provided text only),
effectiveDate (ISO date or null), applicabilityConditions (string or null).
For final Policy Statements and legal instruments (not consultations), classify FCA "R" rules as binding_requirement — do not use consultation_proposal when the instrument text is final.
Do not invent obligations without sourceSectionIds. If evidence is insufficient return {"confidence":0,"candidates":[],"insufficientEvidence":true,"insufficientEvidenceReason":"..."}.
Also include claims[] mirroring supported candidates with text, confidence, sourceSectionIds, provisionReference.`;
    default:
      return `Required: recommendation (string), confidence (0-100), claims[] (min 1) each with text, confidence, sourceSectionIds[].`;
  }
}

function mapSchemaForAnalysisType(analysisType) {
  if (analysisType === 'Publication Classification') return 'PublicationClassificationResult';
  if (analysisType === 'Regulatory Change Extraction') return 'ChangeExtractionResult';
  if (analysisType === 'Impact Suggestion') return 'ImpactSuggestionResult';
  if (analysisType === 'Obligation Extraction') return 'ObligationExtractionResult';
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
