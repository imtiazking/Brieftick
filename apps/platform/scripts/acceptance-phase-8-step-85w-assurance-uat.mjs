#!/usr/bin/env node
/**
 * BUS-UAT-016 — Assurance Authorised UAT create mode, partition, detail + audit (static).
 */
import { readFileSync } from 'node:fs';
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

const assuranceSvc = readFileSync(join(platform, 'lib/ri/services/assurance.ts'), 'utf8');
if (!assuranceSvc.includes('resolveAssuranceCreateMetadata') || !assuranceSvc.includes('ASSURANCE_REVIEW_CREATED')) {
  failTest('server_create', 'createAssuranceReview must write metadata and ASSURANCE_REVIEW_CREATED');
} else {
  pass('server_create', 'assurance provenance + create audit event');
}
if (!assuranceSvc.includes('ASSURANCE_RESULT_CHANGED')) {
  failTest('server_patch', 'updateAssuranceReview must emit ASSURANCE_RESULT_CHANGED');
} else {
  pass('server_patch', 'outcome patch audit');
}

const prov = readFileSync(join(platform, 'lib/ri/lab-api/risk-control-lab-provenance.ts'), 'utf8');
if (!prov.includes('partitionAssuranceReviewsForLabScope') || !prov.includes('resolveAssuranceCreateMetadata')) {
  failTest('partition', 'assurance UAT partition helpers');
} else {
  pass('partition', 'partitionAssuranceReviewsForLabScope');
}

const parse = readFileSync(join(platform, 'lib/ri/lab-api/lab-link-write.ts'), 'utf8');
if (!parse.includes('parseLabAssuranceCreateBody') || !parse.includes("defaultMode: 'uat_authorised'")) {
  failTest('parse', 'lab assurance create defaults to uat_authorised');
} else {
  pass('parse', 'parseLabAssuranceCreateBody');
}

const postRoute = readFileSync(join(platform, 'app/api/ri-lab/assurance-reviews/route.ts'), 'utf8');
if (!postRoute.includes('getAssuranceDetail') || !postRoute.includes('linkedControls')) {
  failTest('post_detail', 'POST must return hydrated assurance with controls');
} else {
  pass('post_detail', 'create response includes relationships');
}

const gov = readFileSync(join(platform, 'app/api/ri-lab/tenant-governance/route.ts'), 'utf8');
if (!gov.includes('authorisedUatAssuranceReviews') || !gov.includes('partitionAssuranceReviewsForLabScope')) {
  failTest('governance', 'tenant-governance must partition assurance registers');
} else {
  pass('governance', 'authorisedUatAssuranceReviews');
}

const workflow = readFileSync(join(platform, 'app/api/ri-lab/workflow-events/route.ts'), 'utf8');
if (!workflow.includes("assurance_review: 'assurance_reviews'")) {
  failTest('workflow_entity', 'workflow-events must accept entityType assurance_review');
} else {
  pass('workflow_entity', 'assurance audit fetch');
}

const detailRoute = readFileSync(join(platform, 'app/api/ri-lab/assurance-reviews/[id]/route.ts'), 'utf8');
if (!detailRoute.includes('PATCH') || !detailRoute.includes('linkedControls')) {
  failTest('detail_api', 'assurance GET/PATCH detail API');
} else {
  pass('detail_api', 'detail + patch routes');
}

const dashboard = readFileSync(join(platform, 'lib/ri/services/dashboard.ts'), 'utf8');
if (!dashboard.includes('partitionAssuranceReviewsForLabScope')) {
  failTest('dashboard', 'operational dashboard must exclude UAT assurance');
} else {
  pass('dashboard', 'assurance operational isolation');
}

const links = readFileSync(join(platform, 'lib/ri/links.ts'), 'utf8');
if (!links.includes('classifyAssuranceForLab') || !links.includes('assertLabClassesCompatibleForLink')) {
  failTest('link_prov', 'linkAssuranceControl provenance gate');
} else {
  pass('link_prov', 'cross-provenance link rejection');
}

const pan = readFileSync(join(lab, 'js/platform/connected-assurance-panels.js'), 'utf8');
if (!pan.includes('data-connected-assurance-create-mode') || !pan.includes('assurance_control')) {
  failTest('ui_mode', 'assurance create + link panels');
} else {
  pass('ui_mode', 'UAT create mode UI');
}

const cat = readFileSync(join(lab, 'js/platform/connected-catalogue.js'), 'utf8');
if (!cat.includes('mergeAssuranceCatalogueRow') || !cat.includes('assuranceDetailsById')) {
  failTest('catalogue', 'assurance catalogue merge + detail hydration');
} else {
  pass('catalogue', 'assurance detail hydration');
}

const appJs = readFileSync(join(lab, 'js/app.js'), 'utf8');
if (!appJs.includes('scheduleConnectedAssuranceDetailFetch') || !appJs.includes('creationMode')) {
  failTest('app_wiring', 'assurance detail schedule + create payload');
} else {
  pass('app_wiring', 'app handlers wired');
}

const views = readFileSync(join(lab, 'js/assurance-views.js'), 'utf8');
if (!views.includes('Authorised UAT assurance register') || !views.includes('Operational assurance register')) {
  failTest('register_ui', 'dual assurance registers');
} else {
  pass('register_ui', 'operational vs UAT registers');
}

const migSql = readFileSync(
  join(platform, 'supabase/migrations/20261109160000_assurance_reviews_metadata_provenance.sql'),
  'utf8',
);
if (!migSql.includes('metadata')) failTest('migration', 'assurance_reviews.metadata migration');
else pass('migration', 'assurance_reviews.metadata column');

if (!fail) console.log('\nacceptance-phase-8-step-85w-assurance-uat: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-assurance-uat: FAIL (${fail})\n`);
  process.exit(1);
}
