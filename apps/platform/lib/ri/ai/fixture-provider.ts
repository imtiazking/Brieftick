import 'server-only';

import { AI_ERRORS } from '@/lib/ri/ai/errors';
import { mapSchemaForAnalysisType } from '@/lib/ri/ai/output-schemas';

export const FIXTURE_PROVIDER_ID = 'AIPROV-FIXTURE-001';

export type FixtureProviderRequest = {
  useCaseId?: string;
  analysisType?: string;
  fixtureScenario?: string;
  /** Passed through to live Anthropic provider; ignored by fixture provider. */
  budgetContext?: {
    organisationId?: string;
    idempotencyKey?: string;
    maxOutputTokens?: number;
  };
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
      if (scenario === 'health-check') {
        return {
          ok: true,
          structured: {
            recommendation: 'Not Applicable',
            confidence: 100,
            claims: [
              {
                text: 'Fixture provider health check',
                confidence: 100,
                sourceSectionIds: request.context?.sourceSections?.map((s) => s.sourceSectionId) ?? [],
              },
            ],
          },
          schemaName: 'ApplicabilityResult',
          latencyMs: 1,
        };
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
      const analysisType = request.analysisType || 'Applicability Recommendation';
      const sectionId = sections[0]?.sourceSectionId;

      if (scenario === 'obligation-invalid-citation') {
        return {
          ok: true,
          structured: {
            confidence: 80,
            claims: [
              {
                text: 'Invalid obligation claim',
                confidence: 80,
                sourceSectionIds: ['SRCSEC-DOES-NOT-EXIST'],
              },
            ],
            candidates: [{ statement: 'Should not materialise', citation: 'n/a' }],
          },
          schemaName: 'ObligationExtractionResult',
          latencyMs: 40,
        };
      }

      let candidateCount = 2;
      if (scenario === 'change-extraction-five') candidateCount = 5;

      const claims = sections.slice(0, candidateCount).map((s, i) => ({
        text: `Fixture claim ${i + 1} grounded in ${s.citation || s.sourceSectionId}`,
        confidence: request.useCaseId === 'UC-RI-003' ? 86 : 84,
        sourceSectionIds: [s.sourceSectionId],
        claimType: request.analysisType || 'Recommendation',
        materiality: 'High',
      }));
      while (claims.length < candidateCount && sectionId) {
        const i = claims.length;
        claims.push({
          text: `Fixture claim ${i + 1} grounded in section`,
          confidence: 84,
          sourceSectionIds: [sectionId],
          claimType: 'Recommendation',
          materiality: 'High',
        });
      }
      if (!claims.length) {
        claims.push({
          text: 'Fixture recommendation without source (should fail citation policy)',
          confidence: 75,
          sourceSectionIds: [],
          claimType: 'Recommendation',
          materiality: 'High',
        });
      }

      if (scenario === 'stage3-impact-risk' && analysisType === 'Risk Mapping') {
        return {
          ok: true,
          structured: {
            confidence: 81,
            riskProposals: [
              {
                title: 'Non-compliance with approved regulatory obligation',
                description: 'Failure to meet operational requirements from approved impact.',
                category: 'Compliance',
                inherent_risk: 'HIGH',
                residual_risk: 'MEDIUM',
              },
            ],
            existingRiskMappings: [],
            claims: claims.slice(0, 3),
            regulatoryGaps: ['Monitoring evidence may be incomplete.'],
            uncertainties: ['Organisation risk appetite not verified by AI.'],
          },
          schemaName: 'RiskMappingResult',
          latencyMs: 14,
        };
      }

      if (scenario === 'stage4-risk-control' && analysisType === 'Control Mapping') {
        return {
          ok: true,
          structured: {
            confidence: 80,
            controlProposals: [
              {
                name: 'Obligation compliance monitoring control',
                description: 'Periodic attestation and evidence review for regulatory obligation.',
                control_type: 'Detective',
                effectiveness: 'NOT_TESTED',
              },
            ],
            existingControlMappings: [],
            claims: claims.slice(0, 3),
          },
          schemaName: 'ControlMappingResult',
          latencyMs: 14,
        };
      }

      if (scenario === 'stage5-control-assurance' && analysisType === 'Control Assurance Plan') {
        return {
          ok: true,
          structured: {
            confidence: 79,
            testPlan: {
              reviewType: 'control_test',
              objective: 'Confirm control operates effectively for mapped risk.',
              procedure: 'Sample obligations, inspect evidence, interview owner.',
              evidenceRequirements: 'Policy, procedure, sample testing workpapers.',
              assignedTester: null,
            },
            claims: claims.slice(0, 2),
          },
          schemaName: 'ControlAssurancePlanResult',
          latencyMs: 12,
        };
      }

      if (scenario === 'stage2-obligation-impact' && analysisType === 'Impact Suggestion') {
        return {
          ok: true,
          structured: {
            confidence: 82,
            dimensions: [
              'Regulatory',
              'Operations',
              'Technology',
              'Data protection',
              'Third-party',
            ],
            claims: claims.slice(0, 4),
            implementationDeadlines: 'Confirm against publication effective dates.',
            complianceGaps: ['Policy refresh may be required.', 'Training needs assessment pending.'],
            dependencies: ['Approved obligation register entry', 'Change owner sign-off'],
            uncertainties: ['Organisation-specific system inventory not verified by AI.'],
          },
          schemaName: 'ImpactSuggestionResult',
          latencyMs: 12,
          inputTokenEstimate: 900,
          outputTokenEstimate: 280,
        };
      }

      const changeCandidates =
        analysisType === 'Regulatory Change Extraction'
          ? claims.map((_, i) => ({
              title: `Fixture regulatory change ${i + 1}`,
              changeType: 'POLICY',
              materiality: 'High',
            }))
          : [];

      const obligationCandidates =
        analysisType === 'Obligation Extraction'
          ? claims.map((c, i) => ({
              statement: `Fixture obligation statement ${i + 1}`,
              citation: c.sourceSectionIds?.[0] || 's1',
              sourceSection: `Section ${i + 1}`,
            }))
          : [];

      const structured: Record<string, unknown> = {
        recommendation: analysisType === 'Applicability Recommendation' ? 'Applicable' : 'Classified',
        confidence: analysisType === 'Applicability Recommendation' ? 86 : 84,
        claims,
        classification: 'Consumer Duty / Outcomes',
        candidates:
          analysisType === 'Regulatory Change Extraction'
            ? changeCandidates
            : analysisType === 'Obligation Extraction'
              ? obligationCandidates
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
