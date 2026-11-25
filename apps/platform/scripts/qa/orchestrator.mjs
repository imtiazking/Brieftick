#!/usr/bin/env node
/**
 * FORGENIQ QA orchestrator. Runs existing scripts. A failed assertion is FAIL.
 * Missing credentials are AUTH_BLOCKED or BLOCKED, never a pass.
 *
 *   node scripts/qa/orchestrator.mjs --mode change|ci|release|promote|post-deploy|self-test
 */
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QA_CATALOGUE, selectCatalogue, normalizeQaMode } from './catalogue.mjs';
import { validateDesignLabJsBindings } from '../validate-design-lab-js-deps.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = join(platformRoot, '..', '..');
const labJs = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js');
const evidenceDir = join(repoRoot, 'docs', 'uat', 'qa');
const latestLab = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'qa', 'latest.json');

const rawMode = (process.argv.find((a) => a.startsWith('--mode=')) || '--mode=change').slice('--mode='.length);
const mode = normalizeQaMode(rawMode);

export function decideRelease(results) {
  if (results.some((r) => r.status === 'FAIL')) return 'FAIL';
  if (results.some((r) => r.mandatory && (r.status === 'BLOCKED' || r.status === 'NOT RUN' || r.status === 'AUTH_BLOCKED'))) {
    return 'BLOCKED';
  }
  if (results.length === 0) return 'NOT RUN';
  if (results.every((r) => r.status === 'PASS' || r.status === 'NOT RUN')) {
    return results.some((r) => r.mandatory && r.status !== 'PASS') ? 'BLOCKED' : 'PASS';
  }
  return 'BLOCKED';
}

function changedFiles() {
  try {
    const out = execSync('git diff --name-only HEAD', { cwd: repoRoot, encoding: 'utf8' });
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function childEnv() {
  const env = { ...process.env };
  delete env.FORGENIQ_SMOKE_BASE;
  delete env.FORGENIQ_AUTH_BASE;
  delete env.VERCEL_OIDC_TOKEN;
  return env;
}

function runNode(args, timeout = 180000) {
  const started = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: platformRoot,
    encoding: 'utf8',
    env: childEnv(),
    timeout,
  });
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  return {
    exitCode: timedOut ? 1 : (result.status ?? 1),
    output: `${timedOut ? 'timed out\n' : ''}${result.stdout || ''}\n${result.stderr || ''}`.slice(-4000),
    ms: Date.now() - started,
  };
}

function sqlIsDestructive(sql) {
  return /drop\s+schema\s+public|drop\s+database|truncate\s+regulatory_obligations/i.test(sql);
}

function scanMigrations(files) {
  const problems = [];
  for (const file of files) {
    if (!file.includes('supabase/migrations/') || !file.endsWith('.sql')) continue;
    const abs = join(repoRoot, file);
    if (!existsSync(abs)) continue;
    const sql = readFileSync(abs, 'utf8').toLowerCase();
    if (sqlIsDestructive(sql)) {
      problems.push(file);
    }
  }
  return problems;
}

function rowMandatory(row, qaMode) {
  if (qaMode === 'ci') {
    if (row.requires === 'local-db') return process.env.FORGENIQ_QA_REQUIRE_DB === '1';
    return true;
  }
  if (qaMode === 'promote') {
    if (row.gate === 'ci') {
      if (row.requires === 'local-db') return true;
      return true;
    }
    if (row.gate === 'candidate' || row.gate === 'authenticated' || row.gate === 'security') return true;
  }
  return false;
}

function countResolvedSegment() {
  const text = readFileSync(join(labJs, 'platform', 'connected-triage.js'), 'utf8');
  return (text.match(/const resolvedSegment/g) || []).length;
}

function executeRow(row, files) {
  if (row.command === 'validate-design-lab-js-deps') {
    const bindings = validateDesignLabJsBindings(labJs);
    return { status: bindings.ok ? 'PASS' : 'FAIL', output: bindings.problems.join('\n'), ms: 0 };
  }
  if (row.command === 'eslint-design-lab') {
    const eslint = join(platformRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
    const result = spawnSync(process.execPath, [eslint, '-c', 'eslint.config.mjs', 'js', '--max-warnings', '0'], {
      cwd: join(repoRoot, 'design-lab', 'regulatory-intelligence'),
      encoding: 'utf8',
      env: childEnv(),
      timeout: 120000,
    });
    return { status: result.status === 0 ? 'PASS' : 'FAIL', output: `${result.stdout || ''}${result.stderr || ''}`.slice(-2000), ms: 0 };
  }
  if (row.command === 'resolved-segment-once') {
    const n = countResolvedSegment();
    return { status: n === 1 ? 'PASS' : 'FAIL', output: `const resolvedSegment count=${n}`, ms: 0 };
  }
  if (row.command === 'migration-scan') {
    const problems = scanMigrations(files);
    return { status: problems.length ? 'FAIL' : 'PASS', output: problems.join('\n') || 'no destructive statements in changed SQL', ms: 0 };
  }
  if (row.command === 'hosted-shell') {
    return { status: 'NOT RUN', output: 'post-deploy only', ms: 0 };
  }
  if (row.requires === 'local-db' && !process.env.FORGENIQ_QA_REQUIRE_DB) {
    return { status: 'BLOCKED', output: 'Local database not requested. Set FORGENIQ_QA_REQUIRE_DB=1 to run RLS.', ms: 0 };
  }
  const args = row.command.replace(/^node\s+/, '').split(' ');
  const timeout = /local-db|role-aware|authenticated-smoke|uat-session-recover|resource-optimisations/.test(row.command)
    ? 600000
    : 180000;
  const prevCandidate = process.env.FORGENIQ_QA_REQUIRE_CANDIDATE;
  if (row.id === 'UAT-SESSION-RECOVERY' && mode === 'promote') {
    process.env.FORGENIQ_QA_REQUIRE_CANDIDATE = '1';
  }
  const result = runNode(args, timeout);
  if (row.id === 'UAT-SESSION-RECOVERY') {
    if (prevCandidate === undefined) delete process.env.FORGENIQ_QA_REQUIRE_CANDIDATE;
    else process.env.FORGENIQ_QA_REQUIRE_CANDIDATE = prevCandidate;
  }
  const status = result.exitCode === 0 ? 'PASS' : result.exitCode === 2 ? 'AUTH_BLOCKED' : 'FAIL';
  return { status, output: result.output, ms: result.ms };
}

function writeEvidence(report) {
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(dirname(latestLab), { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  writeFileSync(join(evidenceDir, `run-${stamp}.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(evidenceDir, 'latest.json'), JSON.stringify(report, null, 2));
  writeFileSync(latestLab, JSON.stringify(report, null, 2));
  const defects = report.results.filter((r) => r.status === 'FAIL');
  if (defects.length) {
    mkdirSync(join(evidenceDir, 'defects'), { recursive: true });
    for (const defect of defects) {
      writeFileSync(
        join(evidenceDir, 'defects', `${defect.id}.json`),
        JSON.stringify({ ...defect, sourceHints: defect.paths, severity: defect.criticality }, null, 2),
      );
    }
  }
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'forgeniq-qa-'));
  const problems = [];
  writeFileSync(join(root, 'app.js'), "import { missing } from './lib.js';\nexport const boot = missing;\n");
  writeFileSync(join(root, 'lib.js'), 'export const present = 1;\n');
  const missingExport = validateDesignLabJsBindings(root);
  if (missingExport.ok) problems.push('missing export was not detected');

  writeFileSync(join(root, 'app.js'), "import { present } from './lib.js';\nexport const boot = present;\n");
  writeFileSync(join(root, 'lib.js'), 'export const present = 1;\nconst present = 2;\n');
  const duplicate = validateDesignLabJsBindings(root);
  if (duplicate.ok) problems.push('duplicate declaration was not detected');

  writeFileSync(
    join(root, 'eslint.config.mjs'),
    "export default [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules: { 'no-undef': 'error' } }];\n",
  );
  writeFileSync(join(root, 'undef.js'), 'export const value = missingName;\n');
  const eslint = join(platformRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const lint = spawnSync(process.execPath, [eslint, '-c', 'eslint.config.mjs', 'undef.js', '--max-warnings', '0'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
  });
  if (lint.status === 0) problems.push('undefined variable was not detected');

  if (!sqlIsDestructive('TRUNCATE regulatory_obligations;')) problems.push('destructive migration was not detected');
  if (sqlIsDestructive('create table regulatory_obligations (id uuid);')) problems.push('ordinary migration was flagged');

  const verdict = decideRelease([
    { id: 'fixture', status: 'FAIL', mandatory: true },
    { id: 'auth', status: 'AUTH_BLOCKED', mandatory: false },
  ]);
  const blocked = decideRelease([{ id: 'db', status: 'BLOCKED', mandatory: true }]);
  const notRun = decideRelease([{ id: 'pending', status: 'NOT RUN', mandatory: true }]);
  const pass = decideRelease([{ id: 'ok', status: 'PASS', mandatory: true }]);
  if (verdict !== 'FAIL') problems.push('failed assertion did not block release');
  if (blocked !== 'BLOCKED' || notRun !== 'BLOCKED') problems.push('blocked or not-run check could pass');
  if (pass !== 'PASS') problems.push('clean result was not a pass');
  rmSync(root, { recursive: true, force: true });
  console.log(problems.length ? 'qa self-test: FAIL' : 'qa self-test: PASS', {
    problems: [...missingExport.problems, ...duplicate.problems, ...problems],
    verdict,
    blocked,
    notRun,
  });
  process.exit(problems.length ? 1 : 0);
}

if (mode === 'self-test') selfTest();

if (mode === 'promote') process.env.FORGENIQ_QA_REQUIRE_DB = '1';

async function runOrchestrator() {
  const files = changedFiles();
  const selected = mode === 'post-deploy'
    ? QA_CATALOGUE.filter((row) => row.id === 'RI-BROWSER-HOSTED')
    : selectCatalogue(files, mode === 'ci' || mode === 'promote' ? mode : rawMode === 'release' ? 'release' : 'change');

  console.log(JSON.stringify({ qaMode: mode, rawMode, catalogue: selected.length, context: mode === 'ci' ? 'offline-ci' : mode === 'promote' ? 'candidate-release' : mode }));
  const results = [];
  for (const row of selected) {
    if (mode === 'post-deploy' && row.command === 'hosted-shell') {
      const response = await fetch('https://staging-app.forgeniq.com/design-lab/regulatory-intelligence/js/platform/connected-my-tasks.js', {
        headers: { 'cache-control': 'no-cache' },
      });
      const body = await response.text();
      const pass = response.ok && body.includes("from './connected-catalogue.js'");
      results.push({ ...row, mandatory: true, status: pass ? 'PASS' : 'FAIL', output: `status ${response.status}` });
      continue;
    }
    const outcome = executeRow(row, files);
    const mandatory = rowMandatory(row, mode);
    results.push({ ...row, mandatory, ...outcome });
    console.log(`${outcome.status}  ${row.id}  ${row.feature}`);
  }
  return { files, results };
}

const { files, results } = await runOrchestrator();

const coverageGaps = QA_CATALOGUE.filter((row) => row.gate === 'gap').map((row) => ({
  id: row.id,
  feature: row.feature,
  area: row.area,
  status: row.coverageStatus || 'NOT RUN',
  note: row.note,
}));

function verdictFor(gate) {
  const rows = results.filter((row) => row.gate === gate);
  if (!rows.length) return 'NOT RUN';
  return decideRelease(rows);
}

const offlineTests = verdictFor('ci');
const candidateRelease = verdictFor('candidate');
const authenticatedStaging = verdictFor('authenticated');
const securityValidation = verdictFor('security');
const securityOk = securityValidation === 'PASS' || securityValidation === 'NOT RUN';
const promotion =
  mode === 'promote'
    ? [offlineTests, candidateRelease, authenticatedStaging, securityValidation].includes('FAIL')
      ? 'FAIL'
      : offlineTests === 'PASS' &&
          candidateRelease === 'PASS' &&
          authenticatedStaging === 'PASS' &&
          securityOk
        ? 'PASS'
        : 'BLOCKED'
    : 'NOT RUN';
const technicalTests = offlineTests;
let gitHead = 'unknown';
try {
  gitHead = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch {
  /* no git */
}
let latestKnownDeployment = null;
try {
  latestKnownDeployment = JSON.parse(readFileSync(join(repoRoot, 'docs', 'eval', 'STAGING-P3-PROVISION-ENGINE-DEPLOY-2026-11-22.json'), 'utf8'));
} catch {
  latestKnownDeployment = null;
}
const report = {
  generatedAt: new Date().toISOString(),
  mode: rawMode,
  qaContext: mode === 'ci' ? 'offline-ci' : mode === 'promote' ? 'candidate-release' : mode,
  offlineTests,
  candidateRelease: mode === 'promote' ? candidateRelease : 'NOT RUN',
  gitHead,
  latestKnownDeployment: latestKnownDeployment
    ? {
        id: latestKnownDeployment.deploymentId || null,
        url: latestKnownDeployment.deploymentUrl || null,
        alias: latestKnownDeployment.alias || null,
        previewDeploymentId: latestKnownDeployment.previewDeploymentId || null,
        previewUrl: latestKnownDeployment.previewUrl || null,
        candidateAlias: latestKnownDeployment.candidateAlias || null,
        candidateHost: latestKnownDeployment.candidateAlias || 'https://candidate-staging.forgeniq.com',
        protectedOfficialDeploymentId: latestKnownDeployment.protectedOfficialDeploymentId || null,
        prePromotionAuth: latestKnownDeployment.prePromotionAuth || null,
        postPromotionAuth: latestKnownDeployment.postPromotionAuth || null,
        capturedAt: latestKnownDeployment.capturedAt || null,
      }
    : null,
  technicalTests,
  authenticatedStaging,
  securityValidation,
  promotion,
  businessUatApproved: false,
  productionReleaseAuthorised: false,
  changedFiles: files,
  catalogueSize: QA_CATALOGUE.length,
  coverageGaps,
  passed: results.filter((r) => r.status === 'PASS').length,
  failed: results.filter((r) => r.status === 'FAIL').length,
  blocked: results.filter((r) => r.status === 'BLOCKED' || r.status === 'AUTH_BLOCKED').length,
  results: results.map(({ output, ...rest }) => ({ ...rest, output: output.slice(0, 1500) })),
};
writeEvidence(report);
console.log(
  `qa ${rawMode}: offline ${offlineTests} candidate ${mode === 'promote' ? candidateRelease : 'NOT RUN'} authenticated ${authenticatedStaging} security ${securityValidation} promotion ${promotion}  passed ${report.passed} failed ${report.failed} blocked ${report.blocked}`,
);
if (mode === 'promote' && promotion !== 'PASS') process.exit(promotion === 'FAIL' ? 1 : 2);
if (mode === 'ci') {
  if (offlineTests === 'FAIL') process.exit(1);
  if (offlineTests !== 'PASS') {
    console.error(JSON.stringify({ code: 'ci_gate_not_pass', offlineTests, resultCount: results.length }));
    process.exit(2);
  }
  process.exit(0);
}
