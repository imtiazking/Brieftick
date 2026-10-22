#!/usr/bin/env node
/**
 * Phase 7A — master local/offline RI acceptance (orchestrates existing suites).
 * Does not duplicate test logic. Requires Node; embedded Postgres for 3A+ workflow suites.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');
const refDataRoot = join(repoRoot, 'packages', 'reference-data');
const integrationsRoot = join(repoRoot, 'integrations', 'regulatory-sources');

let failed = 0;

function runStep(label, command, args, cwd) {
  console.log(`\n=== ${label} ===\n`);
  const r = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    failed += 1;
    console.error(`\nFAILED: ${label} (exit ${r.status ?? 'signal'})\n`);
    return false;
  }
  console.log(`\nOK: ${label}\n`);
  return true;
}

const steps = [
  ['Platform foundation (Phase 1)', 'npm', ['run', 'test:acceptance'], platformRoot],
  ['Platform + tenant (Phase 2)', 'npm', ['run', 'test:acceptance:phase2'], platformRoot],
  ['RI schema static (Phase 3)', 'npm', ['run', 'test:acceptance:phase3'], platformRoot],
  ['Local DB + reproducibility (Phase 3A)', 'npm', ['run', 'test:acceptance:phase3a'], platformRoot],
  ['RI workflow (Phase 4)', 'npm', ['run', 'test:acceptance:phase4'], platformRoot],
  ['RI downstream (Phase 5)', 'npm', ['run', 'test:acceptance:phase5'], platformRoot],
  ['RI ingestion (Phase 6)', 'npm', ['run', 'test:acceptance:phase6'], platformRoot],
  ['RI ingestion ops (Phase 7)', 'npm', ['run', 'test:acceptance:phase7'], platformRoot],
  ['RI experience parity (Phase 7B)', 'npm', ['run', 'test:acceptance:phase7b'], platformRoot],
  ['RI Design Lab migration (Phase 7B.2)', 'npm', ['run', 'test:acceptance:phase7b2'], platformRoot],
  ['RI golden master core (Phase 7C.1)', 'npm', ['run', 'test:acceptance:phase7c1'], platformRoot],
  ['RI golden master horizon/calendar/publications (Phase 7C.2)', 'npm', ['run', 'test:acceptance:phase7c2'], platformRoot],
  ['RI golden master lifecycle (Phase 7C.3)', 'npm', ['run', 'test:acceptance:phase7c3'], platformRoot],
  ['Reference catalogue', 'node', ['./scripts/acceptance-global-source-catalogue.mjs'], refDataRoot],
  ['Catalogue clean-clone', 'node', ['./scripts/acceptance-catalogue-clean-clone.mjs'], refDataRoot],
  ['Source semantics', 'node', ['./scripts/acceptance-source-semantics.mjs'], integrationsRoot],
  ['Verification manifests', 'node', ['./scripts/acceptance-verification-manifests.mjs'], integrationsRoot],
];

console.log('FORGENIQ RI master acceptance (Phases 1–7 + catalogue)\n');
const start = Date.now();

for (const [label, cmd, args, cwd] of steps) {
  const ok = runStep(label, cmd, args, cwd);
  if (!ok) break;
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
if (failed) {
  console.error(`\nRI master acceptance: FAIL (${failed} step(s)) — ${elapsed}s\n`);
  process.exit(1);
}
console.log(`\nRI master acceptance: PASS — ${elapsed}s\n`);
