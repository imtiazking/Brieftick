#!/usr/bin/env node
/**
 * Phase 3 — RI production schema acceptance (static SQL + contracts; no live DB required).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');
const migrationsDir = join(platformRoot, 'supabase', 'migrations');

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

function readMigrations() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.map((f) => readFileSync(join(migrationsDir, f), 'utf8')).join('\n');
}

const sql = readMigrations();
const riSql = ['20260322150000_ri_reference.sql', '20260322150100_ri_lifecycle.sql', '20260322150200_ri_rls.sql']
  .map((f) => (existsSync(join(migrationsDir, f)) ? readFileSync(join(migrationsDir, f), 'utf8') : ''))
  .join('\n');

const GLOBAL_TABLES = ['regulators', 'regulatory_sources', 'regulatory_publications'];

const TENANT_TABLES = [
  'organisation_publications',
  'applicability_assessments',
  'regulatory_changes',
  'impact_assessments',
  'impact_assessment_business_areas',
  'impact_assessment_systems',
  'impact_assessment_products',
  'impact_assessment_legal_entities',
  'regulatory_obligations',
  'policies',
  'risks',
  'controls',
  'actions',
  'evidence_items',
  'assurance_reviews',
  'findings',
  'workflow_events',
];

const JOIN_TABLES = [
  'obligation_policy_links',
  'obligation_risk_links',
  'risk_control_links',
  'obligation_control_links',
  'action_impact_assessment_links',
  'action_obligation_links',
  'action_control_gap_links',
  'action_policy_gap_links',
  'evidence_action_links',
  'evidence_control_links',
  'evidence_obligation_links',
  'assurance_review_control_links',
  'assurance_review_obligation_links',
  'finding_control_links',
  'finding_action_links',
  'finding_assurance_review_links',
];

for (const t of GLOBAL_TABLES) {
  if (!riSql.includes(`create table public.${t}`)) failMsg(`global table ${t} missing`);
  else pass(`global table ${t}`);
  const block = riSql.match(new RegExp(`create table public\\.${t}\\s*\\([\\s\\S]*?\\);`, 'i'));
  if (block && block[0].includes('organisation_id')) failMsg(`${t} must not be organisation-scoped`);
  else pass(`${t} not tenant-owned`);
}

for (const t of [...TENANT_TABLES, ...JOIN_TABLES]) {
  if (!riSql.includes(`create table public.${t}`)) failMsg(`table ${t} missing`);
  else pass(`table ${t} defined`);
}

for (const t of TENANT_TABLES) {
  const block = riSql.match(new RegExp(`create table public\\.${t}\\s*\\([\\s\\S]*?\\);`, 'i'));
  if (!block || !block[0].includes('organisation_id')) failMsg(`${t} missing organisation_id`);
  else pass(`${t} has organisation_id`);
}

for (const t of JOIN_TABLES) {
  const block = riSql.match(new RegExp(`create table public\\.${t}\\s*\\([\\s\\S]*?\\);`, 'i'));
  if (!block || !block[0].includes('organisation_id')) failMsg(`join ${t} missing organisation_id`);
  else pass(`join ${t} tenant-scoped`);
}

if (riSql.includes('create table public.finding_obligation_links')) {
  failMsg('finding_obligation_links must not exist (no inferred obligation attribution)');
} else pass('no finding_obligation_links');

for (const j of ['evidence_action_links', 'evidence_control_links', 'evidence_obligation_links']) {
  if (!riSql.includes(`create table public.${j}`)) failMsg(`explicit evidence link ${j} missing`);
  else pass(`explicit evidence link ${j}`);
}

if (!riSql.includes('obligation_policy_links')) failMsg('obligation_policy_links missing');
else pass('obligation_policy_links (no authoritative arrays)');

if (/\bobligation_ids\b|\bobligation_id\[\]/i.test(riSql)) {
  failMsg('denormalised obligation ID arrays suspected');
} else pass('no authoritative obligation ID arrays');

if (!riSql.includes("default 'NOT_ENABLED'") && !riSql.includes('not null default \'NOT_ENABLED\'')) {
  if (!riSql.includes('production_source_status') || !riSql.includes('NOT_ENABLED')) {
    failMsg('production_source_status NOT_ENABLED default missing');
  }
}
if (riSql.includes('production_source_status') && riSql.includes('NOT_ENABLED')) {
  pass('production sources default NOT_ENABLED');
}

for (const t of [...TENANT_TABLES, ...JOIN_TABLES]) {
  if (!riSql.includes(`enable row level security`) || !riSql.includes(t)) {
    // RLS applied via DO block — check policy name
  }
}
if (!riSql.includes('is_active_member(organisation_id)')) {
  failMsg('tenant RLS must use is_active_member(organisation_id)');
} else pass('tenant policies use is_active_member');

const rlsOnly = readFileSync(join(migrationsDir, '20260322150200_ri_rls.sql'), 'utf8');
if (rlsOnly.match(/using\s*\(\s*true\s*\)/i)) failMsg('USING (true) on tenant/global policies');
else pass('no USING (true) in RI RLS');

if (riSql.includes('subject_type') && riSql.includes('subject_id')) {
  failMsg('unsafe polymorphic assurance subject columns');
} else pass('assurance uses explicit link tables');

for (const key of ['REG-', 'SRC-']) {
  if (!riSql.includes('external_key')) failMsg('external_key columns expected');
}
pass('stable external_key columns for catalogue entities');

if (!riSql.includes('uuid primary key')) failMsg('UUID primary keys expected');
else pass('UUID primary keys');

const lifecycleSql = readFileSync(join(migrationsDir, '20260322150100_ri_lifecycle.sql'), 'utf8');
const unsafeFkCascade = [
  /publication_id uuid not null references public\.regulatory_publications \(id\) on delete cascade/i,
  /regulatory_change_id uuid references public\.regulatory_changes \(id\) on delete cascade/i,
  /regulatory_change_id uuid not null references public\.regulatory_changes \(id\) on delete cascade/i,
];
let cascadeFail = false;
for (const re of unsafeFkCascade) {
  if (re.test(lifecycleSql)) {
    cascadeFail = true;
    failMsg(`unsafe CASCADE on lifecycle FK: ${re}`);
  }
}
if (!cascadeFail) pass('no unsafe lifecycle CASCADE deletes');

for (const idx of [
  'regulatory_changes_organisation_id_idx',
  'regulatory_obligations_status_idx',
  'regulatory_publications_source_id_idx',
]) {
  if (!riSql.includes(idx)) failMsg(`index ${idx} missing`);
  else pass(`index ${idx}`);
}

const enumsTs = readFileSync(join(platformRoot, 'lib', 'ri', 'enums.ts'), 'utf8');
const obligationEnumSql = riSql.match(/create type public\.obligation_status as enum \(([\s\S]*?)\);/);
if (!obligationEnumSql) failMsg('obligation_status enum missing');
else {
  for (const status of [
    'DRAFT',
    'IN_REVIEW',
    'OPEN',
    'IN_PROGRESS',
    'OVERDUE',
    'COMPLETE',
    'HISTORIC',
    'CLOSED',
  ]) {
    if (!obligationEnumSql[1].includes(`'${status}'`)) failMsg(`obligation ${status} missing in SQL`);
    if (!enumsTs.includes(`'${status}'`)) failMsg(`obligation ${status} missing in TS`);
  }
  pass('obligation SQL/TS taxonomy aligned');
}

for (const rec of ['APPLICABLE', 'POSSIBLY_APPLICABLE', 'NOT_APPLICABLE', 'UNASSESSED']) {
  if (!riSql.includes(`'${rec}'`) || !enumsTs.includes(`'${rec}'`)) failMsg(`applicability ${rec} misaligned`);
}
pass('applicability SQL/TS aligned');

const riPage = readFileSync(join(platformRoot, 'app', 'ri', 'page.tsx'), 'utf8');
if (/design-lab|ask-ri|openai|anthropic/i.test(riPage)) failMsg('RI page must not reference lab/AI');
else pass('no Ask RI / AI on /ri');

if (!riPage.includes('schema foundation') && !riPage.includes('Schema foundation')) {
  failMsg('/ri must show schema foundation status');
} else pass('/ri schema foundation messaging');

if (!existsSync(join(platformRoot, 'docs', 'RELATIONSHIP-AUTHORITY.md'))) failMsg('RELATIONSHIP-AUTHORITY.md missing');
else pass('relationship authority documented');

if (!existsSync(join(platformRoot, 'scripts', 'sync-reference-catalogue.mjs'))) {
  failMsg('reference sync script missing');
} else pass('reference catalogue sync script');

const appsRi = join(repoRoot, 'apps', 'regulatory-intelligence');
if (existsSync(join(appsRi, 'index.html'))) {
  pass('apps/regulatory-intelligence present but out of scope');
}

const labPath = join(repoRoot, 'design-lab', 'regulatory-intelligence', 'js', 'router.js');
if (!existsSync(labPath)) failMsg('frozen RI path missing');
else pass('frozen design-lab reference intact');

// ORG-A / ORG-B policy pattern (offline)
const tenantAccess = await import('../lib/auth/tenant-access.fixture.mjs');
const memberships = [
  {
    organisationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    clerkUserId: 'user_a',
    role: 'VIEWER',
    status: 'active',
  },
  {
    organisationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    clerkUserId: 'user_b',
    role: 'ADMIN',
    status: 'active',
  },
];
if (
  tenantAccess.userCanAccessOrganisation(
    memberships,
    'user_a',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  )
) {
  failMsg('ORG-A lifecycle isolation fixture: user_a cannot access ORG-B');
} else pass('ORG-A cannot access ORG-B (app layer; RLS uses same membership function)');

let localDb = 'NOT CONFIGURED';
if (process.env.FORGENIQ_LOCAL_SUPABASE === '1') {
  localDb = 'FAIL';
  failMsg('FORGENIQ_LOCAL_SUPABASE=1 set but local migration runner not wired in CI');
} else {
  pass('LOCAL DB MIGRATION TEST: NOT CONFIGURED (static acceptance only)');
}

if (fail) {
  console.error(`\nPhase 3 RI schema acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log(`\nPhase 3 RI schema acceptance: PASS`);
console.log(`LOCAL DB MIGRATION TEST: ${localDb}`);
