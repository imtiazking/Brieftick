#!/usr/bin/env node
/**
 * Audit files introduced by cfedc76 under docs/eval/runs and Claude outputs.
 */
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const COMMIT = 'cfedc76b3448a75ca87ca02c99ed73709d95a58b';
const PATTERNS = [
  { id: 'api_key', regex: /sk-ant-[a-zA-Z0-9_-]{10,}/ },
  { id: 'anthropic_env', regex: /ANTHROPIC_API_KEY\s*=\s*[^\s]+/i },
  { id: 'full_answer', regex: /"answer"\s*:\s*"[^"]{500,}/ },
  { id: 'partner_uat', regex: /4d871541-e0d4-4581-828d-72073f763f85/i },
  { id: 'messages_payload', regex: /"messages"\s*:\s*\[/ },
];

let files = [];
try {
  const out = execSync(`git diff-tree --no-commit-id --name-only -r ${COMMIT}`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  files = out
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f && (f.startsWith('docs/eval/runs/') || f.startsWith('docs/eval/Claude')));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const rows = [];
for (const rel of files) {
  const abs = join(REPO_ROOT, rel);
  let size = 0;
  let hits = [];
  try {
    size = statSync(abs).size;
    const text = readFileSync(abs, 'utf8').slice(0, 500_000);
    for (const p of PATTERNS) {
      if (p.regex.test(text)) hits.push(p.id);
    }
    const hasAnswerPreviewOnly = /answerPreview/.test(text) && !/"answer"\s*:\s*"/.test(text);
    rows.push({
      path: rel,
      sizeBytes: size,
      sensitiveHits: hits,
      fullAnswersLikely: hits.includes('full_answer') || (size > 50_000 && /\.json$/.test(rel) && !hasAnswerPreviewOnly),
      privateEvalEvidence: /private-held-out|live-claude/.test(rel),
      retainInGit: false,
      recommendation:
        hits.length > 0 || /live-claude|private-held-out|\.partial\.json|\.checkpoint\.json/.test(rel)
          ? 'STOP_TRACKING — move to gitignored local or sanitised manifest only'
          : 'Review — may keep if sanitised',
    });
  } catch {
    rows.push({ path: rel, error: 'unreadable', retainInGit: false });
  }
}

const outPath = join(REPO_ROOT, 'docs/eval/COMMIT-cfedc76-GIT-AUDIT.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      schemaVersion: 'forgeniq.eval.git-audit.v1',
      commit: COMMIT,
      capturedAt: new Date().toISOString(),
      fileCount: rows.length,
      credentialRotationRequired: rows.some((r) => r.sensitiveHits?.includes('api_key')),
      rows,
      remediationPlan: [
        'git rm --cached docs/eval/Claude outputs/',
        'git rm --cached live eval runs with full answer payloads',
        'Extend .gitignore for docs/eval/runs/*.partial.json, *.checkpoint.json, Claude outputs/',
        'Keep sanitised baselines and committed manifests only',
        'Rotate Anthropic keys only if audit finds literal secrets (check credentialRotationRequired)',
      ],
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ ok: true, outPath, credentialRotation: rows.some((r) => r.sensitiveHits?.includes('api_key')) }, null, 2));