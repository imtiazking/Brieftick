#!/usr/bin/env node
/**
 * Phase 5 — full FORGENIQ engineering regression (offline, no paid Anthropic).
 * Records PASS/FAIL/BLOCKED/NOT_RUN per suite; does not imply programme acceptance.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const capturedAt = new Date().toISOString();
const headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout?.trim();

/** @type {Array<{id: string, category: string, command: string[], cwd: string, artefact?: string, blockedReason?: string}>} */
const SUITES = [
  {
    id: 'stage-a-persistence-resume',
    category: 'Stage A',
    command: ['node', 'scripts/acceptance-stage-a-e2e-persistence.mjs'],
    cwd: platformRoot,
    artefact: 'docs/eval/stage-a-e2e-persistence-latest.json',
    note: 'Includes Stage A budget ceiling, interrupt, and resume accounting',
  },
  {
    id: 'stage-b-secure-evidence',
    category: 'Stage B',
    command: ['node', 'scripts/acceptance-stage-b-secure-eval-evidence.mjs'],
    cwd: platformRoot,
  },
  {
    id: 'stage-c-sufficiency-policy',
    category: 'Stage C',
    command: ['node', 'scripts/acceptance-stage-c-evidence-sufficiency-policy.mjs'],
    cwd: platformRoot,
  },
  {
    id: 'stage-c-v2-integration',
    category: 'Stage C',
    command: ['node', 'scripts/acceptance-stage-c-v2-integration.mjs'],
    cwd: platformRoot,
  },
  {
    id: 'stage-c-d-mocked-themes',
    category: 'Stage C/D',
    command: ['node', 'scripts/acceptance-stage-c-d-mocked-reasoning-themes.mjs'],
    cwd: platformRoot,
  },
  {
    id: 'stage-d-scoring-reconstruction',
    category: 'Stage D',
    command: ['node', 'scripts/acceptance-stage-d-scoring-reconstruction.mjs'],
    cwd: platformRoot,
    artefact: 'docs/eval/scoring-evidence/baselines/stage-d-themes-mock-v1-manifest.json',
  },
  {
    id: 'stage-d-expanded-regression',
    category: 'Stage D',
    command: ['node', 'scripts/acceptance-stage-d-expanded-regression.mjs'],
    cwd: platformRoot,
  },
  {
    id: 'evidence-coverage-integration',
    category: 'Evidence coverage',
    command: ['node', 'scripts/acceptance-evidence-coverage-integration.mjs'],
    cwd: platformRoot,
    artefact: 'docs/eval/EVIDENCE-COVERAGE-INTEGRATION-RESULTS.json',
  },
  {
    id: 'cobs-missing-source',
    category: 'Evidence coverage',
    command: ['node', 'scripts/acceptance-evidence-coverage-missing-provision.mjs'],
    cwd: platformRoot,
    artefact: 'docs/eval/EVIDENCE-COVERAGE-MISSING-PROVISION-RESULTS.json',
  },
  {
    id: 'genuine-partial-evidence',
    category: 'Evidence coverage',
    command: ['node', 'scripts/acceptance-genuine-partial-evidence.mjs'],
    cwd: platformRoot,
    artefact: 'docs/eval/GENUINE-PARTIAL-EVIDENCE-RESULTS.json',
  },
  {
    id: 'engineering-regression-11',
    category: 'Engineering regression',
    command: ['node', 'scripts/acceptance-production-coverage-unseen-questions.mjs'],
    cwd: platformRoot,
    artefact: 'docs/eval/PRODUCTION-COVERAGE-UNSEEN-QUESTIONS.json',
  },
  {
    id: 'evidence-quality-fixture-metrics',
    category: 'Metrics (fixture only)',
    command: ['node', 'scripts/acceptance-evidence-quality-metrics.mjs'],
    cwd: platformRoot,
    artefact: 'docs/eval/EVIDENCE-QUALITY-METRICS.json',
  },
  {
    id: 'tenant-isolation-phase2',
    category: 'Tenant isolation',
    command: ['node', 'scripts/acceptance-phase-2-tenant-isolation.mjs'],
    cwd: platformRoot,
  },
  {
    id: 'ai-dev-org-guards',
    category: 'AI Development guards',
    command: ['node', 'scripts/acceptance-experimental-ai-tenant-guard.mjs'],
    cwd: platformRoot,
  },
  {
    id: 'stage-e-budget-offline',
    category: 'Stage E',
    command: ['node', 'scripts/acceptance-stage-e-budget-ceiling-offline.mjs'],
    cwd: platformRoot,
  },
  {
    id: 'eval-data-sanitisation',
    category: 'Eval sanitisation',
    command: ['node', 'scripts/acceptance-provider-diagnostics-safety.mjs'],
    cwd: platformRoot,
  },
  {
    id: 'ps26-controlled-extraction',
    category: 'UC-RI-005',
    command: ['node', 'scripts/acceptance-ps26-1-extraction-controlled.mjs'],
    cwd: platformRoot,
    artefact: 'docs/eval/UC-RI-005-PS26-1-CONTROLLED-EXTRACTION-TEST.json',
  },
  {
    id: 'typecheck',
    category: 'Build',
    command: ['npm', 'run', 'typecheck'],
    cwd: platformRoot,
  },
  {
    id: 'production-build',
    category: 'Build',
    command: ['npm', 'run', 'build'],
    cwd: platformRoot,
    blockedReason: 'Set FORGENIQ_RUN_PRODUCTION_BUILD=1 to execute (slow)',
  },
];

function runSuite(suite) {
  if (suite.blockedReason && process.env[suite.id === 'production-build' ? 'FORGENIQ_RUN_PRODUCTION_BUILD' : ''] !== '1') {
    return { status: 'BLOCKED', defect: suite.blockedReason, exitCode: null, durationMs: 0 };
  }
  const t0 = Date.now();
  const [cmd, ...args] = suite.command;
  const r = spawnSync(cmd, args, {
    cwd: suite.cwd,
    encoding: 'utf8',
    shell: cmd === 'npm',
    env: { ...process.env, ANTHROPIC_API_KEY: '', RI_AI_EXECUTION_ENABLED: '0' },
  });
  const durationMs = Date.now() - t0;
  const exitCode = r.status ?? 1;
  let status = exitCode === 0 ? 'PASS' : 'FAIL';
  const stderrTail = (r.stderr || r.stdout || '').slice(-400);
  const defect = exitCode !== 0 ? stderrTail || `exit ${exitCode}` : null;
  if (suite.artefact) {
    const p = join(REPO_ROOT, suite.artefact);
    if (existsSync(p)) {
      try {
        const j = JSON.parse(readFileSync(p, 'utf8'));
        if (j.ok === false || (Array.isArray(j.failures) && j.failures.length)) {
          status = 'FAIL';
        }
      } catch {
        /* non-json artefact */
      }
    }
  }
  return { status, defect, exitCode, durationMs };
}

const rows = [];
let hardFail = 0;
for (const suite of SUITES) {
  const result = runSuite(suite);
  if (result.status === 'FAIL') hardFail += 1;
  rows.push({
    id: suite.id,
    category: suite.category,
    commitSha: headSha,
    command: suite.command.join(' '),
    cwd: suite.cwd,
    capturedAt,
    ...result,
    artefact: suite.artefact || null,
  });
  console.log(`${result.status}: ${suite.id} (${result.durationMs}ms)`);
}

const out = {
  schemaVersion: 'forgeniq.phase5.engineering-regression.v1',
  capturedAt,
  testedCommitSha: headSha,
  programmeAcceptanceClaimed: false,
  note: 'Individual script exit 0 does not imply regulatory programme PASS or SME approval',
  suites: rows,
  summary: {
    pass: rows.filter((r) => r.status === 'PASS').length,
    fail: rows.filter((r) => r.status === 'FAIL').length,
    blocked: rows.filter((r) => r.status === 'BLOCKED').length,
    notRun: rows.filter((r) => r.status === 'NOT_RUN').length,
  },
  engineeringBaselineComplete: hardFail === 0 && rows.every((r) => r.status !== 'FAIL'),
};

const outPath = join(REPO_ROOT, 'docs/eval/FORGENIQ-PHASE5-ENGINEERING-REGRESSION.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ok: !hardFail, out: outPath, summary: out.summary }, null, 2));
process.exit(hardFail ? 1 : 0);