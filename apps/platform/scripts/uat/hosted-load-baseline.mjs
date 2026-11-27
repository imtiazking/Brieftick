#!/usr/bin/env node
/**
 * Lightweight hosted load sample (no paid AI). Parallel read-only API fan-out.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { STAGING_ORIGIN, requireUatPersonas, runAs } from './staging-user-sessions.mjs';

const OUT = join(REPO_ROOT, 'docs', 'uat', 'evidence', `load-baseline-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const paths = ['/api/ri-lab/dashboard', '/api/ri-lab/publications?limit=20', '/api/ri-lab/changes?limit=20', '/api/ri-lab/readiness'];

await requireUatPersonas(['C'], { label: 'load-baseline' });
const samples = await runAs('C', async ({ page }) => {
  const t0 = Date.now();
  const results = await Promise.all(
    paths.map(async (path) => {
      const start = Date.now();
      const res = await page.request.fetch(`${STAGING_ORIGIN}${path}`, { timeout: 60_000 });
      return { path, status: res.status(), ms: Date.now() - start };
    }),
  );
  return { totalMs: Date.now() - t0, results };
});

const maxMs = Math.max(...samples.results.map((r) => r.ms));
const ok = samples.results.every((r) => r.status === 200) && maxMs < 25_000;
writeFileSync(join(OUT, 'RESULT.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ok, ...samples }, null, 2));
console.log(ok ? 'PASS hosted load baseline' : 'FAIL', JSON.stringify(samples));
process.exit(ok ? 0 : 1);