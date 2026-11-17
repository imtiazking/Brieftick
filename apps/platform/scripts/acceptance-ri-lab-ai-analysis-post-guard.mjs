#!/usr/bin/env node
/** Offline: POST /api/ri-lab/ai-analysis-runs server gates (source inspection). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const routePath = join(platformRoot, 'app/api/ri-lab/ai-analysis-runs/route.ts');
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const src = readFileSync(routePath, 'utf8');
const checks = [
  ["requireRiContext('ai:request')", 'Clerk + org membership via requireRiContext'],
  ["assertLabConnectedWrite(ctx.role, 'ai:request')", 'lab connected write + ai:request gate'],
  ['getPublicationDetail(ctx.supabase, ctx.organisationId, publicationId)', 'tenant publication lookup'],
  ['requestPublicationAnalysis', 'delegates to server analysis service'],
];

for (const [needle, label] of checks) {
  if (!src.includes(needle)) fail(`route missing ${label}`);
  else ok(label);
}

const aiAnalysis = readFileSync(join(platformRoot, 'lib/ri/services/ai-analysis.ts'), 'utf8');
if (!aiAnalysis.includes('assertExperimentalAiTenant')) fail('missing experimental tenant guard in service');
else ok('assertExperimentalAiTenant in requestPublicationAnalysis');

console.log(JSON.stringify({ programmePass: failures.length === 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);