#!/usr/bin/env node
import { probeClerkOnHost } from '../uat/uat-session-registry.mjs';
import { CANDIDATE_STAGING_ORIGIN, OFFICIAL_STAGING_ORIGIN } from './staging-release-hosts.mjs';

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
process.exit(failed ? 2 : 0);