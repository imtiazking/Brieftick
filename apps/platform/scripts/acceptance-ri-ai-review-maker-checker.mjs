#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAiReviewerSoD, assertImpactApproverSoD } from '../lib/ri/separation-of-duties.ts';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

function expectThrow(fn, code, label) {
  try {
    fn();
    fail(`${label}: expected throw ${code}`);
  } catch (e) {
    if (!String(e.message).includes(code)) fail(`${label}: wrong error ${e.message}`);
    else ok(`${label}: throws ${code}`);
  }
}

function expectPass(fn, label) {
  try {
    fn();
    ok(label);
  } catch (e) {
    fail(`${label}: ${e.message}`);
  }
}

expectThrow(
  () => assertAiReviewerSoD({ requestedByUserId: 'user_maker', reviewerUserId: 'user_maker' }),
  'segregation_of_duties',
  'AI run requester cannot accept own run',
);
expectPass(
  () => assertAiReviewerSoD({ requestedByUserId: 'user_maker', reviewerUserId: 'user_checker' }),
  'different reviewer may accept AI run',
);
expectThrow(
  () => assertImpactApproverSoD({ ownerUserId: 'user_maker', approverUserId: 'user_maker' }),
  'segregation_of_duties',
  'impact owner cannot approve own assessment (unchanged)',
);

const aiAnalysis = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'ai-analysis.ts'), 'utf8');
const reviewFn = aiAnalysis.slice(aiAnalysis.indexOf('export async function submitAnalysisReview'));
const sodAt = reviewFn.indexOf('assertAiReviewerSoD');
const insertAt = reviewFn.indexOf(".from('ai_analysis_reviews')");
if (sodAt < 0 || insertAt < 0 || sodAt > insertAt) fail('submitAnalysisReview must check SoD before inserting the review');
else ok('submitAnalysisReview checks SoD before the review insert');

const materialisation = readFileSync(join(platformRoot, 'lib', 'ri', 'services', 'ai-materialisation.ts'), 'utf8');
if (/candidates\[claimIndex\]\s*\?\?\s*candidates\[0\]/.test(materialisation)) {
  fail('materialisation falls back to candidates[0] for an unmatched claim index');
} else ok('materialisation only uses the candidate for the accepted claim index');
if ((materialisation.match(/status: 'DRAFT'/g) || []).length < 2) fail('AI-materialised records must be created as DRAFT');
else ok('AI-materialised changes and obligations are created as DRAFT (proposed)');
if (/status: '(OPEN|IN_PROGRESS|COMPLETE|CLOSED)'/.test(materialisation)) fail('materialisation sets an approved status');
else ok('materialisation never sets an approved obligation status');

const migrationsDir = join(platformRoot, 'supabase', 'migrations');
const guard = readdirSync(migrationsDir).find((f) => f.endsWith('_ri_ai_obligation_pilot_db_guards.sql'));
if (!guard) fail('database guard migration missing');
else {
  const sql = readFileSync(join(migrationsDir, guard), 'utf8');
  for (const t of ['ri_guard_ai_pilot_run_insert', 'ri_guard_ai_assisted_obligation_insert', 'ri_guard_ai_assisted_change_insert', 'ri_guard_ai_review_sod']) {
    if (!sql.includes(`create trigger ${t}`)) fail(`migration missing trigger ${t}`);
    else ok(`migration defines ${t}`);
  }
  if (!sql.includes("'b8f5e3a1-00ad-4000-8000-000000000001'")) fail('migration pilot org id mismatch');
  else ok('migration pins pilot to AI Development org');
}

console.log(JSON.stringify({ ok: failures.length === 0 }, null, 2));
process.exit(failures.length ? 1 : 0);
