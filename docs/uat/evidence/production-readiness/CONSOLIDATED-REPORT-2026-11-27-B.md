# Consolidated staging report (2026-11-27 tranche B)

**Base commit:** `3134992` (prior staging deploy `dpl_Fom4o2RmJHMnALQ4Fp3o1owwnxJS` @ `b6cf181` build). **This tranche not yet redeployed** (MOCI cert bundling pending).

## Defects resolved (engineering)

| ID | Fix |
|----|-----|
| RI-SHARED-SPEND | Root cause: durable guard failures (`AI_RUN_NOT_AUTHORISED` when ledger mode drifted) passed into `finalizeLabSpendAfterCall`, which then called missing `settleAttempt`. Hardened finalize for incomplete durable trackers; re-assert `RI_LAB_SPEND_LEDGER_MODE=legacy` in guard E2E. **PASS** shared-spend + run-scoped ledger. **CI 45/45 PASS.** |
| MOCI-SA hosted failures | Root cause: `mc-gov-sa-trust-chain.pem` not bundled on Vercel (`ENOENT` on scheduler). Added `includeFiles` + expanded Next trace for scheduler tick. **Fix unverified on host until redeploy.** |
| Connector evidence stale | Refreshed `staging-source-operations.json` from live staging query; rebuilt `REGULATOR-CONNECTOR-STATUS.json`. |

## Connector coverage (staging, 2026-11-27 ~00:35 UTC)

| Metric | Count |
|--------|------:|
| Catalogue sources | 41 |
| **INGESTED_CURRENT (72h)** | **38** |
| INGESTED_STALE | 0 |
| FAILING | 1 (`SRC-MOCI-SA-COMPANIES-LAW`) |
| CONNECTOR_DISABLED (scheduler allowlist) | 1 (`SRC-OFAC-SDN-LISTS`) |
| NO_CONNECTOR / not ingested | 1 (`SRC-CBUAE-DIGITAL-RULEBOOK` — ACCESS_RESTRICTED; no official automated path without partner feed) |

**Coverage notes:** `SRC-OFAC-REGULATORY-UPDATES` is current and covers regulatory actions; **SDN list ingestion is intentionally excluded** from hosted scheduler (sanctions list ≠ regulatory updates). CBUAE requires authorised feed / allow-listing — not bypassed.

## Unattended scheduler

| Kind | Since 2026-11-27 enable |
|------|-------------------------|
| `MANUAL_HOSTED` | **7** invocations (controlled ticks) |
| `VERCEL_CRON` | **0** (next scheduled slots 00:00/04:00/12:00/20:00 UTC; enable was after 00:00 tick) |

**Status:** Scheduler **enabled** on host; unattended operation **not yet evidenced** — monitor from **04:00 UTC** cron onward (`verify-hosted-cron-evidence.mjs` + `ingestion_operational_events`).

Paid AI: **`RI_AI_EXECUTION_ENABLED=false`** on staging project (unchanged).

## Publications / ingestion traceability

- **39** `ingestion_runs` in ~2h window after manual ticks (2026-11-27).
- Live freshness timestamps on **38** sources; publications ingested via connector runs (no new paid AI).
- AI-dependent triage stages remain **fixture/historical** unless explicitly authorised.

## Disconnected obligations

| Before | After this tranche |
|--------|-------------------|
| 18 DISCONNECTED | **18** (repair workflow not executed; 11 synthetic UAT + 7 legacy unchanged) |

## Hosted verification

| Check | Result |
|-------|--------|
| Sidebar navigation sweep | **32/32 PASS** (`hosted-sidebar-navigation-sweep.mjs`); Work → Notifications shows not-found (no `#inbox` route) — minor nav gap |
| Browser A/B/C (prior) | 34/34 |
| Stage 2 approval pin | Deployed; offline **74/74** atomic obligation tests |
| Cross-tenant | **BLOCKED** (second tenant not provisioned) |
| Notifications delivery | **NOT RUN** (tenant notifications not enabled) |

## CI / gates

| Gate | Result |
|------|--------|
| `qa:ci` (orchestrator `--mode=ci`) | **45/45 PASS** |
| RI-SHARED-SPEND | PASS |
| RI-RUN-SCOPED-LEDGER | PASS |

## Remaining external / commercial blockers

Regulatory expert sign-off; classification policy for non-FCA regulators; second-tenant provisioning; business UAT sign-off; production deployment approval; CBUAE authorised access; optional OFAC SDN policy decision; notifications product enablement.

## Outstanding engineering (before go-live)

1. **Deploy** cert bundling fix; confirm MOCI success on host.
2. **Prove VERCEL_CRON** after 04:00 UTC (or next cron window).
3. **Repair 11** synthetic UAT obligations (hosted maker-checker).
4. Dedicated sidebar: fix Notifications hash route; optional chart removal on registers.
5. Hosted security regression (RPC pin smuggling) on promoted build.
6. Notification harness on staging.
7. GitHub Actions on new commit + candidate-first deploy from final SHA.