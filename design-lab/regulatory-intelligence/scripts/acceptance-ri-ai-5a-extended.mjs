import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import http from 'http';
import {
  AI_ANALYSIS_STATUS,
  AI_TASK_TYPE,
  AI_ANALYSIS_ERROR_CODES,
} from '../js/ai/enums.js';
import { RI_SUMMARY_PROMPT_V1 } from '../js/ai/prompt-metadata.js';
import { AiContextBuilder } from '../js/ai/context-builder.js';
import { CONTEXT_RECORD_CATEGORY } from '../js/ai/enums.js';
import { createFreshState } from '../js/migrate.js';
import { OpenAiResponsesProvider, buildResponsesApiRequest } from '../js/ai/openai-responses-provider.js';
import { AiOutputValidator } from '../js/ai/output-validator.js';
import {
  canGenerateAiSummary,
  canMutateAiReviewState,
  isAuditorReadOnly,
} from '../js/ai/persona-ai.js';
import { LOCAL_RI_DEV_ORIGIN, resolveRepoRoot } from './lib/ri-bridge-locations.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const RI_ROOT = join(__dir, '..');
const REPO_ROOT = resolveRepoRoot(__dir);

function pass(R, id, ok, reason = '') {
  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
}

function request(server, { method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        method,
        path,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = { raw: text };
          }
          resolve({ status: res.statusCode, json, text });
        });
      }
    );
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

async function buildAnalyzePayload(publicationId = 'PUB-001') {
  const state = createFreshState();
  const builder = new AiContextBuilder(state);
  const ctx = await builder.build({
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    selection: [{ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Publication', recordId: publicationId }],
  });
  return {
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    analysisId: 'AIA-BRIDGE-TEST',
    context: { records: ctx.records },
    contextHash: ctx.contextHash,
    promptId: RI_SUMMARY_PROMPT_V1.promptId,
    promptVersion: RI_SUMMARY_PROMPT_V1.version,
    outputSchemaVersion: RI_SUMMARY_PROMPT_V1.outputSchemaVersion,
    _ctx: ctx,
    _state: state,
  };
}

export async function runAi5aExtendedAcceptance(R = {}) {
  const bridgeRoot = process.env.RI_AI_BRIDGE_HOME || join(process.env.LOCALAPPDATA || '', 'forgeniq-ri', 'ri-ai-bridge');
  const { createAiBridgeServer } = await import(pathToFileURL(join(bridgeRoot, 'http-server.js')).href);
  const { loadBridgeConfig } = await import(pathToFileURL(join(bridgeRoot, 'bridge-config.js')).href);

  // AI-011 mock OpenAI transport
  const captured = { bodies: [], attempts: 0 };
  const transport = async (url, opts) => {
    captured.attempts += 1;
    captured.bodies.push(JSON.parse(opts.body));
    const payload = {
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify({ summary: 'ok', citations: [] }) }],
        },
      ],
    };
    const text = JSON.stringify(payload);
    return {
      ok: true,
      status: 200,
      text: async () => text,
    };
  };
  const provider = new OpenAiResponsesProvider({
    env: { OPENAI_API_KEY: 'sk-test', RI_AI_MODEL: 'gpt-test-model', RI_AI_PROVIDER: 'openai' },
    transport,
  });
  const state = createFreshState();
  const builder = new AiContextBuilder(state);
  const ctx = await builder.build({
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    selection: [{ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Publication', recordId: 'PUB-001' }],
  });
  const result = await provider.analyze({ contextBundle: ctx, taskType: AI_TASK_TYPE.AI_SUMMARY });
  const reqBody = captured.bodies[0];
  pass(R, 'AI-011-store-false', reqBody?.store === false);
  pass(R, 'AI-011-strict-schema', reqBody?.text?.format?.strict === true);
  pass(R, 'AI-011-model', reqBody?.model === 'gpt-test-model');
  pass(R, 'AI-011-max-tokens', typeof reqBody?.max_output_tokens === 'number' && reqBody.max_output_tokens > 0);
  pass(R, 'AI-011-no-previous-response', !reqBody?.previous_response_id);
  pass(R, 'AI-011-completed', result.ok === true);
  const built = buildResponsesApiRequest({ model: 'm', instructions: 'x', contextText: 'y' });
  pass(R, 'AI-011-no-browser-instructions-in-build', !String(built.instructions).includes('<script>'));
  pass(R, 'AI-011-no-key-in-result', !JSON.stringify(result).includes('sk-test'));

  const envBase = {
    FORGENIQ_REPO_ROOT: REPO_ROOT,
    RI_ALLOWED_ORIGINS: LOCAL_RI_DEV_ORIGIN,
    RI_AI_CACHE_DIR: '',
  };
  const cfg = loadBridgeConfig(envBase);
  const server = createAiBridgeServer(cfg);

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const payload = await buildAnalyzePayload();

  const hashMismatch = await request(server, {
    method: 'POST',
    path: '/analyze',
    headers: { Origin: LOCAL_RI_DEV_ORIGIN, 'Content-Type': 'application/json', Host: `127.0.0.1:${server.address().port}` },
    body: JSON.stringify({ ...payload, contextHash: 'deadbeef', _ctx: undefined, _state: undefined }),
  });
  pass(R, 'AI-012-hash-mismatch', hashMismatch.status === 400);

  const notConfigured = await request(server, {
    method: 'POST',
    path: '/analyze',
    headers: { Origin: LOCAL_RI_DEV_ORIGIN, 'Content-Type': 'application/json', Host: `127.0.0.1:${server.address().port}` },
    body: JSON.stringify({ ...payload, _ctx: undefined, _state: undefined }),
  });
  pass(R, 'AI-012-not-configured', notConfigured.status === 503);

  server.close();

  process.env.FORGENIQ_REPO_ROOT = REPO_ROOT;
  process.env.RI_AI_BRIDGE_MOCK_OPENAI = '1';
  process.env.RI_AI_BRIDGE_MOCK_SCENARIO = 'valid';
  const mockCfg = loadBridgeConfig({ ...envBase, RI_AI_BRIDGE_MOCK_OPENAI: '1' });
  const mockServer = createAiBridgeServer(mockCfg);
  await new Promise((r) => mockServer.listen(0, '127.0.0.1', r));
  const port = mockServer.address().port;
  const hostHdr = { Host: `127.0.0.1:${port}` };

  const good = await request(mockServer, {
    method: 'POST',
    path: '/analyze',
    headers: { Origin: LOCAL_RI_DEV_ORIGIN, 'Content-Type': 'application/json', ...hostHdr },
    body: JSON.stringify({ ...payload, _ctx: undefined, _state: undefined }),
  });
  pass(R, 'AI-012-valid-request', good.status === 200 && good.json.analysis?.status === AI_ANALYSIS_STATUS.COMPLETED);

  if (good.json?.analysis) {
    const v = new AiOutputValidator({ state: payload._state, contextBundle: payload._ctx });
    const reval = v.validateProviderOutput(AI_TASK_TYPE.AI_SUMMARY, {
      summary: good.json.analysis.summary,
      citations: good.json.analysis.citations,
      keyDates: good.json.analysis.sections?.keyDates || [],
      findings: good.json.analysis.findings,
    });
    pass(R, 'AI-012-browser-revalidate', reval.ok);
  } else {
    pass(R, 'AI-012-browser-revalidate', false, JSON.stringify(good.json));
  }

  process.env.RI_AI_BRIDGE_MOCK_SCENARIO = 'invalid-citation';
  const badServer = createAiBridgeServer(loadBridgeConfig(envBase));
  await new Promise((r) => badServer.listen(0, '127.0.0.1', r));
  const badPort = badServer.address().port;
  const bad = await request(badServer, {
    method: 'POST',
    path: '/analyze',
    headers: {
      Origin: LOCAL_RI_DEV_ORIGIN,
      'Content-Type': 'application/json',
      Host: `127.0.0.1:${badPort}`,
    },
    body: JSON.stringify({ ...payload, _ctx: undefined, _state: undefined }),
  });
  pass(
    R,
    'AI-012-invalid-citation-rejected',
    bad.status === 400 && bad.json.analysis?.status === AI_ANALYSIS_STATUS.VALIDATION_FAILED
  );
  badServer.close();
  mockServer.close();

  // AI-013 personas
  const analyst = createFreshState();
  analyst.currentDemoUserId = analyst.people.find((p) => p.applicationRoleIds?.includes('AR-REG-ANALYST'))?.id;
  pass(R, 'AI-013-analyst-generate', canGenerateAiSummary(analyst));
  pass(R, 'AI-013-analyst-review', canMutateAiReviewState(analyst));

  const cm = createFreshState();
  cm.currentDemoUserId = cm.people.find((p) => p.applicationRoleIds?.includes('AR-COMPLIANCE-REVIEWER'))?.id;
  pass(R, 'AI-013-cm-generate', canGenerateAiSummary(cm));
  pass(R, 'AI-013-cm-review', canMutateAiReviewState(cm));

  const auditor = createFreshState();
  auditor.currentDemoUserId = auditor.people.find((p) => p.applicationRoleIds?.includes('AR-AUDIT-VIEWER'))?.id;
  pass(R, 'AI-013-auditor-readonly', isAuditorReadOnly(auditor));
  pass(R, 'AI-013-auditor-no-generate', !canGenerateAiSummary(auditor));
  pass(R, 'AI-013-auditor-no-review', !canMutateAiReviewState(auditor));

  return R;
}
