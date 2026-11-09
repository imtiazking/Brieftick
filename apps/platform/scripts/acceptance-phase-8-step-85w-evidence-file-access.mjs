#!/usr/bin/env node
/**
 * BUS-UAT-014 — Evidence version preview/download (static).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platform = join(__dir, '..');
const lab = join(__dir, '..', '..', '..', 'design-lab', 'regulatory-intelligence');
let fail = 0;

function pass(id, detail) {
  console.log(`PASS: ${id} — ${detail}`);
}

function failTest(id, detail) {
  fail += 1;
  console.error(`FAIL: ${id} — ${detail}`);
}

const storage = readFileSync(join(platform, 'lib/ri/evidence-storage.ts'), 'utf8');
for (const needle of [
  'createTenantEvidenceVersionPreviewUrl',
  'downloadTenantEvidenceVersionContent',
  'getTenantEvidenceVersionRow',
  'EVIDENCE_PREVIEWED',
  'EVIDENCE_DOWNLOADED',
  'EVIDENCE_ACCESS_AUDIT_FAILED',
]) {
  if (storage.includes(needle)) pass('storage', needle);
  else failTest('storage', `missing ${needle}`);
}

const accessRoute = join(
  platform,
  'app/api/ri-lab/evidence/[id]/versions/[versionNumber]/access/route.ts',
);
const contentRoute = join(
  platform,
  'app/api/ri-lab/evidence/[id]/versions/[versionNumber]/content/route.ts',
);
if (!existsSync(accessRoute)) failTest('access_route', 'missing preview access route');
else pass('access_route', 'signed preview URL API');

if (!existsSync(contentRoute)) failTest('content_route', 'missing download content route');
else {
  const contentSrc = readFileSync(contentRoute, 'utf8');
  if (contentSrc.includes('Content-Disposition') && contentSrc.includes('evidence:read')) {
    pass('content_route', 'authenticated attachment download');
  } else failTest('content_route', 'content route must set disposition + auth');
}

const events = readFileSync(join(platform, 'lib/ri/workflow-events.ts'), 'utf8');
if (!events.includes("'EVIDENCE_PREVIEWED'") || !events.includes("'EVIDENCE_DOWNLOADED'")) {
  failTest('workflow_types', 'preview/download audit event types');
} else pass('workflow_types', 'audit event types registered');

const panels = readFileSync(join(lab, 'js/platform/connected-evidence-panels.js'), 'utf8');
if (
  !panels.includes('data-connected-evidence-version-preview') ||
  !panels.includes('data-connected-evidence-version-download') ||
  panels.includes('data-connected-evidence-download')
) {
  failTest('ui_actions', 'versions table must expose preview/download only');
} else {
  pass('ui_actions', 'per-version preview/download actions');
}

const writes = readFileSync(join(lab, 'js/platform/connected-work-writes.js'), 'utf8');
if (!writes.includes('previewConnectedEvidenceVersion') || !writes.includes('downloadConnectedEvidenceVersion')) {
  failTest('client_api', 'client helpers for preview/download');
} else pass('client_api', 'connected preview/download helpers');

if (!fail) console.log('\nacceptance-phase-8-step-85w-evidence-file-access: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-evidence-file-access: FAIL (${fail})\n`);
  process.exit(1);
}
