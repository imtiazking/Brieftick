/** Acceptance mirror of production fixture provider (no TS compile required). */

export const FIXTURE_PROVIDER_ID = 'AIPROV-FIXTURE-001';

function mapSchema(analysisType) {
  if (analysisType === 'Publication Classification') return 'PublicationClassificationResult';
  if (analysisType === 'Regulatory Change Extraction') return 'ChangeExtractionResult';
  if (analysisType === 'Impact Suggestion') return 'ImpactSuggestionResult';
  if (analysisType === 'Obligation Extraction') return 'ObligationExtractionResult';
  return 'ApplicabilityResult';
}

export function createFixtureProvider() {
  return {
    id: FIXTURE_PROVIDER_ID,
    async execute(request) {
      const scenario = request.fixtureScenario || 'default';
      if (scenario === 'provider-unavailable') {
        return { ok: false, code: 'AI_PROVIDER_UNAVAILABLE', message: 'Fixture: provider unavailable' };
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
        };
      }
      const sections = request.context?.sourceSections || [];
      const claims = sections.slice(0, 2).map((s, i) => ({
        text: `Fixture claim ${i + 1} grounded in ${s.citation || s.sourceSectionId}`,
        confidence: request.useCaseId === 'UC-RI-003' ? 86 : 84,
        sourceSectionIds: [s.sourceSectionId],
        materiality: 'High',
      }));
      if (!claims.length) {
        claims.push({ text: 'No source', confidence: 75, sourceSectionIds: [], materiality: 'High' });
      }
      const analysisType = request.analysisType || 'Applicability Recommendation';
      return {
        ok: true,
        structured: {
          recommendation: analysisType === 'Applicability Recommendation' ? 'Applicable' : 'Classified',
          confidence: analysisType === 'Applicability Recommendation' ? 86 : 84,
          claims,
          classification: 'Consumer Duty / Outcomes',
          candidates: analysisType === 'Regulatory Change Extraction' ? [{ title: 'Fixture change', materiality: 'High' }] : [],
          dimensions: analysisType === 'Impact Suggestion' ? ['Operations', 'Compliance'] : [],
        },
        schemaName: mapSchema(analysisType),
      };
    },
  };
}
