# Staging session regression — 2026-11-24

## Last successful authentication evidence

| Persona | Last `session_established` (attribution log) | Last `session_verified` (hosted automation) |
|--------|---------------------------------------------|---------------------------------------------|
| **B** | 2026-11-22T21:56:42Z | 2026-11-24T13:15:09Z |
| **C** | 2026-11-22T21:57:04Z | 2026-11-24T10:46:02Z (15/15 E2E) |
| **A** | 2026-11-23T22:33:20Z | 2026-11-24T14:18:44Z |
| **OP1** | 2026-11-23T18:57:25Z | 2026-11-24T14:18:44Z (same profile family as A) |

Source: `%LOCALAPPDATA%\forgeniq-uat-sessions\attribution.log`, `docs/uat/HOSTED-DESIGN-LAB-E2E-WORKFLOW-2026-11-24.json`.

## Root cause

**Clerk session cookie expiry** in Playwright persistent profiles — not an API or RBAC regression.

- Headless `diagnose` and `openSignInPage` return HTTP 200 and `window.Clerk` loads.
- `runAs` / `GET /api/ri-lab/session` returns **401** when the profile no longer holds a valid Clerk session.
- Playwright reuses **saved browser cookies**; there is no supported non-interactive token refresh in this toolchain without Clerk **Machine** / **Testing tokens** (not configured here).

## Blank headed login window (fixed locally, commit `5ce604a` + this tranche)

Previously: navigate to `about:blank`, weak `redirect_url`, optional system Chrome channel, no wait for Clerk → appeared blank.

Now: full `redirect_url` to Design Lab dashboard, `waitUntil: 'load'`, wait for `window.Clerk`, default bundled Chromium.

## Configuration drift check

| Area | Prior (working) | Current |
|------|-----------------|---------|
| Staging origin | `https://staging-app.forgeniq.com` | Unchanged |
| Clerk | Hosted Clerk on sign-in | Unchanged (`diagnose` Clerk OK) |
| Profiles | `%LOCALAPPDATA%\forgeniq-uat-sessions\persona-{A,B,C}` | Unchanged paths and user IDs |
| Segregation of duties | A maker / B reviewer / C approver | Unchanged in `PERSONAS` |

No Clerk instance or staging deploy change required to restore sessions.

## Required operator action (single gate)

```text
node apps/platform/scripts/uat/staging-user-sessions.mjs renew B
node apps/platform/scripts/uat/staging-user-sessions.mjs renew A
```

Complete Clerk sign-in in the opened window; leave the browser open until **“session saved”** prints. Avoid `login --fresh` unless the profile is corrupt (wipes cookies).

Then:

```text
node apps/platform/scripts/uat/staging-user-sessions.mjs status
node apps/platform/scripts/uat/staging-six-queue-triage.mjs
node apps/platform/scripts/uat/staging-six-queue-hosted-validation.mjs
```

## Hosted UAT blocked until refresh

Six-queue hosted validation and reassessment smoke failed with **401** after session expiry — expected until `renew` succeeds.

No staging redeploy required for auth recovery (tooling-only fixes).