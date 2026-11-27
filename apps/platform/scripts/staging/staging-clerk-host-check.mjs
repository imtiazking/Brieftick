#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeClerkOnHost } from '../uat/uat-session-registry.mjs';
import { CANDIDATE_STAGING_ORIGIN, OFFICIAL_STAGING_ORIGIN, AUTHORIZED_AUTH_HOSTS } from './staging-release-hosts.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

if (process.argv.includes('--contract-only')) {
  if (!AUTHORIZED_AUTH_HOSTS.has('staging-app.forgeniq.com') || !AUTHORIZED_AUTH_HOSTS.has('candidate-staging.forgeniq.com')) {
    console.error('AUTHORIZED_AUTH_HOSTS missing staging or candidate hostname');
    process.exit(1);
  }
  const middleware = readFileSync(join(platformRoot, 'middleware.ts'), 'utf8');
  if (!/clerkMiddleware|@clerk\/nextjs\/server/.test(middleware)) {
    console.error('middleware.ts missing Clerk middleware hook');
    process.exit(1);
  }
  const example = readFileSync(join(platformRoot, '.env.example'), 'utf8');
  if (!/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/.test(example)) {
    console.error('.env.example missing Clerk publishable key placeholder');
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, mode: 'contract-only', hosts: [...AUTHORIZED_AUTH_HOSTS] }));
  process.exit(0);
}

const targets = [OFFICIAL_STAGING_ORIGIN, CANDIDATE_STAGING_ORIGIN];
let failed = false;
for (const origin of targets) {
  const probe = await probeClerkOnHost(origin);
  console.log(JSON.stringify({ origin, ...probe }));
  if (!probe.ok) {
    failed = true;
    if (probe.code === 'CLERK_NOT_CONFIGURED') {
      console.error(
        `${origin}: CLERK_NOT_CONFIGURED — preview deployments without Production env will show this. Point candidate at a production build or add Clerk env to Preview.`,
      );
    }
  }
}
// Brief drain avoids Windows Node UV_HANDLE_CLOSING on immediate process.exit after fetch.
await new Promise((resolve) => setTimeout(resolve, 100));
process.exit(failed ? 2 : 0);