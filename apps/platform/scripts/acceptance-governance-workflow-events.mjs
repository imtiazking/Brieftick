#!/usr/bin/env node
/**
 * Regression: /ri/governance must query workflow_events.occurred_at (not created_at).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const lifecycleSql = readFileSync(
  join(platformRoot, 'supabase', 'migrations', '20260322150100_ri_lifecycle.sql'),
  'utf8',
);
const governanceTs = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'governance.ts'), 'utf8');
const governancePage = readFileSync(join(platformRoot, 'app', 'ri', 'governance', 'page.tsx'), 'utf8');

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

const wfBlock = lifecycleSql.match(/create table public\.workflow_events\s*\([\s\S]*?\);/i);
if (!wfBlock) failMsg('workflow_events DDL missing');
else {
  if (!wfBlock[0].includes('occurred_at')) failMsg('workflow_events must define occurred_at');
  else pass('schema workflow_events.occurred_at');
  if (/\bcreated_at\b/.test(wfBlock[0])) failMsg('workflow_events must not use created_at column');
  else pass('schema workflow_events has no created_at');
}

if (!governanceTs.includes('occurred_at')) failMsg('governance service must select/order occurred_at');
else pass('governance service uses occurred_at');

if (governanceTs.includes('created_at')) failMsg('governance service must not reference created_at');
else pass('governance service has no created_at');

if (!governancePage.includes('occurred_at')) failMsg('governance page must render occurred_at');
else pass('governance page uses occurred_at');

if (governancePage.includes('created_at')) failMsg('governance page must not reference created_at');
else pass('governance page has no created_at');

if (fail > 0) {
  console.error(`\nGovernance workflow_events acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nGovernance workflow_events acceptance: PASS');
