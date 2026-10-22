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
const localDbDir = join(platformRoot, '.local-pg-verify');

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

export async function resetAndStartEmbedded({ port = 54328 } = {}) {
  if (existsSync(localDbDir)) {
    rmSync(localDbDir, { recursive: true, force: true });
  }
  const password = randomBytes(12).toString('hex');
  const embedded = new EmbeddedPostgres({
    databaseDir: localDbDir,
    port,
    user: 'postgres',
    password,
    persistent: false,
  });
  await embedded.initialise();
  await embedded.start();
  const adminUrl = `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`;
  return { embedded, adminUrl, port, password };
}

export async function stopEmbedded(embedded) {
  if (embedded) await embedded.stop();
  if (existsSync(localDbDir)) {
    rmSync(localDbDir, { recursive: true, force: true });
  }
}

export async function applySqlFile(client, path) {
  const sql = readFileSync(path, 'utf8');
  await client.query(sql);
}

export async function applyAllMigrations(adminClient) {
  await applySqlFile(adminClient, join(__dir, 'auth-jwt-shim.sql'));
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
          organisation_id, regulatory_change_id, publication_id, obligation_statement, status, external_key
        ) values ($1, $2, $3, $4, 'OPEN', $5) returning id`,
        [
          orgId,
          changeId,
          publicationId,
          `TEST DATA — Obligation ${suffix}`,
          `TEST-OBL-${suffix}`,
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
