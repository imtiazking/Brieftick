#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const evalDir = join(import.meta.dirname, '..', 'lib', 'ri', 'eval');
const budgetMod = await import(pathToFileURL(join(evalDir, '..', 'reasoner', 'anthropic-eval-budget.mjs')).href);
const checkpointMod = await import(pathToFileURL(join(evalDir, 'eval-checkpoint.mjs')).href);
const progressMod = await import(pathToFileURL(join(evalDir, 'eval-progress.mjs')).href);
const coreMod = await import(pathToFileURL(join(evalDir, '..', 'ai', 'anthropic-messages-core.mjs')).href);

const est = budgetMod.estimateEvalCaseReserveUsd('claude-haiku-5-5', 15000, {
  maxOutputTokens: 8192,
  maxRetryOutputTokens: 16384,
});
if (est > 0.007 && est < 0.02) ok('eval case reserve estimate in expected range');
else fail(`eval case reserve estimate (${est})`);

const spend = new budgetMod.EvalSpendTracker({ budgetUsd: 1, model: 'claude-haiku-5-5' });
spend.reserveEstimate(0.01);
spend.settlePendingReservation();
spend.recordAttempt({ inputTokens: 4000, outputTokens: 8000 });
spend.finalizeCalculated();
if (Math.abs(spend.estimatedUsd - spend.calculatedUsd) < 0.0001) ok('estimatedUsd reconciles after finalize');
else fail(`estimate reconcile est=${spend.estimatedUsd} calc=${spend.calculatedUsd}`);

const dir = mkdtempSync(join(tmpdir(), 'fqi-eval-'));
const ck = join(dir, 'ck.json');
checkpointMod.writeCheckpointAtomic(ck, { n: 1 });
checkpointMod.writeCheckpointAtomic(ck, { n: 2 });
if (JSON.parse(readFileSync(ck, 'utf8')).n === 2) ok('atomic checkpoint overwrite');
else fail('atomic checkpoint');
rmSync(dir, { recursive: true, force: true });

const line = progressMod.formatEvalProgressEvent({ testId: 'EVAL-D-02', caseIndex: 1 });
if (line.includes('eval_progress') && line.includes('EVAL-D-02')) ok('progress event format');
else fail('progress format');

let timeoutCode = null;
const slow = await coreMod.callAnthropicMessages(
  'sk-ant-api03-test-key-abcdefghijklmnopqrstuvwxyz',
  { model: 'claude-haiku-5-5', system: 's', user: 'u', timeoutMs: 80 },
  {
    fetchFn: async () => ({
      ok: true,
      status: 200,
      text: async () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(JSON.stringify({ content: [{ type: 'text', text: '{}' }] })), 500);
        }),
    }),
  },
);
if (slow.code === coreMod.AI_ERROR_CODES.AI_TIMEOUT) {
  ok('wall-clock timeout on slow body read');
} else {
  fail(`slow body timeout got ${slow.code}`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, passed: 5 }));
