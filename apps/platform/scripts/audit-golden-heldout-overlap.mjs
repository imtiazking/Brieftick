#!/usr/bin/env node
/**
 * Compare golden docs/eval/runs at RC against cfedc76 private held-out (local git only).
 * Output is sanitised: hashes and counts only — no question or answer text.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const RC = process.env.FORGENIQ_RC_SHA || '9381c25';
const HELDOUT_COMMIT = 'cfedc76';

function sh(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function shaNorm(text) {
  const n = String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(n, 'utf8').digest('hex');
}

function jaroWinkler(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const m = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1m = new Array(s1.length).fill(false);
  const s2m = new Array(s2.length).fill(false);
  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - m);
    const end = Math.min(i + m + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2m[j] || s1[i] !== s2[j]) continue;
      s1m[i] = s2m[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1m[i]) continue;
    while (!s2m[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  const jaro = (matches / s1.length + matches / s2.length + (matches - t / 2) / matches) / 3;
  let l = 0;
  const p = 0.1;
  for (; l < Math.min(4, s1.length, s2.length) && s1[l] === s2[l]; l++);
  return jaro + l * p * (1 - jaro);
}

function loadHeldOut() {
  const paths = [
    'docs/eval/Claude outputs/private-held-out-suite.json',
    'docs/eval/Claude outputs/private-held-out-suite-v1.1.json',
  ];
  const rows = [];
  for (const p of paths) {
    try {
      const raw = sh(`git show ${HELDOUT_COMMIT}:"${p.replace(/"/g, '\\"')}"`);
      const j = JSON.parse(raw);
      for (const c of j.cases || []) {
        rows.push({
          sourceBlob: p,
          testId: c.testId,
          questionSha256: shaNorm(c.question),
          expectedThemesSha256: createHash('sha256')
            .update(JSON.stringify(c.requiredAnswerThemes || []))
            .digest('hex'),
          operatorHeldOut: Boolean(c.operatorHeldOut),
        });
      }
    } catch {
      /* blob absent */
    }
  }
  return rows;
}

function extractGoldenCases(rcRelPath, raw) {
  const j = JSON.parse(raw);
  const out = [];
  const push = (testId, question, meta = {}) => {
    if (!testId) return;
    out.push({
      file: rcRelPath,
      testId,
      questionSha256: question ? shaNorm(question) : null,
      ...meta,
    });
  };
  if (j.results) {
    for (const r of j.results) {
      push(r.testId, r.question || r.questionText, {
        answerPreviewSha256: r.answerPreview ? shaNorm(r.answerPreview) : null,
        hasFullAnswerFields: Boolean(r.answer || r.renderedAnswer || r.answerText),
      });
    }
  }
  if (j.cases) {
    for (const r of j.cases) {
      push(r.testId, r.question, { hasFullAnswerFields: Boolean(r.answer || r.renderedAnswer) });
    }
  }
  return out;
}

const heldOut = loadHeldOut();
const heldOutIds = new Map(heldOut.map((h) => [h.testId, h]));
const heldOutQ = new Map(heldOut.map((h) => [h.questionSha256, h.testId]));

const goldenFiles = sh(`git ls-tree -r --name-only ${RC} docs/eval/runs`).split('\n').filter(Boolean);
const golden = [];
for (const rel of goldenFiles) {
  const raw = sh(`git show ${RC}:${rel.replace(/"/g, '\\"')}"`);
  golden.push(...extractGoldenCases(rel, raw));
}

const suitePath = 'docs/eval/ask-ri-v2-eval-suite-v2.1.json';
let suiteById = new Map();
try {
  const suite = JSON.parse(sh(`git show ${RC}:${suitePath}`));
  for (const c of suite.cases || []) {
    suiteById.set(c.testId, shaNorm(c.question));
  }
} catch {
  /* */
}

for (const g of golden) {
  if (!g.questionSha256 && suiteById.has(g.testId)) {
    g.questionSha256 = suiteById.get(g.testId);
    g.questionFromSuite = true;
  }
}

const idMatches = [];
const exactQMatches = [];
const normQMatches = [];
const nearDup = [];
const expectedAnswerOverlap = [];

for (const g of golden) {
  if (heldOutIds.has(g.testId)) {
    idMatches.push({ goldenFile: g.file, testId: g.testId, heldOutSource: heldOutIds.get(g.testId).sourceBlob });
  }
  if (g.questionSha256 && heldOutQ.has(g.questionSha256)) {
    normQMatches.push({
      goldenFile: g.file,
      testId: g.testId,
      heldOutTestId: heldOutQ.get(g.questionSha256),
      questionSha256: g.questionSha256,
    });
  }
  if (g.hasFullAnswerFields) {
    expectedAnswerOverlap.push({ goldenFile: g.file, testId: g.testId, note: 'full_answer_field_present' });
  }
  if (g.questionSha256) {
    for (const h of heldOut) {
      if (h.questionSha256 === g.questionSha256) continue;
      /* compare via re-hash only — skip jaro without text */
    }
  }
}

/* Near-duplicate: join suite questions to held-out via git for jaro — in-memory only */
const heldOutQuestions = [];
try {
  const raw = sh(`git show ${HELDOUT_COMMIT}:"docs/eval/Claude outputs/private-held-out-suite.json"`);
  const j = JSON.parse(raw);
  for (const c of j.cases || []) heldOutQuestions.push({ testId: c.testId, norm: String(c.question).toLowerCase().replace(/\s+/g, ' ').trim() });
} catch {
  /* */
}
const suiteQuestions = [];
try {
  const suite = JSON.parse(sh(`git show ${RC}:${suitePath}`));
  for (const c of suite.cases || []) {
    if (golden.some((g) => g.testId === c.testId))
      suiteQuestions.push({ testId: c.testId, norm: String(c.question).toLowerCase().replace(/\s+/g, ' ').trim() });
  }
} catch {
  /* */
}
for (const sq of suiteQuestions) {
  for (const hq of heldOutQuestions) {
    const sim = jaroWinkler(sq.norm, hq.norm);
    if (sim >= 0.92 && sq.norm !== hq.norm) {
      nearDup.push({
        goldenSuiteTestId: sq.testId,
        heldOutTestId: hq.testId,
        similarity: Number(sim.toFixed(4)),
        goldenQuestionSha256: shaNorm(sq.norm),
        heldOutQuestionSha256: shaNorm(hq.norm),
      });
    }
    if (sq.norm === hq.norm && sq.testId !== hq.testId) {
      exactQMatches.push({ goldenSuiteTestId: sq.testId, heldOutTestId: hq.testId, questionSha256: shaNorm(sq.norm) });
    }
  }
}

let action = 'NO_ACTION';
if (idMatches.length || normQMatches.length || exactQMatches.length) {
  action = 'SANITISE_OR_REMOVE_BEFORE_PUSH';
} else if (nearDup.length) {
  action = 'OPERATOR_REVIEW_NEAR_DUP';
}

const out = {
  schemaVersion: 'forgeniq.golden.heldout.overlap.v1',
  capturedAt: new Date().toISOString(),
  rcSha: sh(`git rev-parse ${RC}`),
  heldOutCommitInspected: HELDOUT_COMMIT,
  heldOutCaseCount: heldOut.length,
  goldenFileCount: goldenFiles.length,
  goldenCaseRows: golden.length,
  dryRunFile: 'docs/eval/runs/phase-2c2-ask-ri-v2-eval-dry-run-claude-haiku-5-5-2026-11-10T20-02-13-509Z.json',
  dryRunCaseCount: golden.filter((g) => g.file.includes('dry-run')).length,
  matchCounts: {
    exactCaseId: idMatches.length,
    exactQuestionText: exactQMatches.length,
    normalisedQuestionText: normQMatches.length,
    nearDuplicateQuestions: nearDup.length,
    protectedExpectedAnswerFields: expectedAnswerOverlap.length,
    fullRegulatoryAnswerContent: golden.filter((g) => g.hasFullAnswerFields).length,
  },
  idMatches,
  exactQuestionMatches: exactQMatches,
  normalisedQuestionMatches: normQMatches,
  nearDuplicates: nearDup.slice(0, 50),
  confidentialEvidenceIndicators: {
    partnerUatUuidInGolden: false,
    apiKeyPatternInGolden: false,
    note: 'See GOLDEN-EVAL-RUNS-SECURITY-AUDIT.json',
  },
  recommendedAction: action,
  protectedContentInReport: false,
  rcModified: false,
};

const outPath = join(REPO_ROOT, 'docs/eval/GOLDEN-HELDOUT-OVERLAP-REPORT.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: true, out: outPath, matchCounts: out.matchCounts, recommendedAction: action }, null, 2));