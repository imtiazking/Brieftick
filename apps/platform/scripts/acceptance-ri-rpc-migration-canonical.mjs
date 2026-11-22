#!/usr/bin/env node
/**
 * Verify ri_submit_ai_finding_review matches canonical cross-page migration after full local apply.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { applyAllMigrations, platformRoot, resetAndStartEmbedded, stopEmbedded } from './local-db/harness.mjs';

const canonicalPath = join(platformRoot, 'supabase', 'migrations', '20261122163000_ri_cross_page_provision_citation.sql');
const canonical = readFileSync(canonicalPath, 'utf8');

const mustHave = ['v_provision_section', 'provision_not_set_out_in_section', 'coalesce(v_item.obligation_statement, v_item.claim_text)'];
const mustNotHave = ['migration_apply_incomplete', "raise exception 'migration_apply_incomplete'"];

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name}`);
  }
};

for (const s of mustHave) check(`canonical migration contains ${s}`, canonical.includes(s));
for (const s of mustNotHave) check(`canonical migration excludes placeholder ${s}`, !canonical.includes(s));

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54362 });
const db = new pg.Client({ connectionString: adminUrl });
await db.connect();
try {
  await db.query(`do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;`);
  await db.query(`do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;`);
  await applyAllMigrations(db);
  const row = (
    await db.query(
      `select pg_get_functiondef('public.ri_submit_ai_finding_review(uuid,uuid,jsonb,text)'::regprocedure) as def`,
    )
  ).rows[0]?.def;
  check('function exists after full migrations', Boolean(row));
  for (const s of mustHave) check(`live function contains ${s}`, String(row).includes(s));
  for (const s of mustNotHave) check(`live function excludes placeholder ${s}`, !String(row).includes(s));
  check('anon cannot execute', !(await db.query(`select has_function_privilege('anon', 'public.ri_submit_ai_finding_review(uuid,uuid,jsonb,text)', 'execute')`)).rows[0].has_function_privilege);
  check('authenticated can execute', (await db.query(`select has_function_privilege('authenticated', 'public.ri_submit_ai_finding_review(uuid,uuid,jsonb,text)', 'execute')`)).rows[0].has_function_privilege);
} finally {
  await db.end();
  try {
    await stopEmbedded(embedded);
  } catch (err) {
    console.log(`WARN: embedded teardown: ${err?.message || err}`);
  }
}

console.log(`\nacceptance-ri-rpc-migration-canonical: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);