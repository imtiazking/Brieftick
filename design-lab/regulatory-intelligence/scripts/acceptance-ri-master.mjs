/**
 * Deterministic RI master (no network).
 */
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUITES = [
  'scripts/validate-data.mjs',
  'scripts/test-migrate.mjs',
  'scripts/acceptance-migrations.mjs',
  'scripts/acceptance-hardening.mjs',
  'scripts/acceptance-ri-sector-landscape.mjs',
  'scripts/acceptance-ri-legislation.mjs',
  'scripts/acceptance-ri-tpr.mjs',
  'scripts/acceptance-ri-basel.mjs',
  'scripts/acceptance-ri-ai-5a.mjs',
  'scripts/acceptance-ri-ai-5b.mjs',
];

function run(rel) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, rel)], { cwd: root, shell: false });
    child.on('close', (code) => resolve(code === 0));
  });
}

async function main() {
  const failed = [];
  for (const rel of SUITES) {
    const ok = await run(rel);
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${rel}`);
    if (!ok) failed.push(rel);
  }
  if (failed.length) {
    console.error('RI master FAILED:', failed.join(', '));
    process.exit(1);
  }
  console.log('RI deterministic master: PASS');
  console.log('RI DESIGN LAB MAJOR SOURCE EXPANSION: COMPLETE (deterministic)');
}

main();
