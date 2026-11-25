# FORGENIQ QA execution contexts

Two gates share one catalogue (`apps/platform/scripts/qa/catalogue.mjs`).

## Offline CI (`--mode=ci`)

GitHub Actions and local offline checks. **No Clerk profiles, production secrets, or staging promotion.**

| Gate | Includes |
|------|----------|
| `ci` | Design Lab static/binding, offline Playwright smoke (local HTTP server), acceptance tests, **RLS migration contract** (static SQL), SoD, migration scan, Clerk **contract** (offline), candidate isolation **regression** (static) |

Hosted-only rows are **not** selected. Exit **0** only when every mandatory `ci` row is **PASS**.

`--mode=release` is an alias for `--mode=ci` (backward compatible).

## Candidate release (`--mode=promote`)

Required before `phase85h` promotes official staging. **Mandatory hosted and authenticated checks.**

| Gate | Includes |
|------|----------|
| `ci` | Full offline suite |
| `candidate` | Session recovery (A/B/C), live Clerk host readiness, live deployment inspect |
| `authenticated` | Authenticated Design Lab browser smoke |
| `security` | Embedded Postgres RLS and cross-tenant denial (local DB fixtures) |

Missing sessions → **AUTH_BLOCKED** / **BLOCKED** → promotion **BLOCKED** (exit 2), never faked PASS.

`FORGENIQ_QA_REQUIRE_DB=1` is set automatically for promote.

## Environment

| Variable | CI | Promote |
|----------|----|---------|
| `FORGENIQ_QA_REQUIRE_DB` | `1` in workflow | set by orchestrator |
| `FORGENIQ_QA_REQUIRE_CANDIDATE` | — | `1` during session recovery |
| `FORGENIQ_REQUIRE_CANDIDATE_ISOLATION` | — | `1` in `phase85h` only |

Credentials remain in `%LOCALAPPDATA%\forgeniq-uat-sessions\` (never uploaded).