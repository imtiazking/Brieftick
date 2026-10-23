#!/usr/bin/env node
/**
 * Apply FORGENIQ platform migrations to remote Supabase (idempotent).
 *
 * Skips steps already recorded in Supabase migration history UNLESS:
 * - the recorded name is a known placeholder (legacy MCP no-op), or
 * - --force NAME is passed, or
 * - preflight shows the step is not actually applied (e.g. missing tables).
 *
 * Requires SUPABASE_ACCESS_TOKEN (create at supabase.com/dashboard/account/tokens).
 * Do not commit or paste tokens into chat.
 *
 *   SUPABASE_ACCESS_TOKEN=... npm run staging:apply-migrations
 *   SUPABASE_ACCESS_TOKEN=... npm run staging:apply-migrations -- --dry-run
 *   SUPABASE_ACCESS_TOKEN=... npm run staging:apply-migrations -- --check-only
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  LEGACY_PLACEHOLDER_NAMES,
  STAGING_MIGRATION_STEPS,
  assertManifestFilesExist,
} from './migration-manifest.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || 'lhgzdicffkhaaykzthep';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const dryRun = process.argv.includes('--dry-run');
const checkOnly = process.argv.includes('--check-only');
const forceArg = process.argv.find((a) => a.startsWith('--force='));
const forceName = forceArg ? forceArg.split('=')[1] : null;

if (!token && !checkOnly) {
  console.error('Set SUPABASE_ACCESS_TOKEN (or use --check-only with DATABASE_URL checks only).');
  process.exit(1);
}

const ensureSplit = join(__dir, 'ensure-lifecycle-split.mjs');
spawnSync(process.execPath, [ensureSplit], { stdio: 'inherit' });

assertManifestFilesExist();

async function listRemoteMigrations() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/migrations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`list migrations failed: ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return new Set((rows ?? []).map((r) => r.name));
}

async function runQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  return body;
}

/** Lightweight preflight: returns true if step appears already applied in DB. */
const PREFLIGHT = {
  '20260322140000_platform_identity': `select exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='organisations'
  ) as ok`,
  '20260322150000_ri_reference': `select exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='regulators'
  ) as ok`,
  '20260322150100_ri_lifecycle_core': `select exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='regulatory_changes'
  ) as ok`,
  '20260322150100_ri_lifecycle_rest': `select exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='workflow_events'
  ) as ok`,
  '20260322150200_ri_rls': `select exists (
    select 1 from pg_policies where schemaname='public' and tablename='regulatory_changes'
  ) as ok`,
  '20260323160000_ri_ingestion': `select exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='ingestion_runs'
  ) as ok`,
  '20260324170000_ri_ingestion_operations': `select exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='operational_alerts'
  ) as ok`,
  '20260325120000_ri_ai': `select exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='ai_analysis_runs'
  ) as ok`,
  '20260325130000_ri_ai_lineage': `select exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='ai_claim_materialisations'
  ) as ok`,
  '20260325140000_ri_ask_ri': `select exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='ask_ri_query_log'
  ) as ok`,
};

async function preflightOk(name) {
  const sql = PREFLIGHT[name];
  if (!sql) return false;
  const raw = await runQuery(sql);
  try {
    const parsed = JSON.parse(raw);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    return Boolean(row?.ok);
  } catch {
    return raw.includes('true');
  }
}

async function main() {
  const remote = token ? await listRemoteMigrations() : new Set();
  let applied = 0;
  let skipped = 0;

  for (const step of STAGING_MIGRATION_STEPS) {
    const inHistory = remote.has(step.name);
    const legacyPlaceholder = [...LEGACY_PLACEHOLDER_NAMES].some((n) => remote.has(n));
    let skip = false;
    let reason = '';

    if (forceName && forceName !== step.name) {
      skip = true;
      reason = 'force other step';
    } else if (forceName === step.name) {
      skip = false;
      reason = 'forced';
    } else if (inHistory && !LEGACY_PLACEHOLDER_NAMES.has(step.name)) {
      if (token) {
        const ok = await preflightOk(step.name);
        if (ok) {
          skip = true;
          reason = 'history + preflight ok';
        } else {
          reason = 'history but preflight failed — re-applying';
        }
      } else {
        skip = true;
        reason = 'in migration history';
      }
    } else if (
      step.name.startsWith('20260322150100_ri_lifecycle') &&
      legacyPlaceholder &&
      !inHistory
    ) {
      reason = 'legacy placeholder detected — applying real lifecycle DDL';
    }

    if (skip) {
      console.log(`SKIP ${step.name} (${reason})`);
      skipped += 1;
      continue;
    }

    const query = readFileSync(step.path, 'utf8');
    if (dryRun || checkOnly) {
      console.log(`WOULD APPLY ${step.name} (${query.length} bytes)`);
      continue;
    }

    console.log(`APPLY ${step.name}...`);
    await runQuery(query);
    console.log(`OK ${step.name}`);
    applied += 1;
  }

  if (checkOnly) {
    console.log('\nCheck-only complete. No changes made.');
    return;
  }
  console.log(`\nDone. applied=${applied} skipped=${skipped}${dryRun ? ' (dry-run)' : ''}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
