/** Structured output schemas for AI use cases (validation only). */
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
};

export function validateStructuredOutput(schemaName, payload) {
  const schema = SCHEMAS[schemaName];
  if (!schema) return { ok: true, schemaName: 'unknown' };
  const missing = (schema.required || []).filter((k) => payload[k] == null);
  if (missing.length) {
    return { ok: false, code: 'AI_OUTPUT_SCHEMA_INVALID', message: `Missing fields: ${missing.join(', ')}` };
  }
  if (schema.confidence && payload.confidence != null) {
    const c = Number(payload.confidence);
    if (c < schema.confidence.min || c > schema.confidence.max) {
      return { ok: false, code: 'AI_OUTPUT_SCHEMA_INVALID', message: 'Confidence out of bounds' };
    }
  }
  if (schema.claims && Array.isArray(payload.claims)) {
    for (const cl of payload.claims) {
      for (const req of schema.claims.itemRequired || []) {
        if (cl[req] == null) return { ok: false, code: 'AI_OUTPUT_SCHEMA_INVALID', message: `Claim missing ${req}` };
      }
    }
  }
  return { ok: true };
}
