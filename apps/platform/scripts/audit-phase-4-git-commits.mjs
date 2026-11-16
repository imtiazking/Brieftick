#!/usr/bin/env node
/**
 * Audit specified commits for eval artefact leakage (read-only).
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const COMMITS = ['cfedc76', '70d46cb', 'c625832', 'e73196d'];

const SENSITIVE_PATTERNS = [
  { id: 'eval_runs', re: /^docs\/eval\/runs\// },
  { id: 'claude_outputs', re: /^docs\/eval\/Claude/i },
  { id: 'api_key', re: /sk-ant-/ },
  { id: 'partner_uat', re: /4d871541-e0d4-4581-828d-72073f763f85/i },
];

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', shell: false }).trim();
  } catch {
    return null;
  }
}

function commitExists(shortSha) {
  const t = sh(`git cat-file -t ${shortSha}`);
  return t === 'commit';
}

const reports = [];
for (const commit of COMMITS) {
  const exists = commitExists(commit);
  let files = [];
  let sensitive = [];
  let sensitiveAdds = [];
  if (exists) {
    const nameStatus = (sh(`git show --name-status --format= ${commit}`) || '').split('\n').filter(Boolean);
    files = nameStatus.map((line) => line.replace(/^[ADMR]\t+/, '').trim()).filter(Boolean);
    for (const line of nameStatus) {
      const m = line.match(/^([ADM])\t+(.+)$/);
      if (!m) continue;
      const [, op, f] = m;
      for (const p of SENSITIVE_PATTERNS) {
        if (!p.re.test(f)) continue;
        sensitive.push({ file: f, pattern: p.id, op });
        if (op === 'A' || op === 'M') sensitiveAdds.push({ file: f, pattern: p.id });
      }
    }
  }
  const remoteContains = (sh(`git branch -r --contains ${commit}`) || '').trim();
  reports.push({
    commit,
    existsLocally: exists,
    fileCount: files.length,
    sensitiveHits: sensitive,
    sensitiveAdds,
    remediationDeletes: sensitive.filter((h) => h.op === 'D').length,
    onOrigin: remoteContains.length > 0,
  });
}

const head = sh('git rev-parse HEAD');
const e731Scoped = reports.find((r) => r.commit.startsWith('e73196d'));
const out = join(REPO_ROOT, 'docs/eval/PHASE-4-GIT-COMMIT-AUDIT.json');
mkdirSync(dirname(out), { recursive: true });
const summary = {
  schemaVersion: 'forgeniq.git.phase4.audit.v1',
  capturedAt: new Date().toISOString(),
  currentHead: head,
  commits: reports,
  cfedc76OnRemote: reports[0]?.onOrigin ?? false,
  heldOutQuestionsRetirementRecommended: reports.some((r) =>
    (r.sensitiveAdds || []).some((h) => h.pattern === 'claude_outputs'),
  ),
  historyRewriteRequired: false,
  operatorApprovalRequiredForRewrite: reports[0]?.sensitiveHits?.length > 0,
  e73196dScopedOnly: e731Scoped ? e731Scoped.fileCount <= 25 && e731Scoped.sensitiveHits.length === 0 : null,
  credentialRotationRequired: false,
};

writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ok: true, out, summary }, null, 2));