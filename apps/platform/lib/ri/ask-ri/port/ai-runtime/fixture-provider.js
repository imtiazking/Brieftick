/**
 * DeterministicFixtureProvider — default Design Lab AI provider.
 */
import { AI_ERRORS } from './ai-errors.js';

export const FIXTURE_PROVIDER_ID = 'AIPROV-FIXTURE-001';

export function createFixtureProvider() {
  return {
    id: FIXTURE_PROVIDER_ID,
    name: 'FORGENIQ Fixture AI Provider',
    mode: 'fixture',
    async execute(request) {
      const scenario = request.fixtureScenario || request.scenario || 'default';
      if (scenario === 'provider-unavailable') {
        return { ok: false, code: AI_ERRORS.AI_PROVIDER_UNAVAILABLE, message: 'Fixture: provider unavailable' };
      }
      if (scenario === 'rate-limited') {
        return { ok: false, code: AI_ERRORS.AI_PROVIDER_RATE_LIMITED, message: 'Fixture: rate limited', retryAfterMs: 5000 };
      }
      if (scenario === 'timeout') {
        return { ok: false, code: AI_ERRORS.AI_TIMEOUT, message: 'Fixture: timeout' };
      }
      if (scenario === 'malformed-output') {
        return { ok: true, structured: { broken: true }, schemaName: 'ApplicabilityResult' };
      }
      if (scenario === 'hallucinated-citation') {
        return {
          ok: true,
          structured: {
            recommendation: 'Applicable',
            confidence: 80,
            claims: [{ text: 'Hallucinated claim', confidence: 80, sourceSectionIds: ['SRCSEC-DOES-NOT-EXIST'], materiality: 'High' }],
          },
          schemaName: 'ApplicabilityResult',
          inputTokenEstimate: 1200,
          outputTokenEstimate: 180,
          estimatedCostMock: 0.002,
          latencyMs: 42,
        };
      }
      if (scenario === 'low-confidence') {
        return {
          ok: true,
          structured: {
            recommendation: 'Review Required',
            confidence: 62,
            claims: (request.context?.sourceSections || []).slice(0, 1).map((s, i) => ({
              text: 'Low confidence applicability signal (fixture)',
              confidence: 62,
              sourceSectionIds: [s.sourceSectionId],
              claimType: 'Applicability',
              materiality: 'High',
            })),
          },
          schemaName: 'ApplicabilityResult',
          inputTokenEstimate: 1100,
          outputTokenEstimate: 150,
          estimatedCostMock: 0.0018,
          latencyMs: 38,
        };
      }
      const sections = request.context?.sourceSections || [];
      const claims = sections.slice(0, 2).map((s, i) => ({
        text: `Fixture claim ${i + 1} grounded in ${s.citation}`,
        confidence: request.useCaseId === 'UC-RI-003' ? 86 : 84,
        sourceSectionIds: [s.sourceSectionId],
        claimType: request.analysisType || 'Recommendation',
        materiality: 'High',
      }));
      if (!claims.length) {
        claims.push({
          text: 'Fixture recommendation without source (should fail citation policy)',
          confidence: 75,
          sourceSectionIds: [],
          claimType: 'Recommendation',
          materiality: 'High',
        });
      }
      return {
        ok: true,
        structured: {
          recommendation: request.analysisType === 'Applicability Recommendation' ? 'Applicable' : 'Classified',
          confidence: request.analysisType === 'Applicability Recommendation' ? 86 : 84,
          claims,
          classification: 'Consumer Duty / Outcomes',
        },
        schemaName: mapSchema(request),
        inputTokenEstimate: 1400,
        outputTokenEstimate: 220,
        estimatedCostMock: 0.0024,
        latencyMs: 45,
        providerRequestIdMock: `FIX-REQ-${Date.now()}`,
      };
    },
  };
}

function mapSchema(request) {
  if (request.analysisType === 'Publication Classification') return 'PublicationClassificationResult';
  if (request.analysisType === 'Regulatory Change Extraction') return 'ChangeExtractionResult';
  return 'ApplicabilityResult';
}
