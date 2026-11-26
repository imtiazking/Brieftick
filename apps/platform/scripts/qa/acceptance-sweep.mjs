#!/usr/bin/env node
/**
 * Runs every offline `scripts/acceptance-*.mjs` suite sequentially and records an honest PASS / FAIL / TIMEOUT per suite.
 * Used for the production-readiness capability register: it shows what is actually green today beyond the curated CI gate.
 *
 * Safety: provider credentials are removed from the child environment, so no suite can make a paid AI call.
 * Results are written incrementally; an interrupted sweep keeps what it has.
 *
 *   node scripts/qa/acceptance-sweep.mjs [--timeout-ms=240000] [--only=<substring>] [--out=<file>]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = join(platformRoot, '..', '..');
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const TIMEOUT = Number(arg('timeout-ms', 240_000));
const ONLY = arg('only', '');
const OUT = arg('out', join(repoRoot, 'docs', 'uat', 'evidence', 'production-readiness', 'raw', 'ACCEPTANCE-SWEEP.json'));
mkdirSync(dirname(OUT), { recursive: true });

const SECRET_ENV = /ANTHROPIC|OPENAI|CLERK_SECRET|SERVICE_ROLE|STRIPE|VERCEL_TOKEN|SUPABASE_ACCESS|DATABASE_URL|POSTGRES_URL/i;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !SECRET_ENV.test(k)));
env.FORGENIQ_AI_EXECUTION_ENABLED = 'false';
env.FORCE_COLOR = '0';

const suites = readdirSync(join(platformRoot, 'scripts'))
  .filter((f) => /^acceptance-.*\.mjs$/.test(f) && f.includes(ONLY))
  .sort();

const results = [];
const started = new Date().toISOString();
function persist(done) {
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        started,
        finished: done ? new Date().toISOString() : null,
        timeoutMs: TIMEOUT,
        paidAiCredentialsInChildEnv: false,
        total: suites.length,
        completed: results.length,
        passed: results.filter((r) => r.status === 'PASS').length,
        failed: results.filter((r) => r.status === 'FAIL').length,
        timedOut: results.filter((r) => r.status === 'TIMEOUT').length,
        results,
      },
      null,
      2,
    ),
  );
}

function run(file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [join('scripts', file)], { cwd: platformRoot, env, windowsHide: true });
    let tail = '';
    const keep = (d) => {
      tail = (tail + d.toString()).slice(-1500);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      resolve({ file, status: 'TIMEOUT', ms: Date.now() - t0, tail: tail.slice(-500) });
    }, TIMEOUT);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ file, status: code === 0 ? 'PASS' : 'FAIL', code, ms: Date.now() - t0, tail: code === 0 ? tail.slice(-200) : tail.slice(-900) });
    });
  });
}

for (const f of suites) {
  const r = await run(f);
  results.push(r);
  console.log(`${r.status} ${f} ${Math.round(r.ms / 1000)}s`);
  persist(false);
}
persist(true);
console.log(`sweep: ${results.filter((r) => r.status === 'PASS').length}/${results.length} passed`);
