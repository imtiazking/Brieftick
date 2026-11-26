#!/usr/bin/env node
/**
 * Design Lab register scoping (hosted-UAT defect: records "missing" under scope=all, registers disagreeing).
 *
 * Root causes found by audit:
 *  - tenant-work ignored scope for CHANGES (primary list was always the operational partition);
 *  - GET /changes used an older text-heuristic filter instead of persisted provenance;
 *  - GET /risks and GET /controls ignored scope entirely, so "operational" leaked UAT rows and scope=all had no meaning.
 * Fix: one helper (scopeRegister) and one classifier per register, used by every route.
 *
 * Proves: the scoping rule for changes / obligations / risks / controls under both scopes; that scope=all NEVER adds a
 * row the tenant-scoped query did not return (real Postgres + RLS, two organisations, non-superuser identities);
 * that unverified provenance fails closed in the operational view; and that every route is wired to the helper.
 * Deterministic. No network, no provider call, no paid AI.
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const { scopeRegister, parseLabDataScope } = await import('../lib/ri/lab-api/lab-data-scope.ts');
const { partitionChangesForLabScope, changeLabProvenanceInputFromRow } = await import('../lib/ri/lab-api/change-lab-provenance.ts');
const { partitionObligationsForLabScope, obligationLabProvenanceInputFromRow } = await import('../lib/ri/lab-api/obligation-lab-provenance.ts');
const {
  partitionRisksForLabScope, partitionControlsForLabScope, riskLabProvenanceInputFromRow, controlLabProvenanceInputFromRow,
} = await import('../lib/ri/lab-api/risk-control-lab-provenance.ts');
const { listRisks } = await import('../lib/ri/services/risks.ts');
const { listControls } = await import('../lib/ri/services/controls.ts');
const { listChanges } = await import('../lib/ri/services/changes.ts');
const {
  ORG_A, ORG_B, applyAllMigrations, applyReferenceSeed, ensureAppRole, insertTestPublication, resetAndStartEmbedded, stopEmbedded,
} = await import('./local-db/harness.mjs');
const { createPgSupabaseClient } = await import('./local-db/pg-supabase-adapter.mjs');

let pass = 0;
let fail = 0;
const check = (id, ok, detail) => {
  if (ok) pass += 1;
  else {
    fail += 1;
    console.error(`FAIL: ${id}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
};
const ids = (rows) => rows.map((r) => r.id).sort();

const OP = { labProvenanceLocked: true, labCreationMode: 'operational' };
const UAT = { labProvenanceLocked: true, labCreationMode: 'uat_authorised' };
const SYN = { recordProvenance: 'synthetic_uat' };

// ------------------------------------------------------------------------------------------------ pure scoping
const url = (q) => new URL(`https://x.test/api/ri-lab/r${q}`);
check('scope parsing: default is operational', parseLabDataScope(url('')) === 'operational');
check('scope parsing: scope=all', parseLabDataScope(url('?scope=all')) === 'all');
check('scope parsing: dataScope=all', parseLabDataScope(url('?dataScope=all')) === 'all');
check('scope parsing: unknown values fail closed to operational', parseLabDataScope(url('?scope=everything')) === 'operational');

const registers = {
  risks: {
    rows: [
      { id: 'r-op', metadata: OP }, { id: 'r-uat', metadata: UAT }, { id: 'r-syn', metadata: SYN }, { id: 'r-none', metadata: {} },
    ],
    partition: (rows, scope) => partitionRisksForLabScope(rows, scope, (r) => riskLabProvenanceInputFromRow(r)),
  },
  controls: {
    rows: [
      { id: 'c-op', metadata: OP }, { id: 'c-uat', metadata: UAT }, { id: 'c-syn', metadata: SYN }, { id: 'c-none', metadata: {} },
    ],
    partition: (rows, scope) => partitionControlsForLabScope(rows, scope, (r) => controlLabProvenanceInputFromRow(r)),
  },
  obligations: {
    rows: [
      { id: 'o-op', metadata: OP }, { id: 'o-uat', metadata: UAT }, { id: 'o-syn', metadata: SYN }, { id: 'o-none', metadata: {} },
    ],
    partition: (rows, scope) => partitionObligationsForLabScope(rows, scope, (r) => obligationLabProvenanceInputFromRow(r)),
  },
  changes: {
    rows: [
      { id: 'ch-op', title: 'Operational change', metadata: OP, publication_id: 'p' },
      { id: 'ch-uat', title: 'Authorised UAT change', metadata: UAT, publication_id: 'p' },
      { id: 'ch-syn', title: 'Synthetic change', metadata: SYN, publication_id: 'p' },
    ],
    partition: (rows, scope) => partitionChangesForLabScope(rows, scope, (r) => changeLabProvenanceInputFromRow(r)),
  },
};

for (const [name, def] of Object.entries(registers)) {
  const op = scopeRegister('operational', def.rows, def.partition(def.rows, 'operational'));
  const all = scopeRegister('all', def.rows, def.partition(def.rows, 'all'));
  const prefix = name === 'obligations' ? 'o' : name === 'risks' ? 'r' : name === 'controls' ? 'c' : 'ch';

  check(`${name}: operational shows the operational record`, ids(op.primary).includes(`${prefix}-op`), ids(op.primary));
  check(`${name}: operational holds back authorised UAT from the primary list`, !ids(op.primary).includes(`${prefix}-uat`), ids(op.primary));
  check(`${name}: operational holds back synthetic records`, !ids(op.primary).includes(`${prefix}-syn`), ids(op.primary));
  check(`${name}: operational still exposes the authorised UAT record as a labelled subset`, ids(op.authorisedUat).includes(`${prefix}-uat`), ids(op.authorisedUat));
  check(`${name}: scope=all returns EVERY row the tenant query returned (authorised UAT included)`, JSON.stringify(ids(all.primary)) === JSON.stringify(ids(def.rows)), ids(all.primary));
  check(`${name}: scope=all has no duplicates`, new Set(all.primary.map((r) => r.id)).size === all.primary.length);
  check(`${name}: authorised UAT subset is always contained in the scope=all primary list`, all.authorisedUat.every((u) => all.primary.some((p) => p.id === u.id)));
  check(`${name}: scoping never invents rows (primary is a subset of the input)`, [...op.primary, ...all.primary].every((p) => def.rows.some((r) => r.id === p.id)));
  check(`${name}: provenance counts add up to the input size`, Object.values(all.provenance).reduce((a, b) => a + b, 0) === def.rows.length, all.provenance);
}
{
  const def = registers.risks;
  const op = scopeRegister('operational', def.rows, def.partition(def.rows, 'operational'));
  check('risks: a record with NO persisted provenance fails closed in the operational view', !ids(op.primary).includes('r-none'), ids(op.primary));
  const all = scopeRegister('all', def.rows, def.partition(def.rows, 'all'));
  check('risks: …and is still reachable under scope=all (never silently lost)', ids(all.primary).includes('r-none'));
}
{
  // The defect itself: changes ignored scope=all in tenant-work.
  const def = registers.changes;
  const all = scopeRegister('all', def.rows, def.partition(def.rows, 'all'));
  check('REGRESSION: scope=all changes include the authorised UAT change (previously dropped)', ids(all.primary).includes('ch-uat'), ids(all.primary));
}

// ------------------------------------------------------------------------------------------------ route wiring
const read = (p) => readFileSync(join(platformRoot, p), 'utf8');
for (const [route, helper] of [
  ['app/api/ri-lab/risks/route.ts', 'scopeRegister'],
  ['app/api/ri-lab/controls/route.ts', 'scopeRegister'],
  ['app/api/ri-lab/changes/route.ts', 'scopeRegister'],
]) {
  const src = read(route);
  check(`${route} parses the scope and CALLS ${helper} on the tenant-scoped rows`, /parseLabDataScope\(new URL\(request\.url\)\)/.test(src) && /scopeRegister\(scope, rowsRaw, partition\)/.test(src), route);
  check(`${route} serves the scoped primary list, not the raw rows`, /scoped\.primary/.test(src), route);
}
check('changes route no longer uses the text-heuristic filter', !/filterRowsByLabDataScope/.test(read('app/api/ri-lab/changes/route.ts')));
const tw = read('app/api/ri-lab/tenant-work/route.ts');
for (const reg of ['changeRows', 'impactRows', 'obligationRows', 'riskRows', 'controlRows']) {
  check(`tenant-work: ${reg} honours the scope`, new RegExp(`const ${reg} = primaryRowsForLabScope\\(`).test(tw.replace(/\s+/g, ' ')) || new RegExp(`const ${reg} =\\s*primaryRowsForLabScope\\(`).test(tw), reg);
}
check('Design Lab still requests the operational scope explicitly', /LAB_DATA_SCOPE_QUERY = 'dataScope=operational'/.test(read('../../design-lab/regulatory-intelligence/js/platform/connected-catalogue.js')));

// ------------------------------------------------------------------------------------------------ real Postgres + RLS
const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54375 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);
  await admin.query('grant authenticated to forgeniq_app');
  const publicationId = await insertTestPublication(admin);
  await admin.query(`insert into public.organisations (id, name, slug) values ($1, 'ORG A SCOPE', 'org-a-scope'), ($2, 'ORG B SCOPE', 'org-b-scope') on conflict do nothing`, [ORG_A, ORG_B]);
  const UA = 'clerk_scope_user_a';
  const UB = 'clerk_scope_user_b';
  await admin.query(`insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, 'COMPLIANCE_MANAGER', 'active'), ($3, $4, 'COMPLIANCE_MANAGER', 'active') on conflict (organisation_id, clerk_user_id) do nothing`, [ORG_A, UA, ORG_B, UB]);

  const insChange = (org, key, meta) => admin.query(
    `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, external_key, created_by_user_id, metadata) values ($1, $2, $3, 'TEST', 'OPEN', $4, $5, $6::jsonb) returning id`,
    [org, publicationId, `Scope test change ${key}`, key, UA, JSON.stringify(meta)]);
  const insRisk = (org, title, meta) => admin.query(`insert into risks (organisation_id, title, status, metadata, created_by_user_id) values ($1, $2, 'ACTIVE', $3::jsonb, $4) returning id`, [org, title, JSON.stringify(meta), UA]);
  const insControl = (org, name, meta) => admin.query(`insert into controls (organisation_id, name, status, metadata, created_by_user_id) values ($1, $2, 'ACTIVE', $3::jsonb, $4) returning id`, [org, name, JSON.stringify(meta), UA]);

  await insChange(ORG_A, 'SCOPE-A-OP', OP);
  await insChange(ORG_A, 'SCOPE-A-UAT', UAT);
  await insChange(ORG_B, 'SCOPE-B-OP', OP);
  await insChange(ORG_B, 'SCOPE-B-UAT', UAT);
  await insRisk(ORG_A, 'A operational risk', OP);
  await insRisk(ORG_A, 'A uat risk', UAT);
  await insRisk(ORG_B, 'B operational risk', OP);
  await insRisk(ORG_B, 'B uat risk', UAT);
  await insControl(ORG_A, 'A operational control', OP);
  await insControl(ORG_A, 'A uat control', UAT);
  await insControl(ORG_B, 'B operational control', OP);
  await insControl(ORG_B, 'B uat control', UAT);

  const clientA = createPgSupabaseClient(adminUrl, UA);
  const clientB = createPgSupabaseClient(adminUrl, UB);

  const registersDb = [
    // listChanges embeds the publication (PostgREST resource embedding), which the local pg adapter cannot parse.
    // The same RLS-governed table query without the embed is used; the classifier only reads the row's own columns.
    { name: 'changes', list: async (c, org) => { const r = await c.from('regulatory_changes').select('id, title, description, external_key, origin, publication_id, metadata').eq('organisation_id', org); if (r.error) throw new Error(r.error.message); return r.data ?? []; }, key: (r) => r.external_key, partition: (rows, s) => partitionChangesForLabScope(rows, s, (r) => changeLabProvenanceInputFromRow(r)), own: 'SCOPE-A', other: 'SCOPE-B', uat: 'SCOPE-A-UAT', op: 'SCOPE-A-OP' },
    { name: 'risks', list: listRisks, key: (r) => r.title, partition: (rows, s) => partitionRisksForLabScope(rows, s, (r) => riskLabProvenanceInputFromRow(r)), own: 'A ', other: 'B ', uat: 'A uat risk', op: 'A operational risk' },
    { name: 'controls', list: listControls, key: (r) => r.name, partition: (rows, s) => partitionControlsForLabScope(rows, s, (r) => controlLabProvenanceInputFromRow(r)), own: 'A ', other: 'B ', uat: 'A uat control', op: 'A operational control' },
  ];

  for (const reg of registersDb) {
    const rowsA = await reg.list(clientA, ORG_A);
    const opA = scopeRegister('operational', rowsA, reg.partition(rowsA, 'operational'));
    const allA = scopeRegister('all', rowsA, reg.partition(rowsA, 'all'));
    const keysAll = allA.primary.map(reg.key);
    const keysOp = opA.primary.map(reg.key);
    check(`PG ${reg.name}: user A, scope=all returns A's operational AND authorised UAT rows`, keysAll.includes(reg.op) && keysAll.includes(reg.uat), keysAll);
    check(`PG ${reg.name}: user A, operational keeps UAT out of the primary list`, keysOp.includes(reg.op) && !keysOp.includes(reg.uat), keysOp);
    check(`PG ${reg.name}: scope=all returns NO row belonging to organisation B`, keysAll.every((k) => k.startsWith(reg.own)), keysAll);

    const crossAtoB = await reg.list(clientA, ORG_B);
    check(`PG ${reg.name}: user A asking for organisation B (scope=all) gets nothing — RLS, not the scope flag, isolates tenants`, crossAtoB.length === 0, crossAtoB.map(reg.key));
    const crossBtoA = await reg.list(clientB, ORG_A);
    check(`PG ${reg.name}: user B asking for organisation A (scope=all) gets nothing`, crossBtoA.length === 0, crossBtoA.map(reg.key));
    const allCross = scopeRegister('all', crossAtoB, reg.partition(crossAtoB, 'all'));
    check(`PG ${reg.name}: scope=all over a cross-tenant result is still empty (the helper cannot widen access)`, allCross.primary.length === 0);
  }
} catch (e) {
  fail += 1;
  console.error(`FAIL: unexpected error — ${e?.stack || e}`);
} finally {
  await admin.end().catch(() => undefined);
  await stopEmbedded(embedded);
}

console.log(`Lab register scoping: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
