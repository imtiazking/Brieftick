#!/usr/bin/env node
/**
 * Stage B gate evidence — baseline protection + harness integrity (offline).
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (script) => {
  const r = spawnSync(process.execPath, [join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
  });
  return { script, code: r.status, stderr: r.stderr?.slice(0, 500) };
};

const results = [
  run('acceptance-ask-ri-eval-harness.mjs'),
  run('acceptance-provider-diagnostics-safety.mjs'),
];

const failures = results.filter((r) => r.code !== 0);
console.log(JSON.stringify({ stage: 'B', results, programmeNote: 'Stage B PASS requires signed evidence artefact + SME checklist — not script exit alone' }, null, 2));
process.exit(failures.length ? 1 : 0);