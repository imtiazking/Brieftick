#!/usr/bin/env node
/**
 * Embedded PostgreSQL harness (no Docker). Simulates Clerk JWT via auth-jwt-shim.sql.
 * FORGENIQ LOCAL TEST — not production Supabase.
 */
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
export const platformRoot = join(__dir, '..', '..');
const migrationsDir = join(platformRoot, 'supabase', 'migrations');
function localDbDirForPort(port) {
  return join(platformRoot, '.local-pg-verify', `p${port}`);
}

export const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const USER_A = 'clerk_user_a_test';
export const USER_B = 'clerk_user_b_test';

const APP_ROLE = 'forgeniq_app';

export function environmentReport() {
  return {
    supabaseCli: 'npx supabase@2.121.0 (Docker not available — embedded Postgres used)',
    postgresql: pgVersionLabel(),
    docker: 'not installed',
    localUrl: '127.0.0.1 (ephemeral port per run)',
  };
}

export function pgVersionLabel() {
  return 'PostgreSQL 18.x (embedded-postgres Windows bundle)';
}

export async function resetAndStartEmbedded({ port: preferredPort } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const port =
      preferredPort != null && attempt === 0
        ? preferredPort
        : 54000 + Math.floor(Math.random() * 9000);
    const localDbDir = localDbDirForPort(port);
    if (existsSync(localDbDir)) {
      try {
        rmSync(localDbDir, { recursive: true, force: true });
      } catch {
        /* EBUSY — try another port */
        continue;
      }
    }
    const password = randomBytes(12).toString('hex');
    const embedded = new EmbeddedPostgres({
      databaseDir: localDbDir,
      port,
      user: 'postgres',
      password,
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
    });
    try {
      await embedded.initialise();
      await embedded.start();
      embedded.forgeniqPort = port;
      const adminUrl = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`;
      return { embedded, adminUrl, port, password };
    } catch (e) {
      lastError = e;
      try {
        await embedded.stop();
      } catch {
        /* ignore */
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (!/shared memory block is still in use|EBUSY|address already in use/i.test(msg)) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error('embedded_postgres_start_failed');
}

export async function stopEmbedded(embedded, { port } = {}) {
  if (embedded) {
    try {
      await embedded.stop();
    } catch {
      /* Windows may leave postmaster briefly alive */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const resolvedPort = port ?? embedded?.forgeniqPort;
  const localDbDir =
    resolvedPort != null ? localDbDirForPort(resolvedPort) : join(platformRoot, '.local-pg-verify');
  if (!existsSync(localDbDir)) return;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(localDbDir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (e?.code !== 'EBUSY' && e?.code !== 'EPERM') throw e;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  rmSync(localDbDir, { recursive: true, force: true });
}

export async function applySqlFile(client, path) {
  const sql = readFileSync(path, 'utf8');
  await client.query(sql);
}

async function ensureSupabaseApiRoles(adminClient) {
  await adminClient.query(`
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  `);
}

export async function applyAllMigrations(adminClient) {
  await applySqlFile(adminClient, join(__dir, 'auth-jwt-shim.sql'));
  await ensureSupabaseApiRoles(adminClient);
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await applySqlFile(adminClient, join(migrationsDir, file));
  }
}

export async function ensureAppRole(adminClient) {
  await adminClient.query(`drop role if exists ${APP_ROLE}`);
  await adminClient.query(`create role ${APP_ROLE} nologin`);
  await adminClient.query(`grant usage on schema public to ${APP_ROLE}`);
  await adminClient.query(`grant usage on schema auth to ${APP_ROLE}`);
  await adminClient.query(
    `grant select, insert, update, delete on all tables in schema public to ${APP_ROLE}`,
  );
  await adminClient.query(
    `grant usage, select on all sequences in schema public to ${APP_ROLE}`,
  );
  await adminClient.query(
    `alter default privileges in schema public grant select, insert, update, delete on tables to ${APP_ROLE}`,
  );
  await adminClient.query(`grant ${APP_ROLE} to postgres`);
  for (const fn of ['public.is_platform_operator()', 'public.has_any_active_membership()']) {
    await adminClient.query(`grant execute on function ${fn} to ${APP_ROLE}`).catch(() => {});
  }
  await adminClient.query(`grant select on table public.platform_operators to ${APP_ROLE}`).catch(() => {});
}

/** Session that enforces RLS (non-superuser) with simulated Clerk sub claim. */
export async function withRlsSession(adminUrl, clerkSub, fn) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${APP_ROLE}`);
    await client.query(`select set_config('app.test_jwt', $1, true)`, [
      JSON.stringify({ sub: clerkSub }),
    ]);
    const result = await fn(client);
    await client.query('rollback');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

/** Committing RLS session for fixture inserts that must persist. */
export async function withRlsSessionCommit(adminUrl, clerkSub, fn) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${APP_ROLE}`);
    await client.query(`select set_config('app.test_jwt', $1, true)`, [
      JSON.stringify({ sub: clerkSub }),
    ]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

export async function applyReferenceSeed(adminClient) {
  const seedPath = join(platformRoot, 'supabase', 'seed', 'reference-catalogue.generated.sql');
  if (!existsSync(seedPath)) {
    throw new Error(
      'reference-catalogue.generated.sql missing — run npm run sync:reference-catalogue',
    );
  }
  await applySqlFile(adminClient, seedPath);
}

export async function insertTestPublication(adminClient) {
  const { rows: reg } = await adminClient.query(
    `select id from public.regulators where external_key = 'REG-FCA' limit 1`,
  );
  const { rows: src } = await adminClient.query(
    `select id from public.regulatory_sources where external_key = 'SRC-FCA-PUBLICATIONS-RSS' limit 1`,
  );
  if (!reg[0] || !src[0]) throw new Error('seed regulators/sources missing for TEST publication');
  const pubRes = await adminClient.query(
    `insert into public.regulatory_publications (
      source_id, regulator_id, title, publication_type, canonical_url, data_origin, provenance
    ) values ($1, $2, 'TEST DATA — Phase 3a fixture publication', 'TEST', 'https://example.test/pub', 'test_fixture', '{"test":true}'::jsonb)
    returning id`,
    [src[0].id, reg[0].id],
  );
  return pubRes.rows[0].id;
}

/** Minimum metadata a manually created obligation needs (20261121180000): code, legal basis, verified provision. */
export const TEST_MANUAL_OBLIGATION_METADATA = Object.freeze({
  regulatoryClassificationCode: 'R',
  legalBasis: 'TEST DATA — FCA Handbook rule',
  authoritativeProvision: {
    reference: 'TEST DATA — FCA Handbook PRIN 2A.1.1R',
    sourceUrl: 'https://www.handbook.fca.org.uk/handbook/PRIN/2A/1.html',
    quotation: 'TEST DATA — rule text as verified on the FCA Handbook.',
  },
});

export const TEST_OBLIGATION_CHECKER = 'user_test_obligation_checker';

/** Independent approval (IN_REVIEW → OPEN) of submitted manual obligations by a separate checker member. */
export async function approveTestObligations(adminUrl, organisationId, obligationIds) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(
      `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
       values ($1, $2, 'COMPLIANCE_MANAGER'::public.platform_role, 'active')
       on conflict (organisation_id, clerk_user_id) do nothing`,
      [organisationId, TEST_OBLIGATION_CHECKER],
    );
  } finally {
    await admin.end();
  }
  await withRlsSessionCommit(adminUrl, TEST_OBLIGATION_CHECKER, (c) =>
    c.query(`update public.regulatory_obligations set status = 'OPEN' where id = any($1::uuid[])`, [obligationIds]),
  );
}

/** Maker creates and submits a classified manual obligation in the caller's transaction; returns its id. */
export async function insertSubmittedTestObligation(client, { organisationId, changeId = null, publicationId, statement, externalKey = null }) {
  const { rows } = await client.query(
    `insert into public.regulatory_obligations (
      organisation_id, regulatory_change_id, publication_id, obligation_statement, status, external_key, metadata
    ) values ($1, $2, $3, $4, 'DRAFT', $5, $6::jsonb) returning id`,
    [organisationId, changeId, publicationId, statement, externalKey, JSON.stringify(TEST_MANUAL_OBLIGATION_METADATA)],
  );
  await client.query(`update public.regulatory_obligations set status = 'IN_REVIEW' where id = $1`, [rows[0].id]);
  return rows[0].id;
}

export async function seedTenantFixtures(adminUrl, publicationId) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(
      `insert into public.organisations (id, name, slug) values
        ($1, 'TEST DATA ORG-A', 'test-org-a'),
        ($2, 'TEST DATA ORG-B', 'test-org-b')
       on conflict (id) do nothing`,
      [ORG_A, ORG_B],
    );
    for (const [orgId, clerkId] of [[ORG_A, USER_A], [ORG_B, USER_B]]) {
      await admin.query(
        `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
         values ($1, $2, 'OWNER'::public.platform_role, 'active')
         on conflict (organisation_id, clerk_user_id) do nothing`,
        [orgId, clerkId],
      );
    }
  } finally {
    await admin.end();
  }

  const insertLifecycle = async (clerkSub, orgId, suffix) => {
    return withRlsSessionCommit(adminUrl, clerkSub, async (client) => {
      const chg = await client.query(
        `insert into public.regulatory_changes (
          organisation_id, publication_id, title, change_type, status, external_key
        ) values ($1, $2, $3, 'TEST', 'OPEN', $4) returning id`,
        [orgId, publicationId, `TEST DATA — Change ${suffix}`, `TEST-CHG-${suffix}`],
      );
      const changeId = chg.rows[0].id;
      const ctrl = await client.query(
        `insert into public.controls (organisation_id, name, external_key, status)
         values ($1, $2, $3, 'ACTIVE') returning id`,
        [orgId, `TEST Control ${suffix}`, `TEST-CTRL-${suffix}`],
      );
      const controlId = ctrl.rows[0].id;
      const obl = await client.query(
        `insert into public.regulatory_obligations (
          organisation_id, regulatory_change_id, publication_id, obligation_statement, status, external_key, metadata
        ) values ($1, $2, $3, $4, 'DRAFT', $5, $6::jsonb) returning id`,
        [
          orgId,
          changeId,
          publicationId,
          `TEST DATA — Obligation ${suffix}`,
          `TEST-OBL-${suffix}`,
          JSON.stringify(TEST_MANUAL_OBLIGATION_METADATA),
        ],
      );
      const obligationId = obl.rows[0].id;
      const ev = await client.query(
        `insert into public.evidence_items (organisation_id, title, evidence_type, external_key)
         values ($1, $2, 'TEST', $3) returning id`,
        [orgId, `TEST Evidence ${suffix}`, `TEST-EVD-${suffix}`],
      );
      const evidenceId = ev.rows[0].id;
      await client.query(
        `insert into public.evidence_obligation_links (organisation_id, evidence_id, obligation_id)
         values ($1, $2, $3)`,
        [orgId, evidenceId, obligationId],
      );
      await client.query(
        `insert into public.obligation_control_links (organisation_id, obligation_id, control_id)
         values ($1, $2, $3)`,
        [orgId, obligationId, controlId],
      );
      return { changeId, controlId, obligationId, evidenceId };
    });
  };

  const fixtureA = await insertLifecycle(USER_A, ORG_A, 'A');
  const fixtureB = await insertLifecycle(USER_B, ORG_B, 'B');
  return { fixtureA, fixtureB };
}
