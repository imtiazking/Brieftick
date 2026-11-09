#!/usr/bin/env node
/**
 * Live staging Ask RI path for Fair value (service role, no mocks).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { attachPublicationPdfEvidenceToAskRiState } from '../../lib/ri/ask-ri/load-publication-pdf-evidence.mjs';
import { runAskRiDeterministic } from '../../lib/ri/ask-ri/run-ask-ri.mjs';
import { buildAskRiEvidenceTrace } from '../../lib/ri/ask-ri/ask-ri-trace.mjs';
import { CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION } from '../../lib/ri/ask-ri/publication-pdf-question-match.mjs';

const HTML_ONLY =
  "Using only the FCA webpage 'Fair value in consumer finance', explain what it says about Consumer Duty fair-value assessments. Provide citations to the original webpage and its relevant sections. Do not use PDF sources or invent regulatory deadlines.";

const dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(dir, '../../.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }
  }
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function runQuestion(question) {
  const state = {};
  await attachPublicationPdfEvidenceToAskRiState(state, admin, question);
  const result = runAskRiDeterministic(state, question);
  const trace = buildAskRiEvidenceTrace(state, result);
  return {
    question: question.slice(0, 80) + '…',
    status: result.status,
    citationCount: result.citations?.length ?? 0,
    citationTypes: [...new Set((result.citations || []).map((c) => c.type))],
    evidenceSource: result.execution?.evidenceSource,
    answerPreview: String(result.answer || '').slice(0, 280),
    trace,
  };
}

const out = {
  htmlOnly: await runQuestion(HTML_ONLY),
  htmlPlusPdf: await runQuestion(CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION),
};
console.log(JSON.stringify(out, null, 2));
