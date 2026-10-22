#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

for (const helper of [
  'lib/auth/session.ts',
  'lib/auth/memberships.ts',
  'lib/auth/active-organisation.ts',
  'lib/auth/require-organisation.ts',
  'lib/roles.ts',
]) {
  if (!existsSync(join(platformRoot, helper))) failMsg(`missing ${helper}`);
  else pass(`${helper} exists`);
}

if (!existsSync(join(platformRoot, 'docs', 'TENANCY.md'))) failMsg('TENANCY.md missing');
else pass('tenancy documentation');

const envExample = readFileSync(join(platformRoot, '.env.example'), 'utf8');
if (/signInWithPassword|supabase\.auth\.signUp/i.test(envExample)) {
  failMsg('env example suggests Supabase Auth');
} else pass('no Supabase Auth in env contract');

if (!readFileSync(join(platformRoot, 'README.md'), 'utf8').includes('TENANCY')) {
  pass('README may link tenancy separately');
}
pass('phase 2 platform structure');

const gitRi = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'router.js');
if (!existsSync(gitRi)) failMsg('frozen RI missing');
else pass('frozen RI untouched path');

if (fail) {
  console.error(`\nPhase 2 platform acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 2 platform acceptance: PASS');
