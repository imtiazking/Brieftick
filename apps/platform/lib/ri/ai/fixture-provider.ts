import 'server-only';

import { AI_ERRORS } from '@/lib/ri/ai/errors';
import { mapSchemaForAnalysisType } from '@/lib/ri/ai/output-schemas';

export const FIXTURE_PROVIDER_ID = 'AIPROV-FIXTURE-001';

export type FixtureProviderRequest = {
  useCaseId?: string;
  analysisType?: string;
  fixtureScenario?: string;
  context?: {
    sourceSections?: { sourceSectionId: string; citation?: string; text?: string }[];
  };
};

export function createFixtureProvider() {
  return {
    id: FIXTURE_PROVIDER_ID,
    name: 'FORGENIQ Fixture AI Provider',
    mode: 'fixture' as const,
    async execute(request: FixtureProviderRequest) {
      const scenario = request.fixtureScenario || 'default';
      if (scenario === 'provider-unavailable') {
        return { ok: false, code: AI_ERRORS.AI_PROVIDER_UNAVAILABLE, message: 'Fixture: provider unavailable' };
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
            claims: [
              {
                text: 'Hallucinated claim',
                confidence: 80,
                sourceSectionIds: ['SRCSEC-DOES-NOT-EXIST'],
                materiality: 'High',
              },
            ],
          },
          schemaName: 'ApplicabilityResult',
          latencyMs: 42,
        };
      }
      const sections = request.context?.sourceSections || [];
      const claims = sections.slice(0, 2).map((s, i) => ({
        text: `Fixture claim ${i + 1} grounded in ${s.citation || s.sourceSectionId}`,
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
      const analysisType = request.analysisType || 'Applicability Recommendation';
      const structured: Record<string, unknown> = {
        recommendation: analysisType === 'Applicability Recommendation' ? 'Applicable' : 'Classified',
        confidence: analysisType === 'Applicability Recommendation' ? 86 : 84,
        claims,
        classification: 'Consumer Duty / Outcomes',
        candidates:
          analysisType === 'Regulatory Change Extraction'
            ? [{ title: 'Fixture change', materiality: 'High' }]
            : analysisType === 'Obligation Extraction'
              ? [
                  {
                    statement: 'Fixture obligation statement',
                    sourceSectionIds: claims[0]?.sourceSectionIds || [],
                  },
                ]
              : [],
        dimensions: analysisType === 'Impact Suggestion' ? ['Operations', 'Compliance'] : [],
      };
      return {
        ok: true,
        structured,
        schemaName: mapSchemaForAnalysisType(analysisType),
        inputTokenEstimate: 1400,
        outputTokenEstimate: 220,
        estimatedCostMock: 0.0024,
        latencyMs: 45,
        providerRequestIdMock: `FIX-REQ-${Date.now()}`,
      };
    },
  };
}
