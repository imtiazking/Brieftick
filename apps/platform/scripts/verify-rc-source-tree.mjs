#!/usr/bin/env node
/**
 * Compare RC commit vs development reference (d806a26) — tracked blobs only.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const RC = process.env.FORGENIQ_RC_SHA || 'HEAD';
const REF = process.env.FORGENIQ_DEV_REF_SHA || 'd806a26';

function sh(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

const rcSha = sh(`git rev-parse ${RC}`);
const refSha = sh(`git rev-parse ${REF}`);
const diffNames = sh(`git diff --name-status ${refSha} ${rcSha}`).split('\n').filter(Boolean);

const sensitive = [];
for (const line of diffNames) {
  const path = line.replace(/^[ADMRCU?]+\t+/, '').trim();
  if (/^docs\/eval\/runs\//i.test(path) || /^docs\/eval\/Claude/i.test(path)) sensitive.push({ path, line });
}

const rcList = sh(`git ls-tree -r --name-only ${rcSha}`);
const sensInRc = rcList.split('\n').filter((p) => /^docs\/eval\/runs\//i.test(p) || /^docs\/eval\/Claude/i.test(p));
const privateHeldOutInRc = rcList.split('\n').filter((p) => /Claude outputs|private-held-out/i.test(p));
const credScan = rcList.split('\n').filter((p) => /sk-ant-/i.test(p) || /4d871541-e0d4-4581-828d-72073f763f85/i.test(p));

let cfedc76Ancestor = true;
try {
  sh(`git merge-base --is-ancestor cfedc76 ${rcSha}`);
} catch {
  cfedc76Ancestor = false;
}

const pinList = sh('git ls-tree -r --name-only 00b4369');
const pinSensitive = pinList
  .split('\n')
  .filter((p) => /^docs\/eval\/runs\//i.test(p) || /^docs\/eval\/Claude/i.test(p));

const requiredScripts = [
  'apps/platform/scripts/acceptance-stage-a-e2e-persistence.mjs',
  'apps/platform/scripts/acceptance-genuine-partial-evidence.mjs',
  'apps/platform/scripts/acceptance-production-coverage-unseen-questions.mjs',
].filter((s) => !rcList.includes(s));

const out = {
  schemaVersion: 'forgeniq.rc.source-tree-verification.v1',
  capturedAt: new Date().toISOString(),
  rcSha,
  referenceSha: refSha,
  previewPin: '00b4369146a65a7508a5befaa510c97dce0e00fe',
  cfedc76InAncestry: cfedc76Ancestor,
  diffFromReference: diffNames.map((line) => ({ line })),
  unintendedSourceCodeDelta: diffNames.filter(
    (l) => l.includes('\tapps/') && !l.includes('run-forgeniq-phase5'),
  ),
  sensitivePathsInDiff: sensitive,
  evalRunsOrClaudeInRcTree: sensInRc,
  privateHeldOutInRcTree: privateHeldOutInRc,
  applicationTreeMatchesReference:
    diffNames.filter((l) => !l.includes('run-forgeniq-phase5')).length === 0,
  credentialOrPartnerHitsInRcTree: credScan,
  pin00b4369SensitiveFiles: pinSensitive,
  missingRequiredScripts: requiredScripts,
  treeEquivalentToReference: diffNames.length === 0 && sensInRc.length === 0,
};

const outPath = join(REPO_ROOT, 'docs/eval/FORGENIQ-RC-SOURCE-TREE-VERIFICATION.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: sensInRc.length === 0 && !cfedc76Ancestor, out: outPath, rcSha }, null, 2));
const fail = privateHeldOutInRc.length > 0 || cfedc76Ancestor;
process.exit(fail ? 1 : 0);