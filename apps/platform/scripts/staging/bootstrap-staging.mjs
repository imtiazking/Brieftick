#!/usr/bin/env node
/**
 * Staging bootstrap: migrations (if local), reference catalogue, FORGENIQ org + OWNER membership.
 *
 * Usage (remote Supabase — set DATABASE_URL or use Supabase SQL editor with generated SQL):
 *   STAGING_CLERK_USER_ID=user_xxx node scripts/staging/bootstrap-staging.mjs --sql-only
 *
 * Usage (direct Postgres — service role connection string):
 *   DATABASE_URL=postgresql://... STAGING_CLERK_USER_ID=user_xxx node scripts/staging/bootstrap-staging.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..', '..');
const migrationsDir = join(platformRoot, 'supabase', 'migrations');

const clerkUserId = process.env.STAGING_CLERK_USER_ID?.trim();
const sqlOnly = process.argv.includes('--sql-only');
const orgName = process.env.STAGING_ORG_NAME?.trim() || 'FORGENIQ';
const orgSlug = process.env.STAGING_ORG_SLUG?.trim() || 'forgeniq';

function ownerBootstrapSql() {
  if (!clerkUserId) {
    throw new Error('Set STAGING_CLERK_USER_ID to your Clerk user id (from dashboard after first sign-in).');
  }
  return `
-- FORGENIQ staging OWNER bootstrap (run once per environment; SQL Editor / service role — not via Clerk JWT after phase8 security migration)
insert into public.organisations (name, slug, status)
values ('${orgName.replace(/'/g, "''")}', '${orgSlug.replace(/'/g, "''")}', 'active')
on conflict (slug) do update set name = excluded.name
returning id;

-- If slug unique conflict handling differs, use fixed org id in follow-up:
with org as (
  select id from public.organisations where slug = '${orgSlug.replace(/'/g, "''")}' limit 1
)
insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status)
select org.id, '${clerkUserId.replace(/'/g, "''")}', 'OWNER'::public.platform_role, 'active'
from org
on conflict (organisation_id, clerk_user_id) do update
  set role = 'OWNER'::public.platform_role, status = 'active';
`;
}

async function applyMigrations(client) {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}...`);
    await client.query(sql);
  }
}

async function main() {
  const bootstrap = ownerBootstrapSql();

  if (sqlOnly) {
    console.log('-- Paste into Supabase SQL editor after migrations + reference seed:\n');
    console.log(bootstrap);
    return;
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('Set DATABASE_URL (Postgres connection string) or use --sql-only');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await applyMigrations(client);
    const refScript = join(platformRoot, 'scripts', 'sync-reference-catalogue.mjs');
    console.log('Migrations applied. Run reference catalogue sync separately if not embedded.');
    await client.query(bootstrap);
    console.log('OWNER membership bootstrap complete.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
