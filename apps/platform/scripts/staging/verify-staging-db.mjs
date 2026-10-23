#!/usr/bin/env node
/**
 * Verify staging DB schema + reference catalogue counts (Management API).
 * SUPABASE_ACCESS_TOKEN required. No secrets printed.
 */
import { STAGING_MIGRATION_STEPS } from './migration-manifest.mjs';

const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || 'lhgzdicffkhaaykzthep';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(body);
  return JSON.parse(body);
}

const checks = [
  ['regulators', `select count(*)::int as n from public.regulators`],
  ['sources', `select count(*)::int as n from public.regulatory_sources`],
  ['regulatory_changes table', `select exists (select 1 from information_schema.tables where table_name='regulatory_changes') as ok`],
  ['ask_ri_query_log', `select exists (select 1 from information_schema.tables where table_name='ask_ri_query_log') as ok`],
  ['RLS on regulatory_changes', `select relrowsecurity as rls from pg_class where relname='regulatory_changes'`],
  ['RLS on regulators', `select relrowsecurity as rls from pg_class where relname='regulators'`],
];

let fail = 0;
for (const [label, sql] of checks) {
  try {
    const rows = await q(sql);
    const row = rows[0];
    const val = row?.n ?? row?.ok ?? row?.rls;
    const pass =
      label.startsWith('regulators') || label.startsWith('sources')
        ? val >= 30
        : label.includes('RLS')
          ? val === true
          : val === true || val > 0;
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${label} → ${JSON.stringify(row)}`);
    if (!pass) fail += 1;
  } catch (e) {
    console.log(`FAIL: ${label} → ${e.message}`);
    fail += 1;
  }
}

console.log(`\nMigration manifest steps: ${STAGING_MIGRATION_STEPS.length}`);
process.exit(fail ? 1 : 0);
