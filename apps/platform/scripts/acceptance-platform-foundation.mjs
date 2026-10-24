#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

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

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, acc);
    } else acc.push(p);
  }
  return acc;
}

const secretPattern = /sk_live|sk_test_[a-zA-Z0-9]{20,}|service_role['"]\s*:\s*['"][^'"]+|SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^$\s]/i;

const platformFiles = walk(platformRoot).filter(
  (f) =>
    !f.includes('node_modules') &&
    !f.includes('.next') &&
    !f.endsWith('.env') &&
    !f.includes(`${join('scripts', 'acceptance')}`),
);

const sourceFiles = platformFiles.filter((f) =>
  /[\\/](app|components|lib|middleware\.ts)[\\/]/.test(f) || /middleware\.ts$/.test(f),
);

for (const f of sourceFiles) {
  if (!/\.(tsx?|jsx?|mjs)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  if (secretPattern.test(text)) failMsg(`possible secret in ${f.replace(platformRoot, '')}`);
}

pass('no hard-coded secrets in platform sources');

const forbiddenImports = [
  'design-lab/regulatory-intelligence',
  'apps/regulatory-intelligence',
  'integrations/regulatory-sources/connectors',
];

for (const f of sourceFiles) {
  const text = readFileSync(f, 'utf8');
  const rel = f.replace(platformRoot, '').replace(/\\/g, '/');
  const ingestionServerAdapter = rel.includes('/lib/ri/ingestion/');
  for (const bad of forbiddenImports) {
    if (bad.includes('integrations/regulatory-sources/connectors') && ingestionServerAdapter) {
      continue;
    }
    if (text.includes(bad)) failMsg(`forbidden import reference ${bad} in ${f}`);
  }
}
pass('no design lab / production MI shell / connector imports (ingestion adapter exempt)');

const clientFiles = platformFiles.filter((p) => p.includes('client.ts') || p.includes('components'));
for (const f of clientFiles) {
  const text = readFileSync(f, 'utf8');
  if (text.includes('SUPABASE_SERVICE_ROLE_KEY') || text.includes('createSupabaseAdminClient')) {
    failMsg(`service role referenced in client path ${f}`);
  }
}
pass('service role not referenced from client paths');

if (!existsSync(join(platformRoot, 'app', 'page.tsx'))) failMsg('missing /');
else pass('/ route file exists');

if (!existsSync(join(platformRoot, 'app', 'ri', 'page.tsx'))) failMsg('missing /ri');
else pass('/ri route file exists');

if (!existsSync(join(platformRoot, 'app', 'health', 'page.tsx'))) failMsg('missing /health');
else pass('/health route file exists');

const signUpPage = join(platformRoot, 'app', 'sign-up', '[[...sign-up]]', 'page.tsx');
if (!existsSync(signUpPage)) failMsg('missing /sign-up');
else pass('/sign-up route file exists');

const middlewareText = readFileSync(join(platformRoot, 'middleware.ts'), 'utf8');
if (!/\/sign-up\(\.\*\)/.test(middlewareText)) failMsg('middleware must treat /sign-up as public');
else pass('/sign-up is a public route in middleware');

const frozenRouter = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'router.js');
if (!existsSync(frozenRouter)) failMsg('frozen RI path missing');
else pass('frozen RI path present');

const gitStatus = execSync('git status --porcelain design-lab/regulatory-intelligence/', {
  cwd: repoRoot,
  encoding: 'utf8',
});
const riChanges = gitStatus.trim().split('\n').filter(Boolean);
const onlyVerification = riChanges.every((line) =>
  /fixtures\/.*verification|verification-evidence-data/.test(line),
);
if (riChanges.length && !onlyVerification) {
  failMsg('unexpected frozen RI working tree changes beyond verification artefacts');
} else if (riChanges.length) {
  pass('frozen RI only has known unstaged verification files (not committed)');
} else {
  pass('frozen RI working tree clean');
}

if (!existsSync(join(platformRoot, '.next', 'BUILD_ID'))) {
  failMsg('run npm run build before acceptance (missing .next/BUILD_ID)');
} else pass('production build output present');

if (fail) {
  console.error(`\nPlatform foundation acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPlatform foundation acceptance: PASS');
