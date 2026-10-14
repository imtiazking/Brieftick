import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { resolveBridgeRoot, LOCAL_RI_DEV_ORIGIN, resolveRepoRoot } from './lib/ri-bridge-locations.mjs';
import { createFreshState } from '../js/migrate.js';
import { AiContextBuilder } from '../js/ai/context-builder.js';
import { AI_TASK_TYPE, CONTEXT_RECORD_CATEGORY } from '../js/ai/enums.js';
import { RI_SUMMARY_PROMPT_V1 } from '../js/ai/prompt-metadata.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolveRepoRoot(__dir);
const BRIDGE_ROOT = resolveBridgeRoot();

async function main() {
  const key = process.env.OPENAI_API_KEY || '';
  const model = process.env.RI_AI_MODEL || '';
  if (!key || !model) {
    console.log('OPENAI AI LIVE VERIFIED: NOT CONFIGURED');
    process.exit(0);
  }

  process.env.FORGENIQ_REPO_ROOT = REPO_ROOT;
  process.env.RI_AI_PROVIDER = process.env.RI_AI_PROVIDER || 'openai';

  const state = createFreshState();
  const builder = new AiContextBuilder(state);
  const ctx = await builder.build({
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    selection: [{ category: CONTEXT_RECORD_CATEGORY.RI_RECORD, recordType: 'Publication', recordId: 'PUB-001' }],
  });

  const payload = {
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    analysisId: `AIA-LIVE-VERIFY-${Date.now()}`,
    context: { records: ctx.records },
    contextHash: ctx.contextHash,
    promptId: RI_SUMMARY_PROMPT_V1.promptId,
    promptVersion: RI_SUMMARY_PROMPT_V1.version,
    outputSchemaVersion: RI_SUMMARY_PROMPT_V1.outputSchemaVersion,
  };

  const port = process.env.RI_AI_BRIDGE_PORT || '3765';
  const origin = LOCAL_RI_DEV_ORIGIN;
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.log('OPENAI AI LIVE VERIFIED: FAIL (bridge unreachable)');
    process.exit(1);
  }

  const json = await res.json();
  const text = JSON.stringify(json);
  if (text.includes(key) || /Bearer\s+sk-/i.test(text)) {
    console.log('OPENAI AI LIVE VERIFIED: FAIL (secret leak)');
    process.exit(1);
  }

  if (res.status === 200 && json.analysis?.status === 'COMPLETED') {
    console.log('OPENAI AI LIVE VERIFIED: PASS');
    process.exit(0);
  }

  console.log(`OPENAI AI LIVE VERIFIED: FAIL (status ${res.status})`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
