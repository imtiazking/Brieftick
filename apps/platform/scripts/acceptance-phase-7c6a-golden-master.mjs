#!/usr/bin/env node
/**
 * Phase 7C.6A — AI completion (freshness, lineage, materialisation, work queue).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPhase7c6aWorkflowVerification } from './local-db/workflow-phase-7c6a.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

for (const f of [
  'lib/ri/ai/freshness-sql.mjs',
  'lib/ri/services/ai-materialisation.ts',
  'lib/ri/services/publication-versions.ts',
  'lib/ri/services/ai-notifications.ts',
  'supabase/migrations/20260325130000_ri_ai_lineage.sql',
]) {
  if (!existsSync(join(platformRoot, f))) failMsg(`missing ${f}`);
  else pass(f);
}

const wq = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'work-queue.ts'), 'utf8');
if (wq.includes("entityType: 'AI_REVIEW'")) pass('work queue AI_REVIEW items');
else failMsg('work queue AI integration');

const ingest = readFileSync(join(platformRoot, 'lib', 'ri', 'ingestion', 'ingest-engine.mjs'), 'utf8');
if (ingest.includes('markAnalysesOutdatedForPublicationVersionSql')) pass('ingestion freshness wiring');
else failMsg('ingestion freshness');

const wf = await runPhase7c6aWorkflowVerification();
for (const m of wf.pass) pass(`local DB: ${m}`);
for (const m of wf.fail) failMsg(`local DB: ${m}`);

if (fail) {
  console.error(`\nPhase 7C.6A golden master acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 7C.6A golden master acceptance: PASS');
