#!/usr/bin/env node
/**
 * Deterministic tenant-isolation acceptance (offline SQL + pure logic).
 * TEST FIXTURES — not live authenticated data.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');
const repoRoot = join(platformRoot, '..', '..');

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  fail += 1;
  console.error(`FAIL: ${msg}`);
}

const migrationPath = join(
  platformRoot,
  'supabase',
  'migrations',
  '20260322140000_platform_identity.sql',
);
if (!existsSync(migrationPath)) failMsg('identity migration missing');
else pass('identity migration present');

const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

for (const table of ['organisations', 'organisation_memberships']) {
  if (!sql.includes(`create table public.${table}`)) failMsg(`table ${table} missing`);
  else pass(`table ${table} defined`);
  if (!sql.includes(`alter table public.${table} enable row level security`)) {
    failMsg(`RLS not enabled on ${table}`);
  } else pass(`RLS enabled on ${table}`);
}

if (sql.match(/using\s*\(\s*true\s*\)/i)) failMsg('permissive USING (true) policy found');
else pass('no USING (true) policies');

if (!sql.includes('platform_role')) failMsg('platform_role enum missing');
else pass('platform_role enum');

for (const role of ['OWNER', 'ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST', 'REVIEWER', 'VIEWER']) {
  if (!sql.includes(`'${role}'`)) failMsg(`role ${role} missing in migration`);
  else pass(`role ${role} in schema`);
}

if (!sql.includes('organisation_memberships_org_user_unique')) {
  failMsg('duplicate membership constraint missing');
} else pass('unique organisation membership constraint');

if (!sql.includes('gen_random_uuid()')) failMsg('UUID primary keys expected');
else pass('UUID defaults present');

if (sql.toLowerCase().includes('supabase_auth') || sql.includes('auth.users')) {
  failMsg('Supabase Auth tables referenced');
} else pass('no Supabase Auth schema');

const rolesTs = readFileSync(join(platformRoot, 'lib', 'roles.ts'), 'utf8');
if (rolesTs.includes('SUPABASE_SERVICE_ROLE')) failMsg('service role in roles.ts');
else pass('roles contract clean');

const clientTs = readFileSync(join(platformRoot, 'lib', 'supabase', 'client.ts'), 'utf8');
if (clientTs.includes('SERVICE_ROLE') || clientTs.includes('admin')) {
  failMsg('client references service role');
} else pass('browser client has no service role');

const adminTs = readFileSync(join(platformRoot, 'lib', 'supabase', 'admin.ts'), 'utf8');
if (!adminTs.includes("import 'server-only'")) failMsg('admin client not server-only');
else pass('admin client server-only');

// Pure logic fixtures (ORG-A / ORG-B)
const tenantAccess = await import('../lib/auth/tenant-access.fixture.mjs');

{
  const {
    userCanAccessOrganisation,
    resolveActiveOrganisation,
    effectiveRole,
    mayHoldOwnerRole,
    validateRoleAssignment,
    parseClientRoleClaim,
  } = tenantAccess;

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

  if (userCanAccessOrganisation(memberships, 'user_a', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')) {
    failMsg('ORG-A user must not access ORG-B');
  } else pass('ORG-A cannot access ORG-B');

  const spoof = resolveActiveOrganisation(
    memberships,
    'user_a',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  );
  if (spoof.organisationId) failMsg('browser org id without membership must be rejected');
  else pass('invalid organisation id rejected');

  if (effectiveRole('VIEWER', 'OWNER') !== 'VIEWER') failMsg('browser role must be ignored');
  else pass('browser-supplied role ignored');

  if (mayHoldOwnerRole('ADMIN', 'OWNER')) failMsg('ADMIN cannot become OWNER');
  else pass('ADMIN cannot become OWNER');

  if (validateRoleAssignment('ADMIN', 'OWNER')) failMsg('ADMIN cannot assign OWNER');
  else pass('ADMIN cannot assign OWNER role');

  if (validateRoleAssignment('VIEWER', 'ADMIN')) failMsg('VIEWER cannot perform ADMIN assignment');
  else pass('VIEWER cannot perform privileged ADMIN actions');

  if (parseClientRoleClaim('SUPERADMIN') !== null) failMsg('unknown role claim rejected');
  else pass('unknown client role rejected');

  const unknown = resolveActiveOrganisation([], 'unknown_user', null);
  if (unknown.organisationId) failMsg('unknown clerk user has no tenant access');
  else pass('unknown user has no tenant access');
}

const sessionTs = readFileSync(join(platformRoot, 'lib', 'auth', 'session.ts'), 'utf8');
if (sessionTs.includes('supabase.auth')) failMsg('session must not use Supabase Auth');
else pass('Clerk-only session helpers');

const serverTs = readFileSync(join(platformRoot, 'lib', 'supabase', 'server.ts'), 'utf8');
if (serverTs.includes('SERVICE_ROLE') || serverTs.includes('createSupabaseAdminClient')) {
  failMsg('user server client must not use service role');
} else pass('user Supabase path avoids service role');

const riPage = readFileSync(join(platformRoot, 'app', 'ri', 'page.tsx'), 'utf8');
if (/design-lab|ask-ri/i.test(riPage)) failMsg('RI page must not import Design Lab / Ask RI');
else pass('/ri avoids Design Lab / Ask RI imports');

const migrationsDir = join(platformRoot, 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
if (migrationFiles.length < 1) failMsg('no migrations');
else pass(`${migrationFiles.length} migration file(s)`);

const refDataPath = join(repoRoot, 'packages', 'reference-data', 'catalogue', 'regulatory-sources.mjs');
if (!existsSync(refDataPath)) failMsg('regulatory source catalogue missing');
else pass('regulatory-source baseline present');

if (fail) {
  console.error(`\nPhase 2 tenant isolation acceptance: FAIL (${fail})`);
  process.exit(1);
}
console.log('\nPhase 2 tenant isolation acceptance: PASS');
