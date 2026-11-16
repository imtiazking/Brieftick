#!/usr/bin/env node
/**
 * Check whether cfedc76 eval artefact paths remain reachable in remote git history.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const COMMIT = 'cfedc76b3448a75ca87ca02c99ed73709d95a58b';
const OUT = join(REPO_ROOT, 'docs/eval/COMMIT-cfedc76-REMOTE-HISTORY-AUDIT.json');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const localHas = Boolean(sh(`git cat-file -e ${COMMIT}^{commit} 2>nul`));
const files = sh(`git diff-tree --no-commit-id --name-only -r ${COMMIT}`)?.split('\n').filter(
  (f) => f && (f.startsWith('docs/eval/runs/') || f.startsWith('docs/eval/Claude')),
) ?? [];

const remotes = sh('git remote -v')?.split('\n').filter(Boolean) ?? [];
const remoteReachable = [];
for (const line of remotes) {
  const name = line.split(/\s+/)[0];
  if (!name || name === line) continue;
  const onRemote = sh(`git branch -r --contains ${COMMIT} 2>nul`);
  remoteReachable.push({
    remote: name,
    commitContainedInRemoteBranch: Boolean(onRemote),
    branches: onRemote ? onRemote.split('\n').map((b) => b.trim()).filter(Boolean) : [],
  });
}

const sampleChecks = files.slice(0, 5).map((path) => {
  const existsAtCommit = sh(`git cat-file -e ${COMMIT}:${path} 2>nul`);
  const stillTracked = sh(`git ls-files "${path}"`);
  return { path, inCommitHistory: Boolean(existsAtCommit), currentlyTracked: Boolean(stillTracked) };
});

const report = {
  schemaVersion: 'forgeniq.git.cfedc76.remote-history.v1',
  capturedAt: new Date().toISOString(),
  commit: COMMIT,
  localCommitPresent: localHas,
  filesIntroducedInCommit: files.length,
  samplePathChecks: sampleChecks,
  remoteReachability: remoteReachable,
  historyRewriteRequiredForFullRemoval: files.length > 0 && localHas,
  credentialRotationRequired: false,
  recommendedActions: [
    'Keep paths gitignored (70d46cb); do not re-add live eval outputs.',
    'If commit was pushed: coordinate BFG/filter-repo with operator approval before rewriting shared history.',
    'Store legitimate evaluation evidence in access-controlled location outside public git.',
  ],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, out: OUT, ...report }, null, 2));