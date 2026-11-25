#!/usr/bin/env node
/** Offline regression: candidate isolation cannot be removed from phase85h / CI contract. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const platformRoot = process.cwd();
const repoRoot = join(platformRoot, '..', '..');

const deploySrc = readFileSync(join(platformRoot, 'scripts/staging/phase85h-deploy-staging-platform.mjs'), 'utf8');
const verifySrc = readFileSync(join(platformRoot, 'scripts/staging/verify-candidate-deployment.mjs'), 'utf8');
const workflowSrc = readFileSync(join(repoRoot, '.github', 'workflows', 'forgeniq-qa.yml'), 'utf8');
const catalogueSrc = readFileSync(join(platformRoot, 'scripts/qa/catalogue.mjs'), 'utf8');

assert.match(deploySrc, /verify-candidate-deployment\.mjs/);
assert.match(deploySrc, /FORGENIQ_REQUIRE_CANDIDATE_ISOLATION/);
assert.match(verifySrc, /FORGENIQ_REQUIRE_CANDIDATE_ISOLATION/);
assert.match(verifySrc, /candidate_not_isolated/);
const packageJson = readFileSync(join(platformRoot, 'package.json'), 'utf8');
assert.match(workflowSrc, /npm run qa/);
assert.match(packageJson, /--mode=ci/);
assert.match(catalogueSrc, /gate: 'candidate'/);
assert.match(catalogueSrc, /UAT-SESSION-RECOVERY/);

console.log(JSON.stringify({ ok: true, check: 'candidate_deployment_isolation_regression' }));