#!/usr/bin/env node
/**
 * Operator tool for the run-reference-scoped AI execution ledger. Service-role / database credentials come from the
 * environment (SUPABASE_DB_URL, or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY); nothing is printed.
 *
 *   node scripts/staging/ai-run-admin.mjs authorise --run <ref> --org <organisation-id> --budget <usd> --requests <n>
 *        --hours <h> --by <authoriser> [--purpose <text>]
 *   node scripts/staging/ai-run-admin.mjs status --run <ref>
 *   node scripts/staging/ai-run-admin.mjs close  --run <ref> --by <authoriser> --reason <text> [--revoke]
 *
 * Authorising a run does not enable paid AI. Execution additionally needs RI_AI_EXECUTION_ENABLED=true, provider
 * stages set, and the run reference configured. Authorise only against an explicit written authorisation that names
 * the reference, tenant, budget and request limit. A reference can never be re-authorised or have its limits raised.
 */
const args = process.argv.slice(2);
const mode = args[0];
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function rpc(fn, params) {
  const pgUrl = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (pgUrl) {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: pgUrl });
    await client.connect();
    try {
      const keys = Object.keys(params);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await client.query(`select public.${fn}(${placeholders}) as r`, keys.map((k) => params[k]));
      return rows[0].r;
    } finally {
      await client.end();
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('No database credentials in the environment.');
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc(fn, params);
  if (error) throw new Error(error.message);
  return data;
}

async function readRun(ref) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('status needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.from('ai_execution_runs').select('*').eq('run_reference', ref).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

try {
  if (mode === 'authorise') {
    const hours = Number(opt('hours'));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 72) throw new Error('--hours must be between 0 and 72.');
    const now = Date.now();
    const result = await rpc('authorise_ai_execution_run', {
      p_run_reference: opt('run'),
      p_organisation_id: opt('org'),
      p_budget_usd: Number(opt('budget')),
      p_max_requests: Number(opt('requests')),
      p_starts_at: new Date(now).toISOString(),
      p_expires_at: new Date(now + hours * 3_600_000).toISOString(),
      p_authorised_by: opt('by'),
      p_purpose: opt('purpose') || null,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result?.ok ? 0 : 1);
  } else if (mode === 'status') {
    console.log(JSON.stringify(await readRun(opt('run')), null, 2));
  } else if (mode === 'close') {
    const result = await rpc('terminate_ai_execution_run', {
      p_run_reference: opt('run'),
      p_actor: opt('by'),
      p_reason: opt('reason'),
      p_status: args.includes('--revoke') ? 'REVOKED' : 'CLOSED',
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result?.ok ? 0 : 1);
  } else {
    console.error('usage: ai-run-admin.mjs authorise|status|close ...');
    process.exit(2);
  }
} catch (err) {
  console.error(err?.message || String(err));
  process.exit(1);
}
