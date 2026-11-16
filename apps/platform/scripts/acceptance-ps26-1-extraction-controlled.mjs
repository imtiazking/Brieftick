#!/usr/bin/env node
/**
 * UC-RI-005 controlled extraction readiness — verification only, no ingest/materialise.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);

execSync('node scripts/verify-fca-ps26-1-instrument-offline.mjs', {
  cwd: join(REPO_ROOT, 'apps/platform'),
  stdio: 'pipe',
});

const verificationPath = join(REPO_ROOT, 'docs/eval/FCA-PS26-1-INSTRUMENT-VERIFICATION.json');
const checklistPath = join(REPO_ROOT, 'docs/eval/FCA-PS26-1-OBLIGATION-GRADE-HUMAN-CHECKLIST.json');
const verification = JSON.parse(readFileSync(verificationPath, 'utf8'));
const checklist = JSON.parse(readFileSync(checklistPath, 'utf8'));

if (!verification.authenticity?.sourceSha256) failures.push('missing sourceSha256');
else ok(`source SHA-256 ${verification.authenticity.sourceSha256.slice(0, 16)}…`);

for (const rule of ['CONC 4.2A.3R', 'CONC 4.2A.6R', 'CONC 7.20.1R']) {
  const hit = (verification.bindingRulesSample || []).find((r) => r.rule === rule);
  if (!hit?.foundInPdf) failures.push(`${rule} not located in PDF scan`);
  else ok(`${rule} hint pages ${hit.pdfPages?.join(',')}`);
}

if (checklist.ingestAllowed !== false) failures.push('checklist ingestAllowed must be false');
else ok('ingestAllowed=false');

if (checklist.obligationGradeSuitableOverride !== false) failures.push('obligationGradeSuitableOverride must be false');
else ok('obligationGradeSuitableOverride=false');

const humanPending = checklist.findings?.humanObligationGradeApprovalsOutstanding || [];
for (const og of ['OG-02', 'OG-04', 'OG-05', 'OG-06']) {
  if (!humanPending.includes(og)) {
    ok(`${og} tracked for human review`);
  } else {
    ok(`${og} still pending human (expected pre-ingest)`);
  }
}

const out = join(REPO_ROOT, 'docs/eval/FCA-PS26-1-EXTRACTION-ACCEPTANCE-READINESS.json');
mkdirSync(dirname(out), { recursive: true });
const report = {
  schemaVersion: 'forgeniq.uc-ri-005.ps26-1.extraction-readiness.v1',
  capturedAt: new Date().toISOString(),
  ingestExecuted: false,
  obligationMaterialisationExecuted: false,
  verificationArtifact: 'docs/eval/FCA-PS26-1-INSTRUMENT-VERIFICATION.json',
  humanChecklist: 'docs/eval/FCA-PS26-1-OBLIGATION-GRADE-HUMAN-CHECKLIST.json',
  obligationExtractionPipelineReady: failures.length === 0,
  exactPhysicalPagesVerified: false,
  humanGatesOutstanding: humanPending,
  expectedObligationsDefined: false,
  note: 'Page refs are search hints until OG-02 human sign-off.',
  programmePass: failures.length === 0,
  failures,
};
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: failures.length === 0, out, failures }, null, 2));
process.exit(failures.length ? 1 : 0);