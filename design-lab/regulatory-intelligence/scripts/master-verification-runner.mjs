/**
 * Orchestrates master verification acceptance suites (no feature changes).
 */
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
const debugDir = join(root, 'debug');
mkdirSync(debugDir, { recursive: true });

const SUITES = [
  ['validate-data', 'scripts/validate-data.mjs'],
  ['validate-openapi', 'scripts/validate-openapi.mjs'],
  ['migrations', 'scripts/acceptance-migrations.mjs'],
  ['security', 'scripts/acceptance-security.mjs'],
  ['ingestion', 'scripts/acceptance-ingestion.mjs'],
  ['governance', 'scripts/acceptance-governance.mjs'],
  ['ai-governance', 'scripts/acceptance-ai-governance.mjs'],
  ['production-ai', 'scripts/acceptance-production-ai.mjs'],
  ['production-ai-master', 'scripts/acceptance-production-ai-master.mjs'],
  ['assurance', 'scripts/acceptance-assurance.mjs'],
  ['platform-architecture', 'scripts/acceptance-platform-architecture.mjs'],
  ['live-regulatory-integration', 'scripts/acceptance-live-regulatory-integration.mjs'],
  ['live-regulatory-ui', 'scripts/acceptance-live-regulatory-ui.mjs'],
  ['hardening', 'scripts/acceptance-hardening.mjs'],
  ['performance', 'scripts/acceptance-performance.mjs'],
  ['operational', 'scripts/acceptance-operational.mjs'],
  ['demo', 'scripts/acceptance-demo.mjs'],
  ['accessibility', 'scripts/acceptance-accessibility.mjs'],
  ['visual', 'scripts/acceptance-visual.mjs'],
  ['navigation', 'scripts/acceptance-navigation.mjs'],
  ['ri-sector-landscape', 'scripts/acceptance-ri-sector-landscape.mjs'],
  ['ri-legislation', 'scripts/acceptance-ri-legislation.mjs'],
  ['ri-tpr', 'scripts/acceptance-ri-tpr.mjs'],
  ['ri-basel', 'scripts/acceptance-ri-basel.mjs'],
  ['ri-master', 'scripts/acceptance-ri-master.mjs'],
  ['branding', 'scripts/acceptance-branding.mjs'],
  ['test-migrate', 'scripts/test-migrate.mjs'],
  ['test-propagation', 'scripts/test-propagation.mjs'],
];

function runNode(rel, cwd = root) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, rel)], {
      cwd,
      env: process.env,
      shell: false,
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

async function main() {
  const report = { startedAt: new Date().toISOString(), suites: {} };
  for (const [name, rel] of SUITES) {
    console.log('\n==========', name, '==========\n');
    const { code, out } = await runNode(rel);
    const pass = code === 0;
    report.suites[name] = { exitCode: code, pass, tail: out.split('\n').slice(-8).join('\n') };
  }

  console.log('\n========== route-sweep ==========\n');
  const route = await runNode('scripts/master-route-sweep.mjs');
  report.suites['route-sweep'] = { exitCode: route.code, pass: route.code === 0 };

  console.log('\n========== live-fca-pra ==========\n');
  const live = await runNode('scripts/interim-live-fca-pra-verification.mjs');
  report.suites['live-fca-pra'] = { exitCode: live.code, pass: live.code === 0 };
  const fcaMatch = live.out.match(/FCA LIVE CONNECTION: (PASS|FAIL|BLOCKED)/);
  const praMatch = live.out.match(/PRA LIVE CONNECTION: (PASS|FAIL|BLOCKED)/);
  report.live = {
    fca: fcaMatch?.[1] || 'UNKNOWN',
    pra: praMatch?.[1] || 'UNKNOWN',
    both: fcaMatch?.[1] === 'PASS' && praMatch?.[1] === 'PASS' ? 'YES' : 'NO',
  };

  report.completedAt = new Date().toISOString();
  const outPath = join(debugDir, 'master-verification-runner-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('\nRunner report:', outPath);

  const failed = Object.entries(report.suites).filter(([, v]) => !v.pass).map(([k]) => k);
  if (failed.length) {
    console.log('FAILED SUITES:', failed.join(', '));
    process.exit(1);
  }
  console.log('ALL ORCHESTRATED SUITES PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
