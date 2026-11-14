/**
 * Offline mock Anthropic Messages API for V2 pipeline integration tests (no network).
 */
import { buildEmptyReasonerOutput } from './reasoner-output-schema.mjs';

const MOCK_KEY_PATTERN = /^sk-ant-[a-zA-Z0-9_-]{20,}$/;

export function isMockAnthropicKey(apiKey) {
  return typeof apiKey === 'string' && apiKey.includes('mock-test-key');
}

/**
 * @param {import('./evidence-assembler.mjs').EvidenceBundle} bundle
 */
export function buildReasonerOutputFromBundle(bundle) {
  const chunk = bundle?.evidenceChunks?.[0];
  if (!chunk) {
    return {
      ...buildEmptyReasonerOutput(),
      responseState: 'INSUFFICIENT_EVIDENCE',
      sufficiencyAssessment: {
        overall: 'NO_SUPPORT',
        explanation: 'No chunks in bundle.',
        publicationsConsidered: [],
        publicationsAnswering: [],
      },
    };
  }

  const excerpt = String(chunk.verbatimText || chunk.chunkText || 'Evidence excerpt.').slice(0, 200);
  const end = Math.min(excerpt.length, 120);

  return {
    schemaVersion: 'forgeniq.ask-ri.reasoner-output.v1',
    responseState: 'ANSWERED',
    sufficiencyAssessment: {
      overall: 'DIRECT_SUPPORT',
      explanation: 'Mock provider — offline integration only.',
      publicationsConsidered: [chunk.publicationId],
      publicationsAnswering: [chunk.publicationId],
    },
    narrativeSummary: 'Mock integration response grounded on the first evidence chunk.',
    claims: [
      {
        claimId: 'mock-1',
        claimText: excerpt.slice(0, 80),
        classification:
          chunk.publicationStatus === 'consultation' ? 'consultation_proposal' : 'verified_fact',
        regulatoryStatusOfSource: chunk.publicationStatus || 'guidance',
        evidenceConfidence: 'high',
        humanReviewRequired: chunk.publicationStatus === 'consultation',
        citations: [
          {
            evidenceChunkId: chunk.evidenceChunkId,
            publicationId: chunk.publicationId,
            extractionRevisionId: chunk.extractionRevisionId,
            physicalPageNumber: chunk.physicalPageNumber ?? null,
            sectionReference: chunk.sectionReference ?? null,
            excerptStartOffset: 0,
            excerptEndOffset: end,
            verbatimExcerpt: excerpt.slice(0, end),
          },
        ],
      },
    ],
    citations: [],
    unresolvedAspects: [],
    humanReviewRequired: chunk.publicationStatus === 'consultation',
    uncertaintyNotes: ['Offline mock provider — not an authoritative regulatory conclusion.'],
    verificationStatus: 'PASSED',
  };
}

/**
 * @param {import('./evidence-assembler.mjs').EvidenceBundle} bundle
 */
export function createMockAnthropicReasonerFetch(bundle) {
  return async (url, init) => {
    if (!String(url).includes('/v1/messages')) {
      return new Response(JSON.stringify({ error: 'unexpected_url' }), { status: 400 });
    }
    const apiKey = init?.headers?.['x-api-key'] || init?.headers?.get?.('x-api-key');
    if (!MOCK_KEY_PATTERN.test(String(apiKey || ''))) {
      return new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error' } }), {
        status: 401,
      });
    }

    const modelOutput = buildReasonerOutputFromBundle(bundle);
    const body = {
      id: 'msg_mock_offline',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 512, output_tokens: 256 },
      content: [{ type: 'text', text: JSON.stringify(modelOutput) }],
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'request-id': 'mock-req-1' },
    });
  };
}

export const MOCK_ANTHROPIC_API_KEY = 'sk-ant-api03-mock-test-key-offline-integration-only';