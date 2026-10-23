#!/usr/bin/env node
/**
 * Bootstrap FORGENIQ org + OWNER for a dedicated RI staging Clerk user only.
 *
 * Do NOT use MI test accounts (imtiazahmed_@hotmail.com, imtiazahmed77@icloud.com).
 * Create a separate Clerk user (new email) for RI staging, sign in once, then pass its user id.
 *
 *   STAGING_CLERK_USER_ID=user_xxx node scripts/staging/bootstrap-ri-owner.mjs --sql-only
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const blockedEmails = ['imtiazahmed_@hotmail.com', 'imtiazahmed77@icloud.com'];
const blockedNote = process.env.STAGING_RI_OWNER_EMAIL?.trim().toLowerCase();

if (blockedNote && blockedEmails.includes(blockedNote)) {
  console.error(
    'Refusing bootstrap: STAGING_RI_OWNER_EMAIL is a protected MI test account. Use a separate RI staging user.',
  );
  process.exit(1);
}

const child = spawnSync(
  process.execPath,
  [join(__dir, 'bootstrap-staging.mjs'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env },
);
process.exit(child.status ?? 1);
