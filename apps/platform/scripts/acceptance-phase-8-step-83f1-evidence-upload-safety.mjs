#!/usr/bin/env node
/**
 * Step 83F.1 D-01 — Evidence upload transaction safety (static + mocked runtime).
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const src = readFileSync(join(platformRoot, 'lib', 'ri', 'evidence-storage.ts'), 'utf8');

const fnStart = src.indexOf('export async function uploadTenantEvidenceVersion');
const fnEnd = src.indexOf('export async function createTenantEvidenceDownloadUrl');
const fnBody = fnStart >= 0 && fnEnd > fnStart ? src.slice(fnStart, fnEnd) : '';
const uploadIdx = fnBody.indexOf('await supabase.storage');
const insertIdx = fnBody.indexOf('version_number: versionNumber');
if (uploadIdx > 0 && insertIdx > uploadIdx) {
  pass('storage upload precedes evidence_versions insert in uploadTenantEvidenceVersion');
} else {
  failMsg(`upload order (uploadIdx=${uploadIdx}, insertIdx=${insertIdx}, fnLen=${fnBody.length})`);
}

for (const needle of [
  'EVIDENCE_UPLOAD_CLEANUP_FAILED',
  'removeTenantEvidenceStorageObject',
  'evidence_duplicate_content',
  'EVIDENCE_VERSION_UPLOADED',
  'phase: \'db_version_insert_failed\'',
  'phase: \'evidence_item_update_failed\'',
  'EVIDENCE_UPLOAD_AUDIT_FAILED',
]) {
  if (src.includes(needle)) pass(`evidence-storage includes ${needle.split("'")[0] || needle}`);
  else failMsg(`missing ${needle}`);
}

const auditCatch = src.slice(src.indexOf('EVIDENCE_UPLOAD_AUDIT_FAILED'));
if (auditCatch.includes('EVIDENCE_UPLOAD_AUDIT_FAILED') && !auditCatch.slice(0, 600).includes('throw auditError')) {
  pass('audit failure does not fail successful upload HTTP response');
} else {
  failMsg('upload must log EVIDENCE_UPLOAD_AUDIT_FAILED without rethrowing auditError');
}

const errors = readFileSync(join(platformRoot, 'lib/ri/lab-api/errors.ts'), 'utf8');
for (const code of [
  'evidence_duplicate_content',
  'evidence_invalid_content_type',
  'evidence_invalid_size',
  'evidence_no_file',
]) {
  if (errors.includes(code)) pass(`lab errors maps ${code}`);
  else failMsg(`lab errors missing ${code}`);
}

const inner = join(__dir, 'acceptance-phase-8-step-83f1-evidence-upload-safety.run.mjs');
const r = spawnSync(process.execPath, [inner], {
  cwd: platformRoot,
  stdio: 'inherit',
});

if (r.status !== 0) failMsg('tsx runtime upload safety checks');

process.exit(fail ? 1 : 0);
