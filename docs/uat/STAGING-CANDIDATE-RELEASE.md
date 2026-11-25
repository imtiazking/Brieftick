# Staging candidate release host

## Problem

Clerk Playwright profiles are bound to `https://staging-app.forgeniq.com`. Temporary `*.vercel.app` preview URLs cannot reuse those sessions without bypassing security.

## Solution

| URL | Role |
| --- | --- |
| `https://staging-app.forgeniq.com` | Official staging (production target on `forgeniq-platform-staging`) |
| `https://candidate-staging.forgeniq.com` | Pre-promotion candidate only; must not replace the official alias until checks pass |

Release flow:

1. Deploy preview archive.
2. Unauthenticated render smoke on the preview URL (Vercel OIDC).
3. `vercel alias <preview> candidate-staging.forgeniq.com` (official alias untouched).
4. Authenticated Playwright on `candidate-staging.forgeniq.com` using host-scoped session profiles.
5. Promote preview to the staging project production target.
6. Authenticated post-promotion smoke on `staging-app.forgeniq.com`.
7. On post-promotion failure, `vercel rollback <protectedDeploymentId>` (app only; no DB rollback).

## DNS (account owner — GoDaddy)

`staging-app` already uses a Vercel CNAME. Add the same pattern for the candidate host:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `candidate-staging` | Copy the target shown in Vercel → Project `forgeniq-platform-staging` → Domains → `candidate-staging.forgeniq.com` (same pattern as `12619729ea1a89b5.vercel-dns-017.com` used by `staging-app`) |

Verify:

```bash
vercel domains verify candidate-staging.forgeniq.com --scope imis-projects-8e15dca0
```

## Clerk (account owner — optional satellite sync)

**Without satellite:** sign in once per persona on the candidate host (separate session folder under `%LOCALAPPDATA%\forgeniq-uat-sessions\candidate-staging_forgeniq_com\`):

```bash
set FORGENIQ_AUTH_BASE=https://candidate-staging.forgeniq.com
node apps/platform/scripts/uat/staging-user-sessions.mjs login all
```

**With satellite (Clerk Pro + Enhanced authentication add-on):**

1. Clerk Dashboard → Domains → add `candidate-staging.forgeniq.com` as a satellite; primary remains `staging-app.forgeniq.com`.
2. Add Clerk DNS CNAME for the satellite domain per Clerk instructions.
3. On Vercel staging project, set `NEXT_PUBLIC_CLERK_CANDIDATE_SATELLITE=1` and `FORGENIQ_CANDIDATE_HOST=candidate-staging.forgeniq.com`.
4. Middleware will use `isSatellite: true` and `satelliteAutoSync: true` only on the candidate host.

Do not copy cookies between domains. Do not disable MFA.

## Interim fallback (DNS not ready)

If `candidate-staging` does not resolve, the deploy script can use `FORGENIQ_RELEASE_PREAUTH=promote-verify`:

1. Promote after offline gates and unauthenticated preview smoke only.
2. Run authenticated smoke on `staging-app.forgeniq.com`.
3. Roll back the app alias if that smoke fails.

This is documented as interim; pre-promotion authenticated candidate testing remains the target once DNS exists.