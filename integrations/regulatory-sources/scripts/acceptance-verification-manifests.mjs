#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveManifestRef } from './lib/manifest-loader.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..', '..', '..');
const manifestDir = join(repoRoot, 'integrations', 'regulatory-sources', 'manifests');

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

const secretPattern = /sk_live|Bearer\s+[A-Za-z0-9._-]{20,}|api[_-]?key\s*=\s*['"][^'"]+['"]/i;
const rawBodyPattern = /<html|<!DOCTYPE|"%PDF/i;

for (const file of [
  'batch-1-verification.json',
  'batch-1b-verification.json',
  'batch-2-verification.json',
  'batch-semantic-remediation-verification.json',
]) {
  const path = join(manifestDir, file);
  const text = readFileSync(path, 'utf8');
  const size = text.length;
  pass(`${file} exists`);
  if (secretPattern.test(text)) failMsg(`secrets in ${file}`);
  else pass(`no secrets in ${file}`);
  if (rawBodyPattern.test(text)) failMsg(`raw-like content in ${file}`);
  else pass(`no raw HTML/PDF bodies in ${file}`);
  if (size > 120_000) failMsg(`${file} unexpectedly large (${size})`);
  else pass(`${file} size bounded`);

  const manifest = JSON.parse(text);
  for (const entry of manifest.entries) {
    if (!entry.sourceId || !entry.regulatorId) failMsg(`${file} entry missing ids`);
    if (entry.verificationStatus === 'LIVE_VERIFIED') {
      if (!entry.representativeDocuments?.length) failMsg(`${entry.sourceId} LIVE_VERIFIED needs fingerprints`);
      else if (!entry.representativeDocuments[0].sha256) failMsg(`${entry.sourceId} missing sha256`);
      else pass(`${entry.sourceId} has SHA-256 fingerprint(s)`);
      if (!entry.representativeDocuments[0].representativeDocumentUrl) {
        failMsg(`${entry.sourceId} missing representative URL`);
      } else pass(`${entry.sourceId} has representative official URL`);
    }
    if (entry.verificationStatus === 'ACCESS_RESTRICTED') {
      pass(`${entry.sourceId} ACCESS_RESTRICTED (${entry.itemCount} items)`);
      if (entry.representativeDocuments?.length > 0) {
        failMsg(`${entry.sourceId} ACCESS_RESTRICTED must not have document hashes`);
      }
    }
    if (
      entry.verificationStatus === 'RETRIEVAL_FAILED' ||
      entry.verificationStatus === 'RESEARCH_REQUIRED'
    ) {
      pass(`${entry.sourceId} ${entry.verificationStatus} (non-live)`);
      if (entry.representativeDocuments?.length > 0) {
        failMsg(`${entry.sourceId} failed/research must not have document hashes`);
      }
    }
  }
}

const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
if (!gitignore.includes('integrations/regulatory-sources/evidence/')) failMsg('evidence not gitignored');
else pass('raw evidence directory gitignored');

if (existsSync(join(repoRoot, 'integrations', 'regulatory-sources', 'evidence', 'batch-1-latest.json'))) {
  pass('local raw evidence may exist on developer machine (optional)');
}

if (fail) {
  console.error(`\nVerification manifest acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nVerification manifest acceptance: PASS');
