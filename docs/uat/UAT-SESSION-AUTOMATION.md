# UAT session automation (Users A, B and C)

## Storage (never in git)

| Location | Purpose |
| --- | --- |
| `%LOCALAPPDATA%\forgeniq-uat-sessions\persona-{A,B,C}` | Legacy **official staging** Playwright profiles |
| `%LOCALAPPDATA%\forgeniq-uat-sessions\candidate-staging_forgeniq_com\persona-*` | **Candidate host** profiles (separate cookies per hostname) |
| `%LOCALAPPDATA%\forgeniq-uat-sessions\session-registry.json` | Validation metadata only (user ids, roles, timestamps — no secrets) |
| `%LOCALAPPDATA%\forgeniq-uat-sessions\uat-agent.env` | Local-only Clerk automation credentials (optional, never commit) |

Existing profiles are **preserved**. Deployment changes do not delete profiles. Sessions are revalidated with `/api/ri-lab/session` before every UAT run.

## Automatic flow (no login windows by default)

1. **Reuse** saved profile on the active host when `/api/ri-lab/session` returns the expected user, organisation and capabilities.
2. If invalid, attempt **Clerk sign-in token** (backend) when `FORGENIQ_HOSTED_CLERK_SECRET_KEY` or `CLERK_SECRET_KEY` is in `uat-agent.env`.
3. Else attempt **`@clerk/testing` password** sign-in when `FORGENIQ_UAT_USER_{A,B,C}_EMAIL` and `_PASSWORD` are in `uat-agent.env`.
4. Interactive login runs only when `FORGENIQ_UAT_ALLOW_INTERACTIVE_LOGIN=1` or `--interactive`.

## One-time owner setup (unattended candidate + refresh)

Create `%LOCALAPPDATA%\forgeniq-uat-sessions\uat-agent.env`:

```env
# Must be sk_live_* for the same Clerk instance as staging-app (pk_live_*). sk_test_* will not mint tokens for production UAT user ids.
FORGENIQ_HOSTED_CLERK_SECRET_KEY=
# Optional password fallback (only if sign-in tokens are disabled).
# FORGENIQ_UAT_USER_A_EMAIL=
# FORGENIQ_UAT_USER_A_PASSWORD=
# ...
```

Vercel CLI cannot inject Production **secret** values into local `vercel env run` on this project; local `uat-agent.env` is the supported agent credential surface.

## Hosting capacity

Until Vercel Hobby CPU headroom returns:

- Prefer **local** `orchestrator --mode=promote` and `uat-session-recover.mjs` (no deploy).
- Batch **one** `phase85h` deploy per tranche; default **15 min** throttle (`FORGENIQ_STAGING_DEPLOY_MIN_MS`).
- Avoid `vercel env run` hosted smokes except inside an authorised deploy; unauthenticated preview smokes burn build + function time.
- See `docs/eval/VERCEL-RESOURCE-AUDIT-2026-11-23.md` (deploy cadence, PDF cache, poll backoff, paid AI deferral).

## Commands

```bash
node apps/platform/scripts/uat/staging-user-sessions.mjs recover
node apps/platform/scripts/uat/staging-user-sessions.mjs preflight A,B,C
set FORGENIQ_AUTH_BASE=https://candidate-staging.forgeniq.com
node apps/platform/scripts/uat/staging-user-sessions.mjs preflight A,B,C
```

## Safeguards

- `CLERK_NOT_CONFIGURED` on a hostname is a **deployment** issue (Preview env without Clerk keys), not session expiry.
- No cookie copy between `staging-app` and `candidate-staging`.
- MFA on a test user blocks programmatic sign-in with `MFA_REQUIRED` (security not weakened).

## Integration

`requireUatPersonas` → `ensureUatPersonas` runs before authenticated smoke, QA `promote` gate, and `phase85h` candidate auth.