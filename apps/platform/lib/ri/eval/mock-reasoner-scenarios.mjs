/**
 * Controlled offline reasoner outputs for evidence-grounded eval (authentic corpus excerpts only).
 */
import { buildEmptyReasonerOutput } from '../reasoner/reasoner-output-schema.mjs';

/** @typedef {'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT'} EvidenceScenario */

function claimFromChunk(chunk) {
  const excerpt = String(chunk.verbatimText || chunk.chunkText || '').slice(0, 200);
  const end = Math.min(excerpt.length, 120);
  return {
    claimId: 'scenario-1',
    claimText: excerpt.slice(0, 80) || 'Grounded claim from corpus chunk.',
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
  };
}

/**
 * @param {import('../reasoner/evidence-assembler.mjs').EvidenceBundle|null} bundle
 * @param {EvidenceScenario} scenario
 */
export function buildReasonerOutputForScenario(bundle, scenario) {
  const chunk = bundle?.evidenceChunks?.[0];
  if (!chunk || scenario === 'INSUFFICIENT') {
    return {
      ...buildEmptyReasonerOutput(),
      responseState: 'INSUFFICIENT_EVIDENCE',
      sufficiencyAssessment: {
        overall: 'NO_SUPPORT',
        explanation: 'Controlled scenario — insufficient or irrelevant evidence.',
        publicationsConsidered: bundle?.publicationsRepresented || [],
        publicationsAnswering: [],
      },
    };
  }

  const claim = claimFromChunk(chunk);
  if (scenario === 'PARTIAL') {
    return {
      schemaVersion: 'forgeniq.ask-ri.reasoner-output.v1',
      responseState: 'PARTIAL_ANSWER',
      sufficiencyAssessment: {
        overall: 'PARTIAL_SUPPORT',
        explanation: 'Controlled scenario — partial evidence only.',
        publicationsConsidered: bundle.publicationsRepresented || [chunk.publicationId],
        publicationsAnswering: [chunk.publicationId],
      },
      narrativeSummary: 'Partial answer from first retrieved chunk; further aspects unresolved.',
      claims: [claim],
      citations: [],
      unresolvedAspects: ['Additional question aspects not covered by retrieved passages.'],
      humanReviewRequired: true,
      uncertaintyNotes: ['Offline scenario mock — SME review required for substantive accuracy.'],
      verificationStatus: 'PASSED',
    };
  }

  return {
    schemaVersion: 'forgeniq.ask-ri.reasoner-output.v1',
    responseState: 'ANSWERED',
    sufficiencyAssessment: {
      overall: 'DIRECT_SUPPORT',
      explanation: 'Controlled scenario — sufficient evidence from corpus.',
      publicationsConsidered: bundle.publicationsRepresented || [chunk.publicationId],
      publicationsAnswering: [chunk.publicationId],
    },
    narrativeSummary: 'Scenario mock grounded on authentic corpus chunk.',
    claims: [claim],
    citations: [],
    unresolvedAspects: [],
    humanReviewRequired: Boolean(chunk.publicationStatus === 'consultation'),
    uncertaintyNotes: ['Offline scenario mock — not authoritative regulatory conclusion.'],
    verificationStatus: 'PASSED',
  };
}

/**
 * Two material aspects: one verified claim from chunk A; second aspect listed unresolved (no invented COBS/CONC).
 */
export function buildGenuinePartialReasonerOutput(bundle) {
  const chunks = bundle?.evidenceChunks || [];
  const chunkA = chunks[0];
  const chunkB = chunks.find((c, i) => i > 0 && c.publicationId !== chunkA?.publicationId) || chunks[1];
  if (!chunkA) {
    return buildReasonerOutputForScenario(bundle, 'INSUFFICIENT');
  }
  const claimA = claimFromChunk(chunkA);
  claimA.claimId = 'supported-aspect';
  claimA.claimText = String(chunkA.verbatimText || '').slice(0, 100) || claimA.claimText;

  const claims = [claimA];
  if (chunkB && chunkB.evidenceChunkId !== chunkA.evidenceChunkId) {
    const claimB = claimFromChunk(chunkB);
    claimB.claimId = 'context-only';
    claimB.classification = 'guidance_expectation';
    claimB.claimText = String(chunkB.verbatimText || '').slice(0, 80);
    claims.push(claimB);
  }

  return {
    schemaVersion: 'forgeniq.ask-ri.reasoner-output.v1',
    responseState: 'PARTIAL_ANSWER',
    sufficiencyAssessment: {
      overall: 'PARTIAL_SUPPORT',
      explanation: 'Genuine partial — one aspect verified in bundle; second aspect unresolved.',
      publicationsConsidered: bundle.publicationsRepresented || [],
      publicationsAnswering: [chunkA.publicationId],
    },
    narrativeSummary: 'Documented monitoring expectations are supported; harm assessment scope remains unresolved.',
    claims,
    citations: [],
    unresolvedAspects: [
      'Specific consumer harm metrics and assessment methodology not established in retrieved passages.',
    ],
    humanReviewRequired: true,
    uncertaintyNotes: ['Genuine partial regression mock — SME review required.'],
    verificationStatus: 'PASSED',
  };
}

export function createGenuinePartialMockFetch(bundle) {
  return createScenarioMockFetch(bundle, 'PARTIAL', { genuinePartial: true });
}

export function createScenarioMockFetch(bundle, scenario, options = {}) {
  const modelOutput = options.genuinePartial
    ? buildGenuinePartialReasonerOutput(bundle)
    : buildReasonerOutputForScenario(bundle, scenario);
  return async (url, init) => {
    if (!String(url).includes('/v1/messages')) {
      return new Response(JSON.stringify({ error: 'unexpected_url' }), { status: 400 });
    }
    const body = {
      id: 'msg_scenario_mock',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 512, output_tokens: 256 },
      content: [{ type: 'text', text: JSON.stringify(modelOutput) }],
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}