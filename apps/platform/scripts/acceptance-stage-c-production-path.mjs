#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAskRiDeterministic } from '../lib/ri/ask-ri/run-ask-ri.mjs';
import { enforceStageCCatalogueAnswer } from '../lib/ri/reasoner/enforce-stage-c-catalogue-answer.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const serverActions = readFileSync(join(platformRoot, 'lib', 'ri', 'server-actions-ask-ri.ts'), 'utf8');
if (!serverActions.includes('runAskRiProduction')) fail('server-actions must call runAskRiProduction');
else ok('production server action uses runAskRiProduction unified entry');

const prodEntry = readFileSync(join(platformRoot, 'lib', 'ri', 'ask-ri', 'run-ask-ri-production.mjs'), 'utf8');
if (!prodEntry.includes('enforceStageCCatalogueAnswer') && !prodEntry.includes('runAskRiDeterministic')) {
  fail('run-ask-ri-production must delegate to deterministic or V2 paths');
} else ok('unified production entry present');

const runAsk = readFileSync(join(platformRoot, 'lib', 'ri', 'ask-ri', 'run-ask-ri.mjs'), 'utf8');
if (!runAsk.includes('finalizeAskRiProductionResult')) fail('run-ask-ri missing Stage C finalize');
else ok('run-ask-ri wires finalizeAskRiProductionResult');

const sample = enforceStageCCatalogueAnswer({
  status: 'ANSWERED',
  citations: [{ type: 'pdf_primary_v1' }],
  execution: { mustNotPresentAsBindingObligation: true },
});
if (sample.stageC?.applied !== true) fail('stageC metadata missing');
else ok('Stage C metadata on catalogue answer');

const tenant = runAskRiDeterministic({ publicationPdfEvidence: [], publicationHtmlEvidence: [] }, 'List obligations');
if (!tenant.stageC?.applied) fail('tenant path stageC');
else ok('tenant retrieval path includes Stage C');

console.log(JSON.stringify({ ok: failures.length === 0, programmePass: false, note: 'V2 Anthropic path uses render-verified-answer separately' }, null, 2));
process.exit(failures.length ? 1 : 0);