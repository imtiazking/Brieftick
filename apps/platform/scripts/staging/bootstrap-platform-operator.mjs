#!/usr/bin/env node
/**
 * Register a FORGENIQ platform operator (global ingestion/ops — not tenant role).
 * Requires migration 20261025100000_phase8_security_hardening.sql applied first.
 *
 *   STAGING_CLERK_USER_ID=user_xxx node scripts/staging/bootstrap-platform-operator.mjs --sql-only
 */
const clerkUserId = process.env.STAGING_CLERK_USER_ID?.trim();
const displayName = process.env.STAGING_PLATFORM_OPERATOR_NAME?.trim() || 'FORGENIQ platform operator';

if (!clerkUserId) {
  console.error('Set STAGING_CLERK_USER_ID to the Clerk user id for platform operations.');
  process.exit(1);
}

const sql = `
-- FORGENIQ platform operator (global ingestion/ops; separate from organisation OWNER)
insert into public.platform_operators (clerk_user_id, status, display_name)
values ('${clerkUserId.replace(/'/g, "''")}', 'active', '${displayName.replace(/'/g, "''")}')
on conflict (clerk_user_id) do update
  set status = 'active', display_name = excluded.display_name;
`;

console.log('-- Paste into Supabase SQL Editor (forgeniq-ri-staging) after phase8 security migration:\n');
console.log(sql);
