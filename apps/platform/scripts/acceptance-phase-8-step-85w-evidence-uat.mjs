#!/usr/bin/env node
/**
 * BUS-UAT-014 — Authorised UAT evidence create + control link + partition (static).
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

const evidenceSvc = readFileSync(join(platform, 'lib/ri/services/evidence.ts'), 'utf8');
if (!evidenceSvc.includes('linkEvidenceControl')) {
  failTest('server_link', 'createEvidence must link control when controlId set');
} else {
  pass('server_link', 'evidence_control on create');
}

const parse = readFileSync(join(platform, 'lib/ri/lab-api/lab-link-write.ts'), 'utf8');
if (!parse.includes('creationMode') || !parse.includes('controlId')) {
  failTest('parse', 'parseLabEvidenceCreateBody accepts mode + control');
} else {
  pass('parse', 'evidence create body');
}

const pan = readFileSync(join(lab, 'js/platform/connected-evidence-panels.js'), 'utf8');
if (!pan.includes('data-connected-evidence-create-mode') || !pan.includes('uat_authorised')) {
  failTest('ui_mode', 'evidence create panel must expose Authorised UAT mode');
} else {
  pass('ui_mode', 'creation mode selector');
}

const cat = readFileSync(join(lab, 'js/platform/connected-catalogue.js'), 'utf8');
if (!cat.includes('mergeEvidenceCatalogueRow') || !cat.includes('authorisedUatEvidence')) {
  failTest('catalogue', 'evidence UAT partition');
} else {
  pass('catalogue', 'authorisedUatEvidence register');
}

const views = readFileSync(join(lab, 'js/views.js'), 'utf8');
if (!views.includes('getViewAuthorisedUatEvidence') || !views.includes('Authorised UAT evidence')) {
  failTest('views', 'evidence list UAT section');
} else {
  pass('views', 'UAT evidence register UI');
}

const appJs = readFileSync(join(lab, 'js/app.js'), 'utf8');
if (!appJs.includes('creationMode') || !appJs.includes('controlId')) {
  failTest('app_create', 'evidence create sends mode + controlId');
} else {
  pass('app_create', 'create payload wired');
}

const upload = readFileSync(join(platform, 'app/api/ri-lab/evidence/[id]/upload/route.ts'), 'utf8');
if (!upload.includes('uploadTenantEvidenceVersion')) failTest('upload', 'missing upload route');
else pass('upload', 'secure file upload API');

const detailRoute = readFileSync(join(platform, 'app/api/ri-lab/evidence/[id]/route.ts'), 'utf8');
if (!detailRoute.includes('versions')) failTest('detail_versions', 'evidence GET must expose file versions');
else pass('detail_versions', 'versions on evidence detail API');

const writes = readFileSync(join(lab, 'js/platform/connected-work-writes.js'), 'utf8');
if (!writes.includes('formatEvidenceUploadError') || !writes.includes('fetchConnectedEvidenceDetail')) {
  failTest('upload_ui', 'connected upload must map errors and refresh detail');
} else {
  pass('upload_ui', 'upload error mapping + detail refresh');
}

const panV = readFileSync(join(lab, 'js/platform/connected-evidence-panels.js'), 'utf8');
if (!panV.includes('renderConnectedEvidenceVersionsPanel')) {
  failTest('versions_ui', 'evidence detail must list file versions');
} else {
  pass('versions_ui', 'versions panel');
}

const catHydrate = readFileSync(join(lab, 'js/platform/connected-catalogue.js'), 'utf8');
if (
  !catHydrate.includes('_detailHydrated') ||
  catHydrate.includes('evidenceDetailsById[evidence.id] =')
) {
  failTest('detail_hydrate', 'evidence detail must hydrate via GET /evidence/:id');
} else {
  pass('detail_hydrate', 'evidence detail hydration guard');
}

const detailRouteHydrate = readFileSync(join(platform, 'app/api/ri-lab/evidence/[id]/route.ts'), 'utf8');
if (!detailRouteHydrate.includes('linkedControls')) {
  failTest('linked_controls_api', 'evidence detail API must expose linked controls');
} else {
  pass('linked_controls_api', 'linkedControls on detail API');
}

const migrate = readFileSync(join(lab, 'js/migrate.js'), 'utf8');
if (!migrate.includes('_detailHydrated')) {
  failTest('migrate_stale', 'migrate must drop stale evidence detail cache');
} else {
  pass('migrate_stale', 'stale evidence cache purge on load');
}

if (!fail) console.log('\nacceptance-phase-8-step-85w-evidence-uat: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-evidence-uat: FAIL (${fail})\n`);
  process.exit(1);
}
