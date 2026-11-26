#!/usr/bin/env node
/**
 * Operator tool for the shared Anthropic lab spend ledger.
 *
 *   node scripts/staging/lab-spend-ledger.mjs status [--scope forgeniq-lab-anthropic]
 *   node scripts/staging/lab-spend-ledger.mjs register-operator --actor <name> --authorised-by <name>
 *   node scripts/staging/lab-spend-ledger.mjs recover --reservation <uuid> --actor <name> --reason "<>=20 chars>"
 *        [--resolution ASSUME_MAX|VERIFIED_USAGE] [--actual-usd 0.0123 --evidence "<>=20 chars>"]
 *        [--input N --output N --cache-write N --cache-read N] [--min-age 180] --yes
 *
 * Connection: RI_LAB_SPEND_DATABASE_URL (or SUPABASE_DB_URL / POSTGRES_URL / DATABASE_URL). The URL is never printed.
 * `recover` makes no provider call and never retries one. Without --yes it only shows what would be recovered.
 * ASSUME_MAX keeps the whole reserve as spent (use when you cannot prove the provider did not bill the call).
 * VERIFIED_USAGE needs the observed cost and written evidence (for example the Anthropic Console usage record).
 * The database enforces: registered operator, provider deadline passed, minimum age, single recovery per reservation.
 */
import pg from 'pg';

const args = process.argv.slice(2);
const command = args[0];
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const num = (v) => (v == null ? null : Number(v));

const url =
  process.env.RI_LAB_SPEND_DATABASE_URL?.trim() ||
  process.env.SUPABASE_DB_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('No database URL set (RI_LAB_SPEND_DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL or DATABASE_URL).');
  process.exit(2);
}
if (!['status', 'register-operator', 'recover'].includes(command)) {
  console.error('Usage: status | register-operator | recover (see the header of this file).');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (command === 'status') {
    const scope = flag('scope', 'forgeniq-lab-anthropic');
    const account = (await client.query('select * from public.lab_ai_spend_accounts where scope_key = $1', [scope])).rows[0] ?? null;
    const open = (
      await client.query(
        `select id, use_case_id, model, reserve_usd, created_at, provider_deadline_at,
                floor(extract(epoch from (now() - created_at)))::int as age_seconds,
                (provider_deadline_at is null or now() >= provider_deadline_at) as provider_window_ended
           from public.lab_ai_spend_reservations
          where scope_key = $1 and status = 'RESERVED' order by created_at`,
        [scope],
      )
    ).rows;
    console.log(JSON.stringify({ scope, account, openReservations: open }, null, 2));
  } else if (command === 'register-operator') {
    const actor = flag('actor');
    const by = flag('authorised-by');
    if (!actor || !by) throw new Error('--actor and --authorised-by are required');
    await client.query(
      `insert into public.lab_ai_spend_operators (actor, authorised_by) values ($1, $2)
       on conflict (actor) do update set revoked_at = null, authorised_by = excluded.authorised_by, authorised_at = now()`,
      [actor, by],
    );
    console.log(JSON.stringify({ ok: true, actor, authorisedBy: by }));
  } else {
    const reservation = flag('reservation');
    const actor = flag('actor');
    const reason = flag('reason');
    if (!reservation || !actor || !reason) throw new Error('--reservation, --actor and --reason are required');
    const row = (
      await client.query(
        `select id, scope_key, status, reserve_usd, created_at, provider_deadline_at, model from public.lab_ai_spend_reservations where id = $1`,
        [reservation],
      )
    ).rows[0];
    if (!has('yes')) {
      console.log(JSON.stringify({ dryRun: true, reservation: row ?? null, note: 'Re-run with --yes to recover.' }, null, 2));
    } else {
      const { rows } = await client.query(
        `select public.release_abandoned_lab_ai_reservation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
        [
          reservation,
          actor,
          reason,
          num(flag('min-age', '180')),
          flag('resolution', 'ASSUME_MAX'),
          num(flag('actual-usd')),
          flag('evidence'),
          num(flag('input')),
          num(flag('output')),
          num(flag('cache-write')),
          num(flag('cache-read')),
        ],
      );
      console.log(JSON.stringify(rows[0].result, null, 2));
      if (!rows[0].result?.ok) process.exitCode = 1;
    }
  }
} finally {
  await client.end();
}
