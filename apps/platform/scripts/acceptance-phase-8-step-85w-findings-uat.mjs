#!/usr/bin/env node
/**
 * BUS-UAT-015 — Findings register route, Authorised UAT create + control link + partition (static).
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

const findingsSvc = readFileSync(join(platform, 'lib/ri/services/findings.ts'), 'utf8');
if (!findingsSvc.includes('linkFindingControl') || !findingsSvc.includes('metadata')) {
  failTest('server_create', 'createFinding must write metadata and optional control link');
} else {
  pass('server_create', 'finding provenance + control link on create');
}
if (!findingsSvc.includes('loadFindingLinkedControls')) {
  failTest('server_detail', 'getFindingDetail must load control links in two-step query');
} else {
  pass('server_detail', 'finding control link resolution');
}

const govView = readFileSync(join(platform, 'lib/ri/lab-api/lab-governance-view.ts'), 'utf8');
if (!govView.includes('parentRiskId') || !govView.includes('findingRelationshipFieldsFromMetadata')) {
  failTest('lab_view', 'mapFindingRowToLabView must expose metadata lineage');
} else {
  pass('lab_view', 'parentRiskId/parentControlId on lab view');
}
if (!govView.includes('parseLabRowMetadata')) {
  failTest('lab_metadata', 'metadata must parse string JSON for lineage fields');
} else {
  pass('lab_metadata', 'parseLabRowMetadata');
}

const postRoute = readFileSync(join(platform, 'app/api/ri-lab/findings/route.ts'), 'utf8');
if (!postRoute.includes('getFindingDetail')) {
  failTest('post_detail', 'POST must return hydrated finding with links');
} else {
  pass('post_detail', 'create response includes relationships');
}

const prov = readFileSync(join(platform, 'lib/ri/lab-api/risk-control-lab-provenance.ts'), 'utf8');
if (!prov.includes('partitionFindingsForLabScope') || !prov.includes('resolveFindingCreateMetadata')) {
  failTest('partition', 'finding UAT partition helpers');
} else {
  pass('partition', 'partitionFindingsForLabScope');
}

const parse = readFileSync(join(platform, 'lib/ri/lab-api/lab-link-write.ts'), 'utf8');
if (!parse.includes('parseLabFindingCreateBody') || !parse.includes('finding_control')) {
  failTest('parse', 'finding create + finding_control link');
} else {
  pass('parse', 'finding create body + link type');
}

const workflow = readFileSync(join(platform, 'app/api/ri-lab/workflow-events/route.ts'), 'utf8');
if (!workflow.includes("finding: 'findings'")) {
  failTest('workflow_entity', 'workflow-events must accept entityType finding');
} else {
  pass('workflow_entity', 'finding audit fetch');
}

const detailRoute = readFileSync(join(platform, 'app/api/ri-lab/findings/[id]/route.ts'), 'utf8');
if (!detailRoute.includes('linkedControls') || !detailRoute.includes('parentRiskId')) {
  failTest('detail_api', 'finding GET must expose linked controls + parent risk');
} else {
  pass('detail_api', 'linkedControls on detail API');
}

const views = readFileSync(join(lab, 'js/views.js'), 'utf8');
if (!views.includes("case 'findings'") || !views.includes('viewFindingsList')) {
  failTest('route', '#/findings must register viewFindingsList');
} else {
  pass('route', 'findings register route');
}

const router = readFileSync(join(lab, 'js/router.js'), 'utf8');
if (!router.includes("'findings'")) {
  failTest('router_allowlist', 'KNOWN_TOP_LEVEL must include findings (renderViewSafe gate)');
} else {
  pass('router_allowlist', 'findings allowed before renderView');
}

const assurance = readFileSync(join(lab, 'js/assurance-views.js'), 'utf8');
if (!assurance.includes('viewFindingsList') || !assurance.includes('Authorised UAT findings register')) {
  failTest('register_ui', 'findings list UAT section');
} else {
  pass('register_ui', 'UAT + operational registers');
}

const pan = readFileSync(join(lab, 'js/platform/connected-finding-panels.js'), 'utf8');
if (!pan.includes('data-connected-finding-create-mode') || !pan.includes('finding_control')) {
  failTest('ui_mode', 'finding create + link panels');
} else {
  pass('ui_mode', 'UAT create + control link UI');
}

const cat = readFileSync(join(lab, 'js/platform/connected-catalogue.js'), 'utf8');
if (!cat.includes('mergeFindingCatalogueRow') || !cat.includes('findingDetailsById')) {
  failTest('catalogue', 'finding catalogue merge + detail hydration');
} else {
  pass('catalogue', 'finding detail hydration');
}

const appJs = readFileSync(join(lab, 'js/app.js'), 'utf8');
if (!appJs.includes('scheduleConnectedFindingDetailFetch') || !appJs.includes('creationMode')) {
  failTest('app_wiring', 'finding detail schedule + create payload');
} else {
  pass('app_wiring', 'app handlers wired');
}

const writes = readFileSync(join(lab, 'js/platform/connected-work-writes.js'), 'utf8');
if (!writes.includes("case 'finding_control'")) {
  failTest('link_audit', 'finding_control link audit refresh');
} else {
  pass('link_audit', 'finding_control delegation');
}

const migrate = readFileSync(join(lab, 'js/migrate.js'), 'utf8');
if (!migrate.includes('findingDetailsById')) {
  failTest('migrate_stale', 'migrate must drop stale finding detail cache');
} else {
  pass('migrate_stale', 'stale finding cache purge on load');
}

const assuranceHydrate = readFileSync(join(lab, 'js/assurance-views.js'), 'utf8');
if (
  assuranceHydrate.includes('Loading finding relationships from staging') &&
  !assuranceHydrate.includes('findingHasRelationshipHints')
) {
  failTest('detail_blocking', 'finding detail must not block full page on relationship load');
} else {
  pass('detail_blocking', 'non-blocking relationship refresh');
}

const catRetry = readFileSync(join(lab, 'js/platform/connected-catalogue.js'), 'utf8');
if (!catRetry.includes('recordFindingDetailLoadFailure') || !catRetry.includes('forceRefetchConnectedFindingDetail')) {
  failTest('detail_error', 'finding detail must record errors and support retry');
} else {
  pass('detail_error', 'detail failure + retry path');
}
if (!catRetry.includes('connectedCatalogueHasStaleFindingLineage') || !catRetry.includes('findingCatalogueRowNeedsDetailLineage')) {
  failTest('catalogue_stale', 'must refresh stale finding lineage in connected catalogue');
} else {
  pass('catalogue_stale', 'stale UAT finding lineage refresh');
}

const entityAudit = readFileSync(join(lab, 'js/platform/connected-entity-audit.js'), 'utf8');
if (!entityAudit.includes('entityWorkflowEventsLoadStateByKey') || entityAudit.includes('if (cat.entityWorkflowEventsByKey[key]) return null')) {
  failTest('audit_cache', 'entity audit must not treat empty [] as permanent cache');
} else {
  pass('audit_cache', 'entity workflow load markers');
}

const linkPan = readFileSync(join(lab, 'js/platform/connected-finding-panels.js'), 'utf8');
if (!linkPan.includes('Relationship load failed') || !linkPan.includes('loadState.loading')) {
  failTest('link_panel_errors', 'link panel must distinguish load failure from empty data');
} else {
  pass('link_panel_errors', 'relationship failure vs empty');
}

const migSql = readFileSync(
  join(platform, 'supabase/migrations/20261109140000_findings_metadata_provenance.sql'),
  'utf8',
);
if (!migSql.includes('metadata')) failTest('migration', 'findings.metadata migration');
else pass('migration', 'findings.metadata column');

if (!fail) console.log('\nacceptance-phase-8-step-85w-findings-uat: PASS\n');
else {
  console.error(`\nacceptance-phase-8-step-85w-findings-uat: FAIL (${fail})\n`);
  process.exit(1);
}
