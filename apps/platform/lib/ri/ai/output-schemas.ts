/** Structured output validation — ported from Design Lab ai-runtime/output-schemas.js */

export const SCHEMAS = {
  ApplicabilityResult: {
    required: ['recommendation', 'confidence', 'claims'],
    claims: { minItems: 1, itemRequired: ['text', 'confidence', 'sourceSectionIds'] },
    confidence: { min: 0, max: 100 },
  },
  PublicationClassificationResult: {
    required: ['classification', 'confidence'],
    confidence: { min: 0, max: 100 },
  },
  ChangeExtractionResult: {
    required: ['candidates', 'confidence'],
    confidence: { min: 0, max: 100 },
  },
  ImpactSuggestionResult: {
    required: ['dimensions', 'confidence'],
    confidence: { min: 0, max: 100 },
  },
  ObligationExtractionResult: {
    required: ['candidates', 'confidence'],
    confidence: { min: 0, max: 100 },
  },
} as const;

export function validateStructuredOutput(
  schemaName: string,
  payload: Record<string, unknown> | null | undefined,
): { ok: boolean; code?: string; message?: string } {
  const schema = SCHEMAS[schemaName as keyof typeof SCHEMAS];
  if (!schema) return { ok: true };
  if (!payload || typeof payload !== 'object') {
    return { ok: false, code: 'AI_OUTPUT_SCHEMA_INVALID', message: 'Missing structured output' };
  }
  const missing = (schema.required || []).filter((k) => payload[k] == null);
  if (missing.length) {
    return {
      ok: false,
      code: 'AI_OUTPUT_SCHEMA_INVALID',
      message: `Missing fields: ${missing.join(', ')}`,
    };
  }
  if (schema.confidence && payload.confidence != null) {
    const c = Number(payload.confidence);
    if (c < schema.confidence.min || c > schema.confidence.max) {
      return { ok: false, code: 'AI_OUTPUT_SCHEMA_INVALID', message: 'Confidence out of bounds' };
    }
  }
  const claimRules = 'claims' in schema ? schema.claims : undefined;
  if (claimRules && Array.isArray(payload.claims)) {
    for (const cl of payload.claims as Record<string, unknown>[]) {
      for (const req of claimRules.itemRequired || []) {
        if (cl[req] == null) {
          return { ok: false, code: 'AI_OUTPUT_SCHEMA_INVALID', message: `Claim missing ${req}` };
        }
      }
    }
  }
  return { ok: true };
}

export function mapSchemaForAnalysisType(analysisType: string): string {
  if (analysisType === 'Publication Classification') return 'PublicationClassificationResult';
  if (analysisType === 'Regulatory Change Extraction') return 'ChangeExtractionResult';
  if (analysisType === 'Impact Suggestion') return 'ImpactSuggestionResult';
  if (analysisType === 'Obligation Extraction') return 'ObligationExtractionResult';
  return 'ApplicabilityResult';
}
