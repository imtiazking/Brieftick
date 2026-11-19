/** Acceptance-only mock OpenAI Responses transport (no real API calls). */

function mockResponseBody(structured) {
  return {
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(structured) }],
      },
    ],
  };
}

function sourceFromOpenAiInput(contextText) {
  const tagged = contextText.match(/\[PUB-001\]\s*([\s\S]*)/);
  return (tagged ? tagged[1] : contextText).trim();
}

function validStructured(records, contextText = '') {
  const pub = records.find((r) => r.recordId === 'PUB-001');
  const pubText = pub?.sourceContent || sourceFromOpenAiInput(contextText);
  const norm = pubText.replace(/\s+/g, ' ').trim();
  const excerpt =
    (norm.length >= 20 ? norm.slice(0, Math.min(80, norm.length)) : null) ||
    'FCA Consumer Duty supervisory update PS26/14 requires firms to monitor customer outcomes by cohort.';
  return {
    summary: 'Bridge mock supervisory update summary.',
    whatIsThis: 'FCA supervisory update (mock).',
    whatChanged: 'Monitoring expectations (mock).',
    whoMayBeAffected: 'FCA-regulated firms.',
    keyDates: ['2027-01-01'],
    keyPoints: ['Outcome monitoring'],
    areasRequiringReview: ['MI design'],
    uncertainties: ['Scope requires review.'],
    findings: ['Firms must evidence customer outcomes monitoring.'],
    citations: [
      {
        citationKind: 'RI_RECORD',
        recordId: 'PUB-001',
        recordType: 'Publication',
        internalRoute: '#/publications/PUB-001',
        excerpt,
      },
    ],
    modelReportedConfidence: 0.75,
  };
}

export function createBridgeMockTransport(scenario = 'valid') {
  return async (url, { method, headers, body, signal }) => {
    if (signal?.aborted) {
      return { ok: false, status: 0, text: 'aborted', aborted: true };
    }
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    if (headers?.Authorization?.includes('acceptance-mock-key')) {
      // ok
    }
    if (parsed?.previous_response_id) {
      return { ok: false, status: 400, text: 'previous_response_id not allowed' };
    }
    if (scenario === 'invalid-citation') {
      const text = JSON.stringify(
        mockResponseBody({
          summary: 'Bad citation',
          citations: [
            {
              citationKind: 'OFFICIAL_SOURCE',
              sourceRecordId: 'RAW-NOT-IN-CONTEXT',
              excerpt: 'This excerpt is definitely long enough to pass minimum length checks here.',
            },
          ],
        })
      );
      return { ok: true, status: 200, text: async () => text };
    }
    const contextText = parsed?.input?.[0]?.content?.[0]?.text || '';
    const source = sourceFromOpenAiInput(contextText);
    const records = contextText.includes('PUB-001') ? [{ recordId: 'PUB-001', sourceContent: source }] : [];
    const text = JSON.stringify(mockResponseBody(validStructured(records, contextText)));
    return { ok: true, status: 200, text: async () => text };
  };
}
