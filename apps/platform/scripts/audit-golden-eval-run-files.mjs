#!/usr/bin/env node
/**
 * Audit tracked docs/eval/runs golden JSON (RC tree).
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const REF = process.env.FORGENIQ_RC_SHA || '9381c25';

function sh(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

const files = sh(`git ls-tree -r --name-only ${REF} docs/eval/runs`);
const PATTERNS = {
  apiKey: /sk-ant-[a-zA-Z0-9_-]{10,}/,
  partnerUat: /4d871541-e0d4-4581-828d-72073f763f85/i,
  orgA: /b8f5e3a1-0001-4000-8000-000000000001(?!\d)/,
  privateHeldOut: /private-held-out|held-out-suite/i,
  fullAnswer: /"(answer|answerText|renderedAnswer|fullResponse)"\s*:/,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
};

const rows = [];
for (const rel of files.split('\n').filter(Boolean)) {
  const raw = sh(`git show ${REF}:${rel.replace(/"/g, '\\"')}`);
  const bytes = Buffer.byteLength(raw, 'utf8');
  const sha256 = createHash('sha256').update(raw).digest('hex');
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  const text = raw.slice(0, 500000);
  const hits = {};
  for (const [k, re] of Object.entries(PATTERNS)) {
    hits[k] = re.test(text);
  }
  const hasSanitisedNote = /sanitised|sanitized|NOT_RECONSTRUCTABLE|redacted/i.test(text);
  const caseIds = json?.cases?.length ?? json?.results?.length ?? json?.rows?.length ?? null;
  const mockOnly = /mock|MOCK_ANTHROPIC|dry-run|smoke/i.test(rel) || Boolean(json?.mock);
  let necessary = rel.includes('stage-d-regression') || rel.includes('stage-c-d-mocked') || rel.includes('smoke') || rel.includes('dry-run');
  let recommendation = 'RETAIN';
  if (hits.apiKey || hits.privateHeldOut) recommendation = 'REMOVE';
  else if (hits.fullAnswer && !hasSanitisedNote && hits.partnerUat) recommendation = 'SANITISE';
  else if (rel.includes('dry-run') && hits.fullAnswer) recommendation = 'SANITISE';
  else if (rel.includes('smoke') && bytes > 50000) recommendation = 'SANITISE';

  rows.push({
    filename: rel,
    bytes,
    sha256,
    parseableJson: Boolean(json),
    approximateCaseCount: caseIds,
    fullAiAnswersPresent: hits.fullAnswer,
    protectedEvaluationQuestionsPresent: hits.privateHeldOut,
    tenantSpecificEvidenceOrCitations: hits.partnerUat || hits.orgA,
    personalOrConfidential: hits.email,
    secretsOrCredentials: hits.apiKey,
    likelyMockOrEngineeringRun: mockOnly,
    sanitisationSignalsInFile: hasSanitisedNote,
    necessaryForRegression: necessary,
    recommendation,
    patternHits: hits,
  });
}

const out = {
  schemaVersion: 'forgeniq.golden.eval-runs.audit.v1',
  capturedAt: new Date().toISOString(),
  rcSha: sh(`git rev-parse ${REF}`),
  fileCount: rows.length,
  pushBlockedUntilReviewComplete: true,
  files: rows,
  summary: {
    retain: rows.filter((r) => r.recommendation === 'RETAIN').length,
    sanitise: rows.filter((r) => r.recommendation === 'SANITISE').length,
    remove: rows.filter((r) => r.recommendation === 'REMOVE').length,
  },
};

const outPath = join(REPO_ROOT, 'docs/eval/GOLDEN-EVAL-RUNS-SECURITY-AUDIT.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: true, out: outPath, summary: out.summary }, null, 2));